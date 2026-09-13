import {
  loadEvents, SEED_USER, estimateTravel, geocode, similarity,
  INTERESTS, CIRCUMSTANCES, BUDGETS, SCOPES, ART_PALETTES, QUICK_PLACES
} from "./data.js";
import { createRadial, stateOf, fmtClock, SPANS } from "./radial.js";

/* Single state object. Every handler mutates state, then calls render(). */
const state = {
  status: "loading",
  error: null,
  events: [],
  screen: "wizard",          // wizard | results
  step: 0,
  origin: { ...SEED_USER.origin },
  travelSource: "feed",      // feed | estimated
  geo: { busy: false, note: null },
  spanId: "evening",
  selectedId: null,
  hoverId: null,
  showRuled: false,
  reflow: "stagger",         // stagger | live, set by the control that moved
  filters: {
    windowStart: 18.5,
    windowEnd: 21,
    maxTravel: SEED_USER.maxTravelMinutes,
    budget: SEED_USER.budget,
    scope: SEED_USER.scope,
    circumstances: [],
    interests: []
  }
};

const span = () => SPANS[state.spanId];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const budgetMax = (id) => (BUDGETS.find((b) => b.id === id) || BUDGETS[3]).max;
const labelOf = (list, id) => (list.find((x) => x.id === id) || {}).label || id;
const toggled = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const has = (e, c) => e.circumstances.includes(c);

/* ---- derived --------------------------------------------------------- */

const hourOf = (iso) => {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
};

const travelFor = (e) =>
  state.travelSource === "feed" ? e.travelMinutes : (estimateTravel(state.origin, e) ?? e.travelMinutes);

function decorate(events, f) {
  return events.map((e) => {
    const h = hourOf(e.startsAt);
    const endHour = hourOf(e.endsAt);
    const travel = travelFor(e);
    const duration = Math.max(0, endHour - h) * 60;
    return {
      ...e,
      hour: h,
      endHour,
      travelMinutes: travel,
      durationMin: Math.round(duration),
      totalMinutes: Math.round(duration + travel * 2),
      backBy: (endHour + travel / 60) % 24,
      inWindow: h >= f.windowStart && h <= f.windowEnd,
      reachable: travel <= f.maxTravel,
      passes: f.circumstances.every((c) => e.circumstances.includes(c)) &&
        e.price <= budgetMax(f.budget) &&
        (f.scope !== "campus" || e.scope === "campus")
    };
  }).sort((a, b) => a.hour - b.hour || a.travelMinutes - b.travelMinutes);
}

const isMatch = (e) => e.passes && e.inWindow && e.reachable;
const inSpan = (e) => e.hour >= span().start && e.hour <= span().end;

const countWith = (f) => decorate(state.events, f)
  .filter((e) => isMatch(e) && (state.screen === "wizard" || inSpan(e))).length;
const withPatch = (patch) => ({ ...state.filters, ...patch });

function chipCount(kind, value, on) {
  const f = state.filters;
  /* Interests score rather than filter, so "how many would survive" is
     always the same number. Count what is actually close to them instead. */
  if (kind === "tag") {
    return decorate(state.events, f)
      .filter((e) => isMatch(e) && (state.screen === "wizard" || inSpan(e)))
      .filter((e) => e.tags.some((t) => similarity(value, t) >= 0.5))
      .length;
  }
  const patch = kind === "budget" ? { budget: value }
    : kind === "scope" ? { scope: value, maxTravel: (SCOPES.find((x) => x.id === value) || {}).minutes }
      : { circumstances: on ? f.circumstances : [...f.circumstances, value] };
  return countWith(withPatch(patch));
}

/* ---- how well this answers what was asked for ------------------------ */

function interestFit(e) {
  const want = state.filters.interests;
  let best = 0, near = 0;
  for (const w of want) {
    let s = 0;
    for (const t of e.tags) s = Math.max(s, similarity(w, t));
    best = Math.max(best, s);
    if (s >= 0.5) near++;
  }
  /* Mostly the closest single hit, partly how much of the ask it covers. */
  return 0.8 * best + 0.2 * (near / want.length);
}

function timeFit(e) {
  if (e.inWindow) return 1;
  const f = state.filters;
  const out = e.hour < f.windowStart ? f.windowStart - e.hour : e.hour - f.windowEnd;
  return Math.max(0, 1 - out / 3);
}

const travelFit = (e) =>
  Math.max(0, 1 - (e.travelMinutes / Math.max(1, state.filters.maxTravel)) * 0.85);

function moneyFit(e) {
  if (e.price === 0) return 1;
  const cap = budgetMax(state.filters.budget);
  if (cap === Infinity) return Math.max(0.2, 1 - e.price / 60);
  if (e.price <= cap) return 1 - (e.price / cap) * 0.35;
  return Math.max(0, 0.5 - (e.price - cap) / 40);
}

function circFit(e) {
  const want = state.filters.circumstances;
  if (!want.length) return 1;
  return want.filter((c) => has(e, c)).length / want.length;
}

/* A weighted blend, so "close to what you asked for" beats "exactly it,
   but you cannot get there". */
function matchPct(e) {
  const picked = state.filters.interests.length > 0;
  const parts = picked
    ? [[46, interestFit(e)], [16, timeFit(e)], [14, travelFit(e)], [12, moneyFit(e)], [12, circFit(e)]]
    : [[28, timeFit(e)], [26, travelFit(e)], [24, moneyFit(e)], [22, circFit(e)]];
  const total = parts.reduce((a, [w]) => a + w, 0);
  const value = parts.reduce((a, [w, v]) => a + w * v, 0) / total;
  return clamp(Math.round(value * 100), 4, 99);
}

/* ---- words ----------------------------------------------------------- */

const modeWord = (m) =>
  m === "walk" ? "on foot" : m === "transit" ? "on the bus" : m === "bike" ? "by bike" : "by car";

const costLine = (e) =>
  e.price === 0 ? "Free" : has(e, "student-price") ? `$${e.price} student` : `$${e.price}`;

