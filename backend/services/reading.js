/* ---- what a spoken answer turns into ----------------------------------
   One shape, agreed between the browser, the local fallback parser and
   the model. Nothing else in the app needs to know which of the three
   produced it.

   The rule the shape exists to enforce: a field is null when the person
   did not say anything about it, and null means "any" - no filtering at
   all. Only what was actually said is allowed to rule an event out. */

export const INTEREST_IDS = [
  "music", "sports", "tech", "ai-ml", "career", "startups", "arts",
  "academic", "research", "social", "wellness", "outdoors", "food", "games"
];

export const CIRCUMSTANCE_IDS = [
  "free", "free-food", "student-price", "drop-in", "solo-friendly",
  "beginner-welcome", "no-alcohol", "quiet", "step-free", "transit-reachable"
];

export const BUDGET_IDS = ["free", "cheap", "moderate", "any"];
export const MODE_IDS = ["auto", "walk", "bike", "transit", "train", "drive"];
export const TRAVEL_MINUTES = [15, 30, 45, 60, 90];

export function emptyReading() {
  return {
    heard: "",
    weights: {},        /* interest id -> 0..1, how strongly they meant it */
    vetoes: {},         /* interest id -> 0..1, how firmly they ruled it out */
    circumstances: [],  /* stated requirements: these filter */
    prefers: [],        /* softer wishes: these only rank */
    keywords: [],       /* words to look for in the listings themselves */
    avoid: [],          /* words to push down */
    budget: null,
    date: null,
    windowStart: null,
    windowEnd: null,
    range: null,
    maxTravel: null,
    mode: null,
    place: null,
    placeSure: false,
    setting: null,
    said: [],           /* short phrases, read back so they can hear it landed */
    filled: [],
    broad: false,
    confidence: 0,
    source: "none"      /* gemini | local */
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const list = (v) => (Array.isArray(v) ? v : []);

const nearestTravel = (n) =>
  TRAVEL_MINUTES.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));

/* A model is asked for this shape but is never trusted to produce it. Every
   id is checked against the taxonomy, every number is clamped, and anything
   unrecognised is dropped rather than passed through to the filters. */
export function normalizeReading(raw, { heard = "", source = "gemini" } = {}) {
  const r = emptyReading();
  const j = raw && typeof raw === "object" ? raw : {};
  r.heard = heard;
  r.source = source;

  const weights = j.interests || j.weights || {};
  if (weights && typeof weights === "object") {
    for (const [id, v] of Object.entries(weights)) {
      if (!INTEREST_IDS.includes(id)) continue;
      const w = num(Number(v));
      if (w == null || w <= 0) continue;
      r.weights[id] = clamp(w > 1 ? w / 100 : w, 0, 1);
    }
  }

  for (const id of list(j.avoidInterests ?? j.vetoes)) {
    if (INTEREST_IDS.includes(id)) r.vetoes[id] = 0.9;
  }
  if (j.vetoes && !Array.isArray(j.vetoes) && typeof j.vetoes === "object") {
    for (const [id, v] of Object.entries(j.vetoes)) {
      if (INTEREST_IDS.includes(id)) r.vetoes[id] = clamp(Number(v) || 0.9, 0, 1);
    }
  }
  for (const id of Object.keys(r.vetoes)) delete r.weights[id];

  r.circumstances = list(j.needs ?? j.circumstances).filter((c) => CIRCUMSTANCE_IDS.includes(c));
  r.prefers = list(j.prefers).filter((c) => CIRCUMSTANCE_IDS.includes(c) && !r.circumstances.includes(c));

  const budget = str(j.budget, 12);
  if (budget && BUDGET_IDS.includes(budget)) r.budget = budget;

  const date = str(j.date, 10);
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) r.date = date;

  const ws = num(j.windowStart), we = num(j.windowEnd);
  if (ws != null) r.windowStart = clamp(ws, 0, 24);
  if (we != null) r.windowEnd = clamp(we, 0, 24);
  if (r.windowStart != null && r.windowEnd != null && r.windowEnd <= r.windowStart) {
    r.windowEnd = Math.min(24, r.windowStart + 3);
  }
  /* half an answer is still an answer: one end given, the other opens up */
  if (r.windowStart != null && r.windowEnd == null) r.windowEnd = 24;
  if (r.windowEnd != null && r.windowStart == null) r.windowStart = 0;

  const travel = num(j.maxTravel);
  if (travel != null && travel > 0) {
    r.maxTravel = nearestTravel(clamp(travel, 5, 240));
    r.range = `r${r.maxTravel}`;
  }

  const mode = str(j.mode, 10);
  if (mode && MODE_IDS.includes(mode) && mode !== "auto") r.mode = mode;

  const place = str(j.place, 80);
  if (place) { r.place = place; r.placeSure = j.placeSure !== false; }

  r.keywords = list(j.keywords).map((k) => str(k, 24)).filter(Boolean).slice(0, 12);
  r.avoid = list(j.avoid).map((k) => str(k, 24)).filter(Boolean).slice(0, 12);
  r.said = list(j.said).map((k) => str(k, 60)).filter(Boolean).slice(0, 8);

  r.filled = [
    r.budget != null && "budget",
    r.windowStart != null && "time",
    r.maxTravel != null && "range",
    r.circumstances.length > 0 && "needs",
    r.place != null && "place",
    (Object.keys(r.weights).length > 0 || r.keywords.length > 0) && "interests"
  ].filter(Boolean);

  const strength = Math.max(0, ...Object.values(r.weights), 0);
  r.broad = j.broad === true ? strength < 0.8 : strength < 0.5 && !r.keywords.length;
  r.confidence = clamp(
    (r.broad ? 0.25 : 0.45 * strength) + 0.12 * r.filled.length + 0.05 * Math.min(3, r.keywords.length),
    0.1, 0.98
  );
  return r;
}

