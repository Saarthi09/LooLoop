/* Browser speech-to-text for the questionnaire.

   The browser turns speech into text. The existing local interpreter then
   converts that text into the same filters used by the manual questions.
   No audio is uploaded and no AI model or API key is involved. */

import { interpret } from "./interpret.js?v=30";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

export const canListenInBrowser = () => Boolean(SpeechRecognition);

export function createVoice({ onPhase = () => {} } = {}) {
  let recognition = null;

  async function fromText(text, context) {
    onPhase("thinking");
    const reading = interpret(text, context);
    onPhase("idle");
    return { reading, transcript: text, mode: "local" };
  }

  function listenInBrowser() {
    return new Promise((resolve, reject) => {
      if (!SpeechRecognition) {
        reject(new Error("unsupported"));
        return;
      }

      const listener = new SpeechRecognition();
      listener.lang = "en-CA";
      listener.continuous = false;
      listener.interimResults = true;
      listener.maxAlternatives = 1;

      let transcript = "";
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };

      listener.onresult = (event) => {
        let latest = "";
        for (let index = event.resultIndex; index < event.results.length; index++) {
          latest += event.results[index][0].transcript;
        }
        transcript = latest || transcript;
      };

      listener.onerror = (event) => {
        const reason =
          event.error === "not-allowed"
            ? "blocked"
            : event.error === "no-speech"
              ? "no-speech"
              : event.error === "network"
                ? "sr-network"
                : "sr";
        finish(reject, new Error(reason));
      };

      listener.onend = () => {
        recognition = null;
        const result = transcript.trim();
        result
          ? finish(resolve, result)
          : finish(reject, new Error("no-speech"));
      };

      recognition = listener;
      try {
        listener.start();
        onPhase("listening");
      } catch {
        recognition = null;
        finish(reject, new Error("sr"));
      }
    });
  }

  function stopBrowser() {
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // The recognizer was already stopping.
    }
  }

  function reset() {
    stopBrowser();
    recognition = null;
    onPhase("idle");
  }

  return {
    fromText,
    listenInBrowser,
    stopBrowser,
    listeningInBrowser: () => Boolean(recognition),
    reset,
  };
}

export const micTrouble = (reason) =>
  reason === "blocked"
    ? "The microphone is blocked. Allow it from the address bar, or type below."
    : reason === "no-speech"
      ? "Did not catch that. Try again, or type below."
      : reason === "sr-network"
        ? "Speech recognition needs an internet connection. Type below instead."
        : reason === "unsupported"
          ? "This browser does not support speech recognition. Type below instead."
          : "Could not start speech recognition. Try again, or type below.";