function fmtDuration(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function perks(e) {
  const bits = [];
  if (e.price === 0) bits.push("costs nothing");
  else if (has(e, "student-price")) bits.push(`$${e.price} with a student card`);
  if (has(e, "free-food")) bits.push("food provided");
  if (has(e, "drop-in")) bits.push("no signup");
  if (has(e, "beginner-welcome")) bits.push("no experience needed");
  else if (has(e, "solo-friendly")) bits.push("fine on your own");
  bits.push(`${e.travelMinutes} minutes ${modeWord(e.travelMode)}`);
  const s = bits.slice(0, 4).join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

/* Ordered so the most explanatory reason wins, not the first true one. */
function why(e) {
  if (isMatch(e)) return "fits";
  if (state.filters.scope === "campus" && e.scope !== "campus") return "off campus";
  if (e.price > budgetMax(state.filters.budget)) return "over budget";
  if (!e.passes) return "ruled out";
  if (!e.reachable) return "too far";
  if (!e.inWindow) return "wrong time";
  return "ruled out";
}

function rank(e) {
  return matchPct(e) / 100
    + (e.price === 0 ? 0.12 : 0)
    + (has(e, "free-food") ? 0.08 : 0)
    + (has(e, "drop-in") ? 0.05 : 0)
    - e.travelMinutes * 0.004;
}

/* ---- event artwork ----------------------------------------------------
   A drawn motif per kind of thing, picked from the title first and the
   leading interest second, so a swim looks like a swim. Generated as an
   inline SVG, so there is nothing to load and nothing to fail. */

const W = 300, H = 190;

/* first match wins */
const MOTIF_RULES = [
  ["water",     /swim|lap swim|pool/i],
  ["boat",      /canoe|kayak|paddle|\brow\b|rowing/i],
  ["run",       /\brun\b|running|parkrun|\d+ ?k\b/i],
  ["bike",      /\bbike\b|bicycle|cycling|\bride\b|tune-up/i],
  ["skate",     /skate|skating/i],
  ["climb",     /climb|boulder/i],
  ["hoop",      /basketball|hoop/i],
  ["racket",    /badminton|tennis|ping pong|table tennis/i],
  ["pitch",     /soccer|frisbee|ultimate|volleyball|dodgeball/i],
  ["yoga",      /yoga|meditat|stretch/i],
  ["gym",       /\bgym\b|workout|weights/i],
  ["mic",       /open mic|karaoke/i],
  ["music",     /jazz|band|symphony|choir|concert|\bmusic\b|orchestra/i],
  ["film",      /movie|matinee|cinema|\bfilm\b|screening|documentary/i],
  ["stage",     /comedy|improv|theatre|theater|storytelling|performance/i],
  ["pottery",   /pottery|clay|ceramic|wheel/i],
  ["art",       /sketch|draw|paint|gallery|museum|exhibit|\bart\b/i],
  ["book",      /\bbook\b|library|reading|poetry|storytime|language exchange/i],
  ["telescope", /telescope|astronomy|\bstar|quantum/i],
  ["ai",        /machine learning|\bai\b|\bllm|language model|neural/i],
  ["code",      /\bgit\b|\bcode\b|coding|hack|software|developer/i],
  ["career",    /resume|co-op|career|\bjob\b|interview/i],
  ["startup",   /startup|founder|pitch|entrepreneur|velocity/i],
  ["garden",    /garden|cleanup|shoreline|planting|weeding/i],
  ["market",    /market|stall|swap|thrift|vendor/i],
  ["coffee",    /coffee|breakfast|study hall|\bcafe\b/i],
  ["food",      /lunch|dinner|dim sum|ramen|pizza|\bfood\b|bubble tea|cooking|eat/i],
  ["dice",      /trivia|\bgame|board game|chess|quiz/i],
  ["trail",     /trail|\bwalk\b|hike|tour|park/i],
  ["people",    /meetup|welcome|social|\bfair\b|club|exchange|drop.?in/i]
];

const TAG_MOTIF = {
  music: "music", sports: "pitch", tech: "code", "ai-ml": "ai",
  career: "career", startups: "startup", arts: "art", academic: "talk",
  research: "telescope", social: "people", wellness: "yoga",
  outdoors: "trail", food: "food", games: "dice"
};

function motifKey(e) {
  const hay = `${e.title} ${e.venue}`;
  for (const [key, re] of MOTIF_RULES) if (re.test(hay)) return key;
  return TAG_MOTIF[e.tags[0]] || "talk";
}

/* Each motif draws on a 300x190 field with three palette colours:
   p[0] is the ground, p[1] the subject, p[2] the detail. */
const MOTIFS = {
  water: (p) => `
    <circle cx="150" cy="66" r="26" fill="${p[1]}"/>
    <rect x="96" y="96" width="108" height="13" rx="6" fill="${p[1]}"/>
    ${wave(p[2], 120)}${wave(p[1], 146)}${wave(p[2], 172)}`,

  boat: (p) => `
    <path d="M70 108 L230 108 L206 140 L94 140 Z" fill="${p[1]}"/>
    <rect x="146" y="48" width="8" height="60" fill="${p[2]}"/>
    <path d="M154 52 L200 92 L154 92 Z" fill="${p[2]}"/>
    ${wave(p[2], 158)}${wave(p[1], 176)}`,

  run: (p) => `
    <circle cx="163" cy="46" r="17" fill="${p[1]}"/>
    <path d="M150 70 L186 84 L170 112 L196 146" stroke="${p[1]}" stroke-width="13" fill="none" stroke-linecap="round"/>
    <path d="M170 112 L128 134" stroke="${p[1]}" stroke-width="13" fill="none" stroke-linecap="round"/>
    <path d="M152 78 L112 66" stroke="${p[2]}" stroke-width="11" fill="none" stroke-linecap="round"/>
    <rect x="36" y="86" width="52" height="9" rx="4" fill="${p[2]}"/>
    <rect x="22" y="112" width="70" height="9" rx="4" fill="${p[2]}"/>
    <rect x="44" y="138" width="44" height="9" rx="4" fill="${p[2]}"/>`,

  bike: (p) => `
    <circle cx="82" cy="126" r="38" fill="none" stroke="${p[1]}" stroke-width="11"/>
    <circle cx="218" cy="126" r="38" fill="none" stroke="${p[1]}" stroke-width="11"/>
    <path d="M82 126 L132 126 L166 66 L196 126" stroke="${p[2]}" stroke-width="9" fill="none" stroke-linejoin="round"/>
    <path d="M132 126 L150 66" stroke="${p[2]}" stroke-width="9" fill="none"/>
    <rect x="112" y="58" width="46" height="9" rx="4" fill="${p[2]}"/>`,

  skate: (p) => `
    <path d="M96 66 L96 120 Q96 134 112 134 L206 134" stroke="${p[1]}" stroke-width="14" fill="none" stroke-linecap="round"/>
    <rect x="88" y="146" width="128" height="9" rx="4" fill="${p[2]}"/>
    <circle cx="118" cy="150" r="4" fill="${p[1]}"/>
    <circle cx="188" cy="150" r="4" fill="${p[1]}"/>
    ${snow(p[2], 44, 52)}${snow(p[2], 232, 74)}${snow(p[2], 68, 100)}`,

  climb: (p) => `
    <rect x="52" y="30" width="196" height="130" rx="8" fill="${p[1]}"/>
    ${[[86,62],[146,50],[206,78],[104,110],[176,126],[136,150]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="${p[2]}"/>`).join("")}
    <path d="M248 30 L248 160" stroke="${p[2]}" stroke-width="7"/>`,

  hoop: (p) => `
    <rect x="170" y="34" width="86" height="60" rx="5" fill="${p[1]}"/>
    <rect x="192" y="56" width="42" height="30" fill="${p[2]}"/>
    <path d="M186 94 L240 94 L232 120 L194 120 Z" fill="${p[2]}"/>
    <circle cx="92" cy="120" r="40" fill="${p[1]}"/>
    <path d="M52 120 h80 M92 80 v80 M64 92 Q92 120 64 148 M120 92 Q92 120 120 148"
      stroke="${p[0]}" stroke-width="5" fill="none"/>`,

  racket: (p) => `
    <ellipse cx="116" cy="72" rx="42" ry="52" fill="none" stroke="${p[1]}" stroke-width="12"/>
    <path d="M116 30 v84 M74 72 h84 M92 36 v72 M140 36 v72 M80 52 h72 M80 92 h72"
      stroke="${p[2]}" stroke-width="3"/>
    <rect x="110" y="120" width="13" height="50" rx="6" fill="${p[1]}"/>
    <circle cx="212" cy="118" r="20" fill="${p[2]}"/>`,

  pitch: (p) => `
    <rect x="30" y="42" width="240" height="112" rx="6" fill="none" stroke="${p[1]}" stroke-width="7"/>
    <path d="M150 42 v112" stroke="${p[1]}" stroke-width="7"/>
    <circle cx="150" cy="98" r="26" fill="none" stroke="${p[1]}" stroke-width="7"/>
    <circle cx="150" cy="98" r="15" fill="${p[2]}"/>
    <rect x="30" y="72" width="26" height="52" fill="none" stroke="${p[1]}" stroke-width="7"/>
    <rect x="244" y="72" width="26" height="52" fill="none" stroke="${p[1]}" stroke-width="7"/>`,

  yoga: (p) => `
    <circle cx="150" cy="52" r="18" fill="${p[1]}"/>
    <path d="M150 76 L150 116" stroke="${p[1]}" stroke-width="13" stroke-linecap="round"/>
    <path d="M150 92 L104 106 M150 92 L196 106" stroke="${p[1]}" stroke-width="11" stroke-linecap="round"/>
    <path d="M96 138 Q150 108 204 138 Z" fill="${p[1]}"/>
    <rect x="64" y="146" width="172" height="10" rx="5" fill="${p[2]}"/>`,

  gym: (p) => `
    <rect x="64" y="86" width="172" height="16" rx="8" fill="${p[2]}"/>
    <rect x="40" y="64" width="26" height="60" rx="6" fill="${p[1]}"/>
    <rect x="234" y="64" width="26" height="60" rx="6" fill="${p[1]}"/>
    <rect x="70" y="74" width="20" height="40" rx="5" fill="${p[1]}"/>
    <rect x="210" y="74" width="20" height="40" rx="5" fill="${p[1]}"/>`,

  mic: (p) => `
    <rect x="132" y="32" width="36" height="66" rx="18" fill="${p[1]}"/>
    <path d="M110 90 a40 40 0 0 0 80 0" fill="none" stroke="${p[1]}" stroke-width="10"/>
    <path d="M150 130 v26" stroke="${p[1]}" stroke-width="10"/>
    <path d="M118 160 h64" stroke="${p[1]}" stroke-width="10" stroke-linecap="round"/>
    <path d="M84 52 a52 52 0 0 0 0 76 M216 52 a52 52 0 0 1 0 76"
      stroke="${p[2]}" stroke-width="7" fill="none" stroke-linecap="round"/>`,

  music: (p) => `
    <rect x="42" y="46" width="74" height="98" rx="8" fill="${p[1]}"/>
    <circle cx="79" cy="102" r="22" fill="${p[0]}"/>
    <circle cx="79" cy="102" r="9" fill="${p[2]}"/>
    <circle cx="79" cy="68" r="8" fill="${p[2]}"/>
    <circle cx="176" cy="132" r="19" fill="${p[2]}"/>
    <circle cx="240" cy="118" r="19" fill="${p[2]}"/>
    <path d="M195 132 V52 L259 40 v78" stroke="${p[2]}" stroke-width="9" fill="none"/>
    <path d="M195 74 L259 62" stroke="${p[2]}" stroke-width="9"/>`,

  film: (p) => `
    <rect x="36" y="40" width="228" height="86" rx="6" fill="${p[1]}"/>
    <rect x="52" y="54" width="196" height="58" fill="${p[0]}"/>
    <path d="M128 68 L168 83 L128 98 Z" fill="${p[2]}"/>
    <rect x="118" y="126" width="64" height="10" fill="${p[2]}"/>
    <path d="M76 166 L224 166 L196 138 L104 138 Z" fill="${p[2]}"/>`,

  stage: (p) => `
    <path d="M30 30 h240 v22 h-240 z" fill="${p[2]}"/>
    <path d="M42 52 q26 60 0 110 h-12 V52 z" fill="${p[1]}"/>
    <path d="M258 52 q-26 60 0 110 h12 V52 z" fill="${p[1]}"/>
    <circle cx="150" cy="96" r="26" fill="${p[2]}"/>
    <path d="M150 122 L110 162 h80 z" fill="${p[2]}"/>`,

  pottery: (p) => `
    <path d="M112 52 q38 -16 76 0 l-10 42 q12 22 -6 40 q-22 16 -44 0 q-18 -18 -6 -40 z" fill="${p[1]}"/>
    <ellipse cx="150" cy="150" rx="76" ry="16" fill="${p[2]}"/>
    <rect x="144" y="134" width="12" height="22" fill="${p[2]}"/>`,

  art: (p) => `
    <rect x="44" y="34" width="150" height="120" rx="5" fill="${p[1]}"/>
    <rect x="60" y="50" width="118" height="88" fill="${p[0]}"/>
    <circle cx="96" cy="80" r="15" fill="${p[2]}"/>
    <path d="M60 138 L112 86 L146 122 L168 100 L178 138 Z" fill="${p[2]}"/>
    <rect x="224" y="40" width="16" height="76" rx="8" fill="${p[2]}"/>
    <path d="M224 116 h16 l-8 36 z" fill="${p[1]}"/>`,

  book: (p) => `
    <path d="M150 56 q-44 -22 -104 -10 v96 q60 -12 104 10 z" fill="${p[1]}"/>
    <path d="M150 56 q44 -22 104 -10 v96 q-60 -12 -104 10 z" fill="${p[2]}"/>
    <path d="M150 56 v96" stroke="${p[0]}" stroke-width="7"/>`,

  talk: (p) => `
    <rect x="146" y="30" width="118" height="80" rx="5" fill="${p[1]}"/>
    <path d="M162 92 h86 M162 74 h86 M162 56 h52" stroke="${p[0]}" stroke-width="7"/>
    <circle cx="80" cy="56" r="18" fill="${p[2]}"/>
    <path d="M56 88 h48 l12 72 h-72 z" fill="${p[2]}"/>
    <rect x="52" y="120" width="72" height="8" fill="${p[1]}"/>`,

  code: (p) => `
    <rect x="38" y="36" width="224" height="118" rx="8" fill="${p[1]}"/>
    <rect x="38" y="36" width="224" height="22" rx="8" fill="${p[2]}"/>
    <circle cx="56" cy="47" r="5" fill="${p[0]}"/>
    <circle cx="72" cy="47" r="5" fill="${p[0]}"/>
    <path d="M74 82 L54 102 L74 122 M132 82 L152 102 L132 122" stroke="${p[0]}"
      stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M168 122 L200 82" stroke="${p[2]}" stroke-width="9" stroke-linecap="round"/>
    <rect x="168" y="132" width="70" height="8" rx="4" fill="${p[0]}"/>`,

  ai: (p) => `
    ${[[70,52],[70,138],[150,95],[230,52],[230,138],[150,32],[150,158]]
      .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === 2 ? 20 : 13}" fill="${i === 2 ? p[2] : p[1]}"/>`).join("")}
    <path d="M70 52 L150 95 L70 138 M230 52 L150 95 L230 138 M150 32 L150 158"
      stroke="${p[1]}" stroke-width="5" fill="none"/>`,

  career: (p) => `
    <rect x="60" y="66" width="180" height="96" rx="8" fill="${p[1]}"/>
    <path d="M118 66 v-14 q0 -10 10 -10 h44 q10 0 10 10 v14" fill="none" stroke="${p[1]}" stroke-width="11"/>
    <rect x="60" y="100" width="180" height="12" fill="${p[2]}"/>
    <rect x="134" y="94" width="32" height="24" rx="4" fill="${p[2]}"/>`,

  startup: (p) => `
    <path d="M150 28 q34 34 34 74 h-68 q0 -40 34 -74 z" fill="${p[1]}"/>
    <circle cx="150" cy="82" r="14" fill="${p[0]}"/>
    <path d="M116 102 l-24 26 h34 z M184 102 l24 26 h-34 z" fill="${p[2]}"/>
    <path d="M138 122 q12 26 24 0 q-12 34 -24 0 z" fill="${p[2]}"/>
    <rect x="120" y="152" width="60" height="8" rx="4" fill="${p[2]}"/>`,

  telescope: (p) => `
    <rect x="96" y="52" width="120" height="34" rx="16" fill="${p[1]}" transform="rotate(-22 156 69)"/>
    <path d="M140 104 L118 158 M152 100 L188 156" stroke="${p[2]}" stroke-width="10" stroke-linecap="round"/>
    ${[[54,44],[240,38],[70,120],[256,104],[44,88]]
      .map(([x, y]) => star(p[2], x, y)).join("")}`,

  garden: (p) => `
    <path d="M150 160 V80" stroke="${p[1]}" stroke-width="12"/>
    <path d="M150 100 q-44 -10 -54 -46 q42 -4 54 46 z" fill="${p[1]}"/>
    <path d="M150 116 q44 -10 54 -46 q-42 -4 -54 46 z" fill="${p[2]}"/>
    <rect x="70" y="158" width="160" height="10" rx="5" fill="${p[2]}"/>`,

  market: (p) => `
    <path d="M40 76 h220 v-16 h-220 z" fill="${p[2]}"/>
    ${[0, 1, 2, 3, 4].map((i) => `<path d="M${40 + i * 44} 76 q22 26 44 0 z" fill="${i % 2 ? p[1] : p[2]}"/>`).join("")}
    <rect x="56" y="104" width="188" height="12" rx="6" fill="${p[1]}"/>
    <rect x="72" y="116" width="14" height="46" fill="${p[1]}"/>
    <rect x="214" y="116" width="14" height="46" fill="${p[1]}"/>
    <circle cx="124" cy="94" r="10" fill="${p[1]}"/>
    <circle cx="156" cy="94" r="10" fill="${p[1]}"/>`,

  coffee: (p) => `
    <path d="M78 70 h112 v46 q0 34 -34 34 h-44 q-34 0 -34 -34 z" fill="${p[1]}"/>
    <path d="M190 84 h18 q20 0 20 20 t-20 20 h-18" fill="none" stroke="${p[1]}" stroke-width="11"/>
    <rect x="66" y="156" width="136" height="10" rx="5" fill="${p[2]}"/>
    <path d="M108 52 q10 -14 0 -26 M134 52 q10 -14 0 -26 M160 52 q10 -14 0 -26"
      stroke="${p[2]}" stroke-width="7" fill="none" stroke-linecap="round"/>`,

  food: (p) => `
    <path d="M64 96 h172 q0 56 -86 56 t-86 -56 z" fill="${p[1]}"/>
    <rect x="52" y="88" width="196" height="12" rx="6" fill="${p[2]}"/>
    <path d="M196 34 L236 74 M212 30 L250 68" stroke="${p[2]}" stroke-width="9" stroke-linecap="round"/>
    <path d="M104 70 q10 -16 0 -30 M136 70 q10 -16 0 -30" stroke="${p[2]}" stroke-width="7" fill="none" stroke-linecap="round"/>`,

  dice: (p) => `
    <rect x="44" y="60" width="98" height="98" rx="14" fill="${p[1]}"/>
    ${[[72,88],[114,88],[72,130],[114,130],[93,109]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="${p[0]}"/>`).join("")}
    <rect x="160" y="36" width="88" height="88" rx="12" fill="${p[2]}" transform="rotate(14 204 80)"/>
    <circle cx="204" cy="80" r="10" fill="${p[0]}"/>
    <circle cx="176" cy="54" r="8" fill="${p[0]}"/>
    <circle cx="232" cy="106" r="8" fill="${p[0]}"/>`,

  trail: (p) => `
    <path d="M0 160 L88 62 L146 160 Z" fill="${p[1]}"/>
    <path d="M120 160 L200 70 L280 160 Z" fill="${p[2]}"/>
    <circle cx="238" cy="48" r="22" fill="${p[2]}"/>
    <path d="M0 160 h300 v18 h-300 z" fill="${p[1]}"/>`,

  people: (p) => `
    <circle cx="88" cy="62" r="22" fill="${p[1]}"/>
    <path d="M46 158 q0 -46 42 -46 t42 46 z" fill="${p[1]}"/>
    <circle cx="180" cy="54" r="18" fill="${p[2]}"/>
    <path d="M144 140 q0 -38 36 -38 t36 38 z" fill="${p[2]}"/>
    <circle cx="246" cy="76" r="16" fill="${p[1]}"/>
    <path d="M214 158 q0 -34 32 -34 t32 34 z" fill="${p[1]}"/>`
};

const wave = (c, y) =>
  `<path d="M-10 ${y} q30 -14 60 0 t60 0 t60 0 t60 0 t60 0" stroke="${c}" stroke-width="9" fill="none" stroke-linecap="round"/>`;

const snow = (c, x, y) =>
  `<path d="M${x - 9} ${y} h18 M${x} ${y - 9} v18 M${x - 7} ${y - 7} l14 14 M${x + 7} ${y - 7} l-14 14" stroke="${c}" stroke-width="4"/>`;

const star = (c, x, y) =>
  `<path d="M${x} ${y - 9} l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3 z" fill="${c}"/>`;

const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const artCache = new Map();

function artFor(e) {
  if (artCache.has(e.id)) return artCache.get(e.id);
  const pal = (ART_PALETTES[e.tags[0]] || ART_PALETTES.social).map((n) => cssVar(`--${n}`));
  const draw = MOTIFS[motifKey(e)] || MOTIFS.talk;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    `<rect width="${W}" height="${H}" fill="${pal[0]}"/>${draw(pal)}</svg>`;
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  artCache.set(e.id, uri);
  return uri;
}

/* ---- elements -------------------------------------------------------- */

const el = {
  wizard: document.getElementById("wizard"),
  stepCount: document.getElementById("step-count"),
  stepQ: document.getElementById("step-q"),
  stepHint: document.getElementById("step-hint"),
  stepLiveN: document.getElementById("step-live-n"),
  stepLiveT: document.getElementById("step-live-t"),
  stepDots: document.getElementById("step-dots"),
  stepBody: document.getElementById("step-body"),
  stepBack: document.getElementById("step-back"),
  stepNext: document.getElementById("step-next"),
  stepSkip: document.getElementById("step-skip"),

  results: document.getElementById("results"),
  standfirst: document.getElementById("standfirst"),
  spans: document.getElementById("spans"),
  legend: document.getElementById("legend"),
  wrap: document.getElementById("canvas-wrap"),
  svg: document.getElementById("radial"),
  tip: document.getElementById("tip"),
  cardsH: document.getElementById("cards-h"),
  cardsSub: document.getElementById("cards-sub"),
  cards: document.getElementById("cards"),
  empty: document.getElementById("empty"),
  rail: document.getElementById("rail")
};

const radial = createRadial(el.svg, {
  onSelect: (id) => {
    state.selectedId = state.selectedId === id ? null : id;
    render();
  },
  onHover: (id) => {
    state.hoverId = id;
    renderTip();
  }
});

let revealing = false;
let revealTimer = null;

/* ---- the questions --------------------------------------------------- */

const toTimeValue = (h) => {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

const fromTimeValue = (v) => {
  const [hh, mm] = String(v).split(":").map(Number);
  return Number.isFinite(hh) ? hh + (mm || 0) / 60 : null;
};

const STEPS = [
  {
    id: "place",
    q: "Where are you starting from?",
    hint: "Every travel time on the next screens is measured from here.",
    body: () => `
      <p class="ask-origin" id="w-origin"></p>
      <div class="find">
        <input type="search" id="w-place" placeholder="Street and city" aria-label="Search a place">
        <button type="button" class="btn" id="w-find">Find</button>
      </div>
      <button type="button" class="btn btn-wide" id="w-geo">Use my location</button>
      <p class="ask-note" id="w-geo-note"></p>
      <p class="ask-sub">Or pick a spot:</p>
      <div class="chips">${QUICK_PLACES.map((q) => `
        <button type="button" class="chip" data-kind="place" data-value="${q.id}" aria-pressed="false">
          <span>${esc(q.label)}</span></button>`).join("")}</div>`
  },
  {
    id: "interests",
    q: "What are you into?",
    hint: "Pick a few. Things close to what you pick still show up, scored lower.",
    body: () => `<div class="chips chips-big">${INTERESTS.map((i) => chipHTML("tag", i.id, i.label)).join("")}</div>`
  },
  {
    id: "budget",
    q: "What can you spend tonight?",
    hint: "Most of what's on is free. This is the one that rules out the most.",
    body: () => `<div class="chips chips-big">${BUDGETS.map((b) => chipHTML("budget", b.id, b.label)).join("")}</div>`
  },
  {
    id: "time",
    q: "When are you free?",
    hint: "The gap between finishing work and wanting to sleep.",
    body: () => `
      <div class="times">
        <label class="time"><span>From</span><input type="time" id="w-from" value="${toTimeValue(state.filters.windowStart)}"></label>
        <label class="time"><span>Until</span><input type="time" id="w-to" value="${toTimeValue(state.filters.windowEnd)}"></label>
      </div>`
  },
  {
    id: "scope",
    q: "How far will you go?",
    hint: "This sets the travel limit. You can stretch it on the results.",
    body: () => `<div class="chips chips-big">${SCOPES.map((s) => chipHTML("scope", s.id, s.label)).join("")}</div>`
  },
  {
    id: "needs",
    q: "Anything we should know?",
    hint: "Only the things that would stop you turning up.",
    body: () => `<div class="chips chips-big">${CIRCUMSTANCES.map((c) => chipHTML("circ", c.id, c.label)).join("")}</div>`
  }
];

function chipHTML(kind, value, label) {
  return `<button type="button" class="chip" data-kind="${kind}" data-value="${value}" aria-pressed="false">
    <span>${esc(label)}</span><span class="chip-n"></span>
  </button>`;
}

function mountWizard() {
  el.stepDots.innerHTML = STEPS
    .map((s, i) => `<button type="button" class="step-dot" data-step="${i}" title="${esc(s.q)}"><span class="sr">${esc(s.q)}</span></button>`)
    .join("");

  el.stepDots.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-step]");
    if (!b) return;
    state.step = Number(b.dataset.step);
    renderStep();
  });

  el.stepBack.addEventListener("click", () => {
    if (state.step === 0) return;
    state.step -= 1;
    renderStep();
  });

  el.stepNext.addEventListener("click", () => {
    if (state.step >= STEPS.length - 1) return enterResults();
    state.step += 1;
    renderStep();
  });

  el.stepSkip.addEventListener("click", enterResults);

  el.stepBody.addEventListener("click", (ev) => {
    const chip = ev.target.closest(".chip");
    if (!chip) return;
    const { kind, value } = chip.dataset;
    if (kind === "place") return pickPlace(value);
    if (kind === "budget") state.filters.budget = value;
    else if (kind === "scope") setScope(value);
    else if (kind === "tag") state.filters.interests = toggled(state.filters.interests, value);
    else if (kind === "circ") state.filters.circumstances = toggled(state.filters.circumstances, value);
    updateStep();
  });
}