/* Is there anything here worth using, or did it come back empty? */
export function hasSignal(r) {
  return Boolean(
    r && (Object.keys(r.weights || {}).length || r.keywords?.length ||
      r.budget || r.windowStart != null || r.maxTravel || r.place ||
      r.circumstances?.length || Object.keys(r.vetoes || {}).length)
  );
}

/* ---- what the model is told -------------------------------------------
   Vendor neutral on purpose: whoever reads the speech is handed this same
   brief, so changing provider is one import and nothing else. */

/* What the assistant is for. The taxonomy is spelled out because the ids
   have to come back exactly; the rules below are the product decisions,
   not phrasing preferences, so they are stated flatly. */
export function systemPrompt({ today, now, place }) {
  return `You turn what a student says into search filters for LooLoop, a page that shows what is on near them today.

Answer with JSON only. No prose, no markdown fence.

{
  "interests": { "<id>": 0.0-1.0 },
  "avoidInterests": ["<id>"],
  "needs": ["<circumstance>"],
  "prefers": ["<circumstance>"],
  "budget": "free" | "cheap" | "moderate" | "any" | null,
  "date": "YYYY-MM-DD" | null,
  "windowStart": 0-24 | null,
  "windowEnd": 0-24 | null,
  "maxTravel": 15 | 30 | 45 | 60 | 90 | null,
  "mode": "walk" | "bike" | "transit" | "train" | "drive" | null,
  "place": "<place name they mentioned>" | null,
  "keywords": ["<any word worth searching listing titles for>"],
  "broad": true | false,
  "said": ["<four words or fewer, what you understood, in their register>"]
}

interest ids: ${INTEREST_IDS.join(", ")}
circumstances: ${CIRCUMSTANCE_IDS.join(", ")}
budgets: ${BUDGET_IDS.join(", ")}
modes: ${MODE_IDS.filter((m) => m !== "auto").join(", ")}

THE RULES

1. Null means "they did not say". Every field they did not speak about must be
   null or empty. Null is later read as "any" and filters nothing. Never fill a
   field with a sensible guess: a guess silently hides events from them.

2. Weights, not tags. "chill" is not one category. It is wellness 0.8, arts 0.5,
   food 0.45. Give every category the phrase implies, at the strength it implies
   it. One phrase may set six.

3. Vague is normal and must still work. "i'm bored", "idk", "something fun" are
   complete answers. Set "broad": true, leave interests light or empty, and put
   nothing in the filtering fields. Never return an empty response because they
   were unspecific.

4. "needs" filters, "prefers" only ranks. A stated requirement is a need:
   "i don't drink" -> no-alcohol; "wheelchair" -> step-free; "no signup" ->
   drop-in. A mood is a preference: "chill" prefers quiet, it does not require
   it. When unsure, use prefers.

5. Refusals. "i hate sports" puts sports in avoidInterests, and does not touch
   the rest of the sentence. "not a huge crowd" is not a refusal, it is a need
   for quiet. "no money" is a budget, not a refusal.

6. keywords are for anything the taxonomy has no id for: dogs, canoe, resume,
   salsa, chess. Those get searched against listing titles and descriptions.
   Do not put category words or time or money words in keywords.

7. Time. Today is ${today} and it is currently ${now}:00 local. Resolve
   "tonight" (18-23), "after 7" (19-24), "before my 6pm class" (0-18),
   "tomorrow", weekday names, "the 18th", "18th of September", "6pm onwards"
   (18-24). A bare hour in an evening sentence means pm.

8. place is only a place they named, like "Vancouver" or "near Kitchener".
   ${place ? `They are currently starting from ${place}.` : ""} Do not invent one.

9. said is what you will be read back. Keep each entry short and in their own
   register: "free only", "meeting people", "after 7", "in Vancouver".`;
}
