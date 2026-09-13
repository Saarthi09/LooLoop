/* ---- voice.js -----------------------------------------------------------
   The microphone, and the one call that turns what was said into filters.

   The recording never touches a third party from here: it goes to our own
   /api/interpret/audio, and the server holds the Gemini key. Gemini
   transcribes it and reads it into filters in the same request, so one
   round trip covers both.

   Two things are always true, whatever the network is doing:
     - typing is a complete route in itself, and
     - if the server cannot answer a typed turn, js/interpret.js reads it
       here in the browser instead, so the page still moves.
   A recording has no such fallback, because without a transcriber there is
   nothing to read; that case says so plainly and points at the text box. */

import { interpret } from "./interpret.js?v=30";
import { API_BASE } from "./api.js?v=30";

/* Where the reading comes from.

   "local" is js/interpret.js, running here in the browser: no key, no
   account, no network, nothing billed, and it answers instantly. That is
   the default, and it is what the page is tuned against.

   "server" sends it to your own backend, which hands it to Gemini: one
   call transcribes the recording and reads it into filters, on the free
   tier. Better at odd phrasing, and it works in browsers with no speech
   recognition of their own. */
export const READER = "server";

export const canRecord = () =>
  Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

/* Chrome and Safari can transcribe without sending the audio anywhere that
   bills for it. This is the second route to a transcript, and it is free. */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListenInBrowser = () => Boolean(SR);

/* A provider that refuses on billing grounds is not a bug to hand back to
   the user: the transcript comes from the browser instead. */
export const isBillingRefusal = (err) =>
  err?.reason === "billing" ||
  /credit|billing|subscription|top ?up|balance|quota|payment/i.test(err?.message || "");

/* Chrome and Firefox give webm/opus, Safari gives mp4. Whatever it picks is
   sent as the Content-Type so the server can name the file correctly. */
const MIMES = [
  "audio/webm;codecs=opus", "audio/webm",
  "audio/ogg;codecs=opus", "audio/mp4", "audio/aac"
];
const pickMime = () =>
  MIMES.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "";

/* Anything under this is a slip of the finger, not a sentence. */
const MIN_MS = 350;
const MAX_MS = 30000;

export function createVoice({ onPhase = () => {} } = {}) {
  let stream = null;
  let rec = null;
  let chunks = [];
  let finished = null;
  let startedAt = 0;
  let autoStop = null;
  let threadId = null;
  let browserRec = null;

  function release() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    rec = null;
    clearTimeout(autoStop);
  }

  /* Resolves once the mic is actually open, so the button only turns red
     when it is really listening. Throws a named reason the page can word. */
  async function start() {
    if (!canRecord()) throw new Error("unsupported");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
    } catch (err) {
      release();
      throw new Error(err?.name === "NotAllowedError" ? "blocked" : "no-mic");
    }
    const mimeType = pickMime();
    rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks = [];
    finished = new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: rec?.mimeType || mimeType || "audio/webm" }));
    });
    rec.ondataavailable = (ev) => { if (ev.data?.size) chunks.push(ev.data); };
    rec.start();
    startedAt = Date.now();
    /* Nobody means to send five minutes of room noise. */
    autoStop = setTimeout(() => { if (rec?.state === "recording") rec.stop(); }, MAX_MS);
    onPhase("listening");
  }

  const recording = () => rec?.state === "recording";

  async function stop() {
    if (!rec || rec.state === "inactive") { release(); return null; }
    const held = Date.now() - startedAt;
    rec.stop();
    const blob = await finished;
    release();
    if (held < MIN_MS || !blob || blob.size < 1200) return null;
    return blob;
  }

  function cancel() {
    if (rec && rec.state !== "inactive") { rec.onstop = null; rec.stop(); }
    release();
    onPhase("idle");
  }

  function url(path, ctx) {
    const p = new URLSearchParams({ today: ctx.today, now: String(Math.round(ctx.now)) });
    if (threadId) p.set("threadId", threadId);
    if (ctx.place) p.set("place", ctx.place);
    return `${API_BASE}${path}?${p.toString()}`;
  }

  async function ask(path, init, ctx) {
    const r = await fetch(url(path, ctx), init);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(j.error || `The server said ${r.status}.`);
      /* 404 on this route means the running server predates it: it was
         started before the voice endpoints existed. */
      err.reason = r.status === 404 ? "stale-server" : (j.reason || "upstream");
      throw err;
    }
    if (j.threadId) threadId = j.threadId;
    return j;
  }

  /* A recording. One call: transcript and filters come back together. */
  async function fromAudio(blob, ctx) {
    onPhase("thinking");
    const j = await ask("/api/interpret/audio", {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm", Accept: "application/json" },
      body: blob
    }, ctx);
    onPhase("idle");
    return { reading: j.reading, transcript: j.transcript || "", mode: "gemini" };
  }

  /* Typed, or a retry. The server first, this browser's own parser if the
     server cannot answer, so a typed sentence always lands somewhere. */
  async function fromText(text, ctx) {
    if (READER === "local") {
      const reading = interpret(text, ctx);
      onPhase("idle");
      return { reading, transcript: text, mode: "local" };
    }
    onPhase("thinking");
    try {
      const j = await ask("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ text })
      }, ctx);
      onPhase("idle");
      return { reading: j.reading, transcript: j.transcript || text, mode: "gemini" };
    } catch (err) {
      onPhase("idle");
      return { reading: interpret(text, ctx), transcript: text, mode: "local", note: err.reason };
    }
  }

  /* One utterance from the browser's own recogniser, resolved as text. */
  function listenInBrowser() {
    return new Promise((resolve, reject) => {
      if (!SR) return reject(new Error("unsupported"));
      const rec2 = new SR();
      rec2.lang = "en-CA";
      rec2.continuous = false;
      rec2.interimResults = true;
      rec2.maxAlternatives = 1;
      let best = "";
      let settled = false;
      const done = (fn, v) => { if (!settled) { settled = true; fn(v); } };

      rec2.onresult = (ev) => {
        let interim = "", final = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
        }
        best = final || interim || best;
      };
      rec2.onerror = (ev) => done(reject, new Error(
        ev.error === "not-allowed" ? "blocked"
          : ev.error === "no-speech" ? "no-speech"
            : ev.error === "network" ? "sr-network" : ev.error || "sr"
      ));
      rec2.onend = () => {
        browserRec = null;
        return best.trim() ? done(resolve, best.trim()) : done(reject, new Error("no-speech"));
      };

      browserRec = rec2;
      try { rec2.start(); onPhase("listening"); }
      catch (err) { done(reject, new Error("sr")); }
    });
  }

  function stopBrowser() {
    if (browserRec) { try { browserRec.stop(); } catch (err) { /* already stopping */ } }
  }

  return {
    start, stop, cancel, recording, fromAudio, fromText, listenInBrowser, stopBrowser,
    listeningInBrowser: () => Boolean(browserRec),
    get threadId() { return threadId; },
    reset() { threadId = null; cancel(); }
  };
}

/* What to put on screen when the mic will not open. */
export const SPEECH_NOTE =
  "The server would not transcribe that, so this browser is doing the listening instead. What you say is still read the same way.";

export const micTrouble = (reason) =>
  reason === "blocked"
    ? "The microphone is blocked. Allow it from the address bar, or type it below."
    : reason === "no-speech"
      ? "Did not catch that. Try again, or type it below."
      : reason === "sr-network"
        ? "The recogniser needs a connection. Type it below instead."
        : reason === "unsupported"
          ? "This browser will not record. Type it below, it is understood exactly the same."
          : "No microphone found. Type it below instead.";