let builtStep = -1;

function renderStep() {
  const s = STEPS[state.step];
  el.stepCount.textContent = `Question ${state.step + 1} of ${STEPS.length}`;
  el.stepQ.textContent = s.q;
  el.stepHint.textContent = s.hint;
  el.stepBack.disabled = state.step === 0;
  el.stepNext.textContent = state.step === STEPS.length - 1 ? "Show me what's on" : "Next";
  el.stepSkip.hidden = state.step === STEPS.length - 1;

  /* Rebuilding on every render would wipe whatever is being typed. */
  if (builtStep !== state.step) {
    el.stepBody.innerHTML = s.body();
    wireStep(s);
    builtStep = state.step;
    const first = el.stepBody.querySelector("button, input");
    if (first) first.focus({ preventScroll: true });
  }
  updateStep();
}

function wireStep(s) {
  if (s.id === "place") {
    const go = () => findPlace(el.stepBody.querySelector("#w-place").value);
    el.stepBody.querySelector("#w-find").addEventListener("click", go);
    el.stepBody.querySelector("#w-place").addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      go();
    });
    el.stepBody.querySelector("#w-geo").addEventListener("click", useMyLocation);
  }
  if (s.id === "time") {
    const from = el.stepBody.querySelector("#w-from");
    const to = el.stepBody.querySelector("#w-to");
    from.addEventListener("change", () => {
      const v = fromTimeValue(from.value);
      if (v == null) return;
      state.filters.windowStart = Math.min(v, state.filters.windowEnd - 0.25);
      fitSpan();
      updateStep();
    });
    to.addEventListener("change", () => {
      const v = fromTimeValue(to.value);
      if (v == null) return;
      state.filters.windowEnd = Math.max(v, state.filters.windowStart + 0.25);
      fitSpan();
      updateStep();
    });
  }
}

