/* ---- Gemini: the voice input ---------------------------------------------
   One call does both halves. Gemini takes the recording inline as base64
   alongside the instructions, transcribes it and answers with the filters
   as JSON, so there is no separate transcription step and nothing to bill
   for one. Text goes the same way, minus the audio part.

   Free tier keys come from aistudio.google.com. The model and the limits
   change; the model name is an env var for that reason.

   Docs: https://ai.google.dev/gemini-api/docs/audio */

import { normalizeReading, systemPrompt } from "./reading.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 15000;

/* Asking for a schema is worth more than asking nicely in the prompt: it
   comes back parseable or it does not come back. */
const schema = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING" },
    interests: { type: "OBJECT", properties: {} },
    avoidInterests: { type: "ARRAY", items: { type: "STRING" } },
    needs: { type: "ARRAY", items: { type: "STRING" } },
    prefers: { type: "ARRAY", items: { type: "STRING" } },
    budget: { type: "STRING" },
    date: { type: "STRING" },
    windowStart: { type: "NUMBER" },
    windowEnd: { type: "NUMBER" },
    maxTravel: { type: "NUMBER" },
    mode: { type: "STRING" },
    place: { type: "STRING" },
    keywords: { type: "ARRAY", items: { type: "STRING" } },
    broad: { type: "BOOLEAN" },
    said: { type: "ARRAY", items: { type: "STRING" } }
  },
  required: ["said", "broad"]
};

class GeminiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/* A field the person did not speak about must come back absent, not as an
   empty string or a zero: those would read as real answers downstream. */
function clean(j) {
  const out = { ...j };
  for (const [k, v] of Object.entries(out)) {
    if (v === "" || v === null) delete out[k];
  }
  if (out.budget && !["free", "cheap", "moderate", "any"].includes(out.budget)) delete out.budget;
  if (out.maxTravel === 0) delete out.maxTravel;
  if (out.place && /^(here|there|home|null|none|n\/a)$/i.test(out.place)) delete out.place;
  return out;
}

export async function interpretWithGemini({
  apiKey, audio, mimeType = "audio/webm", text, today, now, place
}) {
  if (!apiKey) throw new GeminiError("Gemini is not configured.", 503);
  if (!audio && !text) throw new GeminiError("Nothing to interpret.", 400);

  const instructions = `${systemPrompt({ today, now, place })}

${audio
  ? 'The audio attached is the person speaking. Transcribe it, put the transcript in "transcript", and read THAT into the fields.'
  : 'Read the message into the fields. Put it back verbatim in "transcript".'}`;

  const parts = [];
  if (audio) {
    parts.push({ inline_data: { mime_type: mimeType.split(";")[0], data: audio.toString("base64") } });
  }
  parts.push({ text: audio ? instructions : `${instructions}\n\nThey said: ${text}` });

  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  let payload;
  try {
    const r = await fetch(URL(MODEL), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: control.signal,
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.1
        }
      })
    });
    payload = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new GeminiError(payload.error?.message || `Gemini said ${r.status}.`, r.status);
    }
  } catch (err) {
    if (err.name === "AbortError") throw new GeminiError("Gemini took too long.", 504);
    throw err instanceof GeminiError ? err : new GeminiError(err.message, 502);
  } finally {
    clearTimeout(timer);
  }

  const body = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!body) throw new GeminiError("Gemini returned nothing usable.", 502);

  let parsed;
  try { parsed = JSON.parse(body); }
  catch (err) { throw new GeminiError("Gemini did not answer with JSON.", 502); }

  const transcript = String(parsed.transcript || text || "").trim();
  return {
    reading: normalizeReading(clean(parsed), { heard: transcript, source: "gemini" }),
    transcript,
    threadId: null
  };
}

export { GeminiError };
