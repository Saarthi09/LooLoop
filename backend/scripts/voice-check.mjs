/* Does the voice reader work?   node backend/scripts/voice-check.mjs
   Add your own sentence:        node backend/scripts/voice-check.mjs "im broke and bored"
   Text only, so it proves the key and the reading without a microphone. */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { interpretWithGemini } from "../services/gemini-reader.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, "..", ".env") });

const key = process.env.GEMINI_API_KEY;
const said = process.argv.slice(2).join(" ") ||
  "im broke and a bit lonely, free after seven, walking distance from campus";
const d = new Date();
const pad = (n) => String(n).padStart(2, "0");
const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

if (!key) { console.error("\n  No GEMINI_API_KEY in backend/.env.\n"); process.exit(1); }
console.log(`\n  key       ${key.slice(0, 6)}... (${key.length} chars)`);
console.log(`  saying    "${said}"\n`);

const t0 = Date.now();
try {
  const { reading, transcript } = await interpretWithGemini({
    apiKey: key, text: said, today, now: d.getHours(), place: "Phillip & Columbia, Waterloo"
  });
  console.log(`  OK in ${Date.now() - t0}ms`);
  if (transcript && transcript !== said) console.log(`  heard     ${transcript}`);
  console.log(`  said      ${reading.said.join(" | ") || "-"}`);
  console.log(`  interests ${Object.entries(reading.weights).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v.toFixed(2)}`).join(", ") || "none"}`);
  console.log(`  keywords  ${reading.keywords.join(", ") || "-"}`);
  console.log(`  needs     ${reading.circumstances.join(", ") || "- (filters nothing)"}`);
  console.log(`  budget    ${reading.budget ?? "- (any)"}`);
  console.log(`  window    ${reading.windowStart ?? "-"} to ${reading.windowEnd ?? "-"}`);
  console.log(`  travel    ${reading.maxTravel ?? "- (any distance)"}`);
  console.log(`  place     ${reading.place ?? "-"}`);
  console.log(`\n  Every "-" is a field nobody spoke about, and filters nothing.\n`);
} catch (error) {
  console.error(`\n  FAILED after ${Date.now() - t0}ms`);
  console.error(`  ${error.message}`);
  if (error.status === 400 || error.status === 401 || error.status === 403) {
    console.error("  That status means the key was rejected. An AI Studio key looks like AIza...");
  }
  console.error("\n  The page still works: typed input falls back to js/interpret.js.\n");
  process.exit(1);
}