function updateStep() {
  const f = state.filters;

  el.stepBody.querySelectorAll(".chip").forEach((chip) => {
    const { kind, value } = chip.dataset;
    if (kind === "place") {
      chip.classList.toggle("is-on", state.origin.label === (QUICK_PLACES.find((q) => q.id === value) || {}).label);
      return;
    }
    const on = kind === "budget" ? f.budget === value
      : kind === "scope" ? f.scope === value
        : kind === "tag" ? f.interests.includes(value)
          : f.circumstances.includes(value);
    chip.setAttribute("aria-pressed", String(on));
    chip.classList.toggle("is-on", on);
    chip.querySelector(".chip-n").textContent = chipCount(kind, value, on);
  });

  const origin = el.stepBody.querySelector("#w-origin");
  if (origin) origin.textContent = state.origin.label;
  const note = el.stepBody.querySelector("#w-geo-note");
  if (note) note.textContent = state.geo.busy ? "Looking that up." : (state.geo.note || "");

  const n = countWith(f);
  el.stepLiveN.textContent = n;
  el.stepLiveT.textContent = n === 1
    ? `thing matches so far, out of ${state.events.length}`
    : `things match so far, out of ${state.events.length}`;

  [...el.stepDots.children].forEach((d, i) => {
    d.classList.toggle("is-on", i === state.step);
    d.classList.toggle("is-done", i < state.step);
  });
}

function setScope(id) {
  state.filters.scope = id;
  const s = SCOPES.find((x) => x.id === id);
  if (s) state.filters.maxTravel = s.minutes;
}

/* Keep the axis wide enough to contain the window the user just chose. */
function fitSpan() {
  const f = state.filters;
  const s = span();
  if (f.windowStart < s.start || f.windowEnd > s.end) state.spanId = "day";
}

function enterResults() {
  state.screen = "results";
  revealing = true;
  el.svg.classList.add("is-live", "is-reveal");
  render();
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => {
    revealing = false;
    el.svg.classList.remove("is-reveal");
    render();
  }, 950);
}

function editAnswers(step = 0) {
  state.screen = "wizard";
  state.step = step;
  builtStep = -1;
  state.hoverId = null;
  render();
}

/* ---- location -------------------------------------------------------- */

function pickPlace(id) {
  const q = QUICK_PLACES.find((x) => x.id === id);
  if (!q) return;
  state.origin = { lat: q.lat, lng: q.lng, label: q.label };
  state.travelSource = q.id === "phillip" ? "feed" : "estimated";
  state.geo = { busy: false, note: null };
  state.weather = null;
  state.reflow = "stagger";
  render();
}

async function findPlace(query) {
  const q = String(query || "").trim();
  if (!q) return;
  state.geo = { busy: true, note: null };
  render();
  try {
    state.origin = await geocode(q);
    state.travelSource = "estimated";
    state.geo = { busy: false, note: null };
  } catch (err) {
    state.geo = {
      busy: false,
      note: err.message === "no match"
        ? "No place by that name. Try a street and city."
        : "The place lookup is not answering. Try another place, or carry on with the published times."
    };
  }
  state.reflow = "stagger";
  render();
}

async function useMyLocation() {
  if (!navigator.geolocation) {
    state.geo = { busy: false, note: "This browser will not share a location. Pick a spot instead." };
    render();
    return;
  }

  /* A permission that is already refused never prompts and, in some
     browsers, never calls back either. Say so rather than spinning. */
  try {
    const st = await navigator.permissions?.query({ name: "geolocation" });
    if (st && st.state === "denied") {
      state.geo = {
        busy: false,
        note: "Location is blocked for this page. Allow it in the address bar, or pick a spot below."
      };
      render();
      return;
    }
  } catch (err) { /* not supported everywhere; fall through and just ask */ }

  state.geo = { busy: true, note: null };
  render();

  let settled = false;
  const watchdog = setTimeout(() => {
    if (settled) return;
    settled = true;
    state.geo = { busy: false, note: "The browser never answered. Pick a spot below instead." };
    render();
  }, 12000);

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      /* Coordinates stay in the page. Nothing is sent anywhere to name them. */
      state.origin = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        label: "Where you are now"
      };
      state.travelSource = "estimated";
      state.geo = { busy: false, note: null };
      state.weather = null;
      state.reflow = "stagger";
      render();
    },
    (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      state.geo = {
        busy: false,
        note: err.code === err.PERMISSION_DENIED
          ? "Location is blocked for this page. Allow it in the address bar, or pick a spot below."
          : "Could not get a fix. Pick a spot below instead."
      };
      render();
    },
    { timeout: 10000, maximumAge: 300000 }
  );
}

/* ---- results --------------------------------------------------------- */

function mountResults() {
  el.spans.innerHTML = Object.values(SPANS)
    .map((s) => `<button type="button" class="seg" data-span="${s.id}" aria-pressed="false">${s.label}</button>`)
    .join("");

  el.spans.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-span]");
    if (!b) return;
    state.spanId = b.dataset.span;
    state.reflow = "stagger";
    const s = SPANS[state.spanId];
    state.filters.windowStart = clamp(state.filters.windowStart, s.start, s.end - 0.25);
    state.filters.windowEnd = clamp(state.filters.windowEnd, state.filters.windowStart + 0.25, s.end);
    render();
  });

  el.legend.innerHTML = `
    <span class="key"><svg class="key-dot" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" class="is-match"></circle></svg>fits</span>
    <span class="key"><svg class="key-dot" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" class="is-late"></circle></svg>wrong time</span>
    <span class="key"><svg class="key-dot" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" class="is-out"></circle></svg>ruled out</span>`;

  el.cards.addEventListener("click", (ev) => {
    const more = ev.target.closest("#show-ruled");
    if (more) {
      state.showRuled = !state.showRuled;
      render();
      return;
    }
    const card = ev.target.closest(".card");
    if (!card) return;
    state.selectedId = state.selectedId === card.dataset.id ? null : card.dataset.id;
    render();
  });

  el.cards.addEventListener("mouseover", (ev) => {
    const card = ev.target.closest(".card");
    if (card) state.hoverId = card.dataset.id;
  });
}

function mountRail() {
  el.rail.innerHTML = `
    <div class="rail-head">
      <p class="rail-count" id="count">0</p>
      <p class="rail-note" id="count-note"></p>
    </div>

    <div class="answers">
      <div class="answers-top">
        <h2 class="answers-h">Your answers</h2>
        <button type="button" class="btn btn-ghost" id="edit-all">Edit</button>
      </div>
      <dl class="answers-list" id="answers-list"></dl>
    </div>

    <div class="tune">
      <h2 class="rail-h">Fine tune</h2>
      <div class="rail-top">
        <span class="rail-cap">Free window</span>
        <span class="rail-val" id="window-val"></span>
      </div>
      <label class="slider">
        <span class="slider-cap">Start</span>
        <input type="range" id="win-start" step="0.25">
      </label>
      <label class="slider">
        <span class="slider-cap">End</span>
        <input type="range" id="win-end" step="0.25">
      </label>
      <div class="rail-top">
        <span class="rail-cap">Max travel</span>
        <span class="rail-val" id="travel-val"></span>
      </div>
      <label class="slider">
        <span class="slider-cap">Minutes</span>
        <input type="range" id="travel" min="5" max="60" step="1">
      </label>
    </div>`;

  const q = (s) => el.rail.querySelector(s);
  rail = {
    count: q("#count"), countNote: q("#count-note"), list: q("#answers-list"),
    windowVal: q("#window-val"), travelVal: q("#travel-val"),
    winStart: q("#win-start"), winEnd: q("#win-end"), travel: q("#travel")
  };

  q("#edit-all").addEventListener("click", () => editAnswers(0));

  rail.list.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-goto]");
    if (b) editAnswers(Number(b.dataset.goto));
  });

  rail.winStart.addEventListener("input", () => {
    state.filters.windowStart = Math.min(Number(rail.winStart.value), state.filters.windowEnd - 0.25);
    state.reflow = "live";
    render();
  });
  rail.winEnd.addEventListener("input", () => {
    state.filters.windowEnd = Math.max(Number(rail.winEnd.value), state.filters.windowStart + 0.25);
    state.reflow = "live";
    render();
  });
  rail.travel.addEventListener("input", () => {
    state.filters.maxTravel = Number(rail.travel.value);
    state.reflow = "live";
    render();
  });
}

let rail = null;

function updateRail(items) {
  const f = state.filters;
  const s = span();
  const shown = items.filter(inSpan);

  rail.count.textContent = shown.filter(isMatch).length;
  rail.countNote.textContent = s.start === 0 && s.end === 24
    ? `fit somewhere in the day, out of ${shown.length}.`
    : `fit between ${fmtClock(s.start)} and ${fmtClock(s.end)}, out of ${shown.length} on then.`;

  const intoLabels = f.interests.map((i) => labelOf(INTERESTS, i));
  const needLabels = f.circumstances.map((c) => labelOf(CIRCUMSTANCES, c));

  rail.list.innerHTML = [
    ["From", esc(state.origin.label), 0],
    ["Into", intoLabels.length ? esc(intoLabels.join(", ")) : "anything", 1],
    ["Spend", esc(labelOf(BUDGETS, f.budget)), 2],
    ["Free", `${fmtClock(f.windowStart)} to ${fmtClock(f.windowEnd)}`, 3],
    ["Range", esc(labelOf(SCOPES, f.scope)), 4],
    ["Needs", needLabels.length ? esc(needLabels.join(", ")) : "nothing in particular", 5]
  ].map(([k, v, step]) => `<div class="answer">
      <dt>${k}</dt>
      <dd>${v}</dd>
      <button type="button" class="link link-deep" data-goto="${step}">change</button>
    </div>`).join("");

  rail.windowVal.textContent = `${fmtClock(f.windowStart)} to ${fmtClock(f.windowEnd)}`;
  rail.travelVal.textContent = `${f.maxTravel} min`;

  [rail.winStart, rail.winEnd].forEach((input) => {
    input.min = s.start;
    input.max = s.end;
  });
  if (document.activeElement !== rail.winStart) rail.winStart.value = f.windowStart;
  if (document.activeElement !== rail.winEnd) rail.winEnd.value = f.windowEnd;
  if (document.activeElement !== rail.travel) rail.travel.value = f.maxTravel;
}

/* ---- cards ----------------------------------------------------------- */

function renderCards(shown) {
  const matches = shown.filter(isMatch)
    .sort((a, b) => matchPct(b) - matchPct(a) || rank(b) - rank(a));
  const ruled = shown.filter((e) => !isMatch(e)).sort((a, b) => a.hour - b.hour);

  el.cardsH.textContent = matches.length
    ? (matches.length === 1 ? "The one thing that fits" : `${matches.length} things that fit`)
    : "Nothing fits yet";
  el.cardsSub.textContent = matches.length
    ? "Best first. Everything here is inside your window, your budget and your travel limit."
    : "Loosen one answer and they come back.";

  const cards = matches.map((e, i) => cardHTML(e, i === 0)).join("");
  const more = ruled.length
    ? `<button type="button" class="show-more" id="show-ruled">
        ${state.showRuled ? "Hide" : "Show"} the ${ruled.length} we ruled out
       </button>`
    : "";
  const rest = state.showRuled ? ruled.map((e) => cardHTML(e, false)).join("") : "";

  el.cards.innerHTML = cards + (more ? `<div class="cards-more">${more}</div>` : "") + rest;
}

function cardHTML(e, lead) {
  const pct = matchPct(e);
  const out = !isMatch(e);
  return `<article class="card${lead ? " is-lead" : ""}${out ? " is-out" : ""}${e.id === state.selectedId ? " is-sel" : ""}"
    data-id="${e.id}" tabindex="0" role="button" aria-label="${esc(e.title)}, ${pct} percent match">
    <div class="card-art">
      <img src="${artFor(e)}" alt="" loading="lazy">
      <span class="pct">${pct}<span class="pct-u">%</span></span>
      ${out ? `<span class="card-flag">${why(e)}</span>` : ""}
    </div>
    <div class="card-body">
      <p class="card-when"><strong>${fmtClock(e.hour)}</strong> <span>to ${fmtClock(e.endHour)}</span></p>
      <h3 class="card-title">${esc(e.title)}</h3>
      <p class="card-venue">${esc(e.venue)}</p>
      <p class="card-desc">${esc(e.description || "")}</p>
      <dl class="card-facts">
        <div><dt>Costs</dt><dd><strong>${costLine(e)}</strong></dd></div>
        <div><dt>Getting there</dt><dd><strong>${e.travelMinutes} min</strong> ${modeWord(e.travelMode)}</dd></div>
        <div><dt>Back by</dt><dd><strong>${fmtClock(e.backBy)}</strong></dd></div>
      </dl>
    </div>
  </article>`;
}

/* ---- hover text ------------------------------------------------------ */

function renderTip() {
  if (state.screen === "results" && state.hoverId) {
    const e = decorate(state.events, state.filters).find((x) => x.id === state.hoverId);
    const dot = e && radial.dots.get(e.id);
    if (e && dot && stateOf(e, span()) !== "off") {
      showTip(e, dot);
      return;
    }
  }
  el.tip.hidden = true;
}

function showTip(e, dot) {
  const pct = matchPct(e);
  el.tip.innerHTML = `
    <img class="tip-art" src="${artFor(e)}" alt="">
    <div class="tip-body">
      <div class="tip-top">
        <span class="tip-title">${esc(e.title)}</span>
        <span class="pct pct-flat">${pct}<span class="pct-u">%</span></span>
      </div>
      <p class="tip-venue">${esc(e.venue)}</p>
      <p class="tip-desc">${esc(e.description || "")}</p>
      <dl class="tip-grid">
        <dt>Time</dt><dd><strong>${fmtClock(e.hour)}</strong> to <strong>${fmtClock(e.endHour)}</strong></dd>
        <dt>Getting there</dt><dd><strong>${e.travelMinutes} min</strong> ${modeWord(e.travelMode)}</dd>
        <dt>Costs</dt><dd><strong>${costLine(e)}</strong></dd>
        <dt>Gone for</dt><dd><strong>${fmtDuration(e.totalMinutes)}</strong>, back by <strong>${fmtClock(e.backBy)}</strong></dd>
      </dl>
      <p class="tip-why">${why(e)}</p>
    </div>`;
  el.tip.hidden = false;

  const wrap = el.wrap.getBoundingClientRect();
  const r = dot.getBoundingClientRect();
  const w = el.tip.offsetWidth;
  const h = el.tip.offsetHeight;
  const x = r.left + r.width / 2 - wrap.left;
  const above = r.top - wrap.top - h - 12;
  el.tip.style.left = `${clamp(x - w / 2, 4, Math.max(4, wrap.width - w - 4))}px`;
  el.tip.style.top = `${above < 0 ? r.bottom - wrap.top + 12 : above}px`;
}

/* ---- render ---------------------------------------------------------- */

function render() {
  if (state.status === "loading") return;
  if (state.status === "error") {
    el.wizard.hidden = true;
    el.results.hidden = false;
    el.standfirst.textContent = `The listings did not load. ${state.error}. Reload to try again.`;
    return;
  }

  const onWizard = state.screen === "wizard";
  el.wizard.hidden = !onWizard;
  el.results.hidden = onWizard;

  if (onWizard) {
    renderStep();
    return;
  }

  const items = decorate(state.events, state.filters);
  const shown = items.filter(inSpan);
  const matches = shown.filter(isMatch);

  el.standfirst.textContent = state.selectedId
    ? describeSelected(items)
    : matches.length === 1
      ? "One thing you can get to, afford, and be back from."
      : `${matches.length} things you can get to, afford, and be back from.`;

  [...el.spans.children].forEach((b) => {
    const on = b.dataset.span === state.spanId;
    b.setAttribute("aria-pressed", String(on));
    b.classList.toggle("is-on", on);
  });

  el.empty.hidden = matches.length > 0;
  el.svg.classList.toggle("is-live-drag", state.reflow === "live" && !revealing);

  radial.update({
    items,
    span: span(),
    windowStart: state.filters.windowStart,
    windowEnd: state.filters.windowEnd,
    maxTravel: state.filters.maxTravel,
    originLabel: state.origin.label,
    delay: delayFor(items)
  });

  renderCards(shown);
  renderTip();
  updateRail(items);
}

/* Reveal orders by radius, reflow orders by index, drags do not stagger. */
function delayFor(items) {
  if (revealing) {
    const byTravel = [...items].sort((a, b) => a.travelMinutes - b.travelMinutes).map((e) => e.id);
    return (p) => `${500 + Math.min(byTravel.indexOf(p.e.id) * 5, 120)}ms`;
  }
  if (state.reflow === "live") return () => "0ms";
  return (p, i) => `${Math.min(i * 9, 440)}ms`;
}

function describeSelected(items) {
  const e = items.find((x) => x.id === state.selectedId);
  if (!e) return "";
  return `${e.title}, ${e.venue}, ${fmtClock(e.hour)}. ${perks(e)}`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ---- boot ------------------------------------------------------------ */

loadEvents()
  .then((events) => {
    state.events = events;
    state.status = "ready";
    mountWizard();
    mountResults();
    mountRail();
    render();
  })
  .catch((err) => {
    state.error = err.message;
    state.status = "error";
    render();
  });

window.addEventListener("resize", renderTip);
