import {
  loadEvents, SEED_USER, estimateTravel, distanceKm, geocode, suggestPlaces, similarity, fetchForecast, SAMPLE_FORECAST,
  INTERESTS, CIRCUMSTANCES, BUDGETS, RANGES, MODES, ART_PALETTES, QUICK_PLACES, TODAY, WANTED_DATE, isCalendarDate
} from "./data.js?v=29";
import { createRadial, stateOf, fmtClock, SPANS } from "./radial.js?v=29";
import { session, api, profileUrl, webUrl, ANSWERS_KEY, clearAnswers } from "./api.js?v=29";

/* Single state object. Every handler mutates state, then calls render(). */
const state = {
  status: "loading",
  error: null,
  events: [],
  feed: { live: false, note: "" },   // where the listings came from
  joining: null,             // event id with a circle request in flight
  circleNote: null,          // { id, text } shown under one card
  screen: "wizard",          // wizard | results
  step: 0,
  date: WANTED_DATE || TODAY, // the day being planned
  returnTo: null,            // "results" while editing one answer from the results
  clockFallback: false,      // true when the real clock is past the window and we pretend
  origin: { ...SEED_USER.origin },
  travelSource: "feed",      // feed | estimated
  geo: { busy: false, note: null },
  spanId: "evening",
  nowAuto: true,             // the clock, or a time the user scrubbed to
  clockPinned: false,        // "use the clock" was chosen; no pretending until the window changes
  nowManual: 19,
  weather: null,             // { sample, hours } once fetched
  weatherBusy: false,
  forceRain: false,          // show the ranking against a wet evening
  selectedId: null,
  hoverId: null,
  reflow: "stagger",         // stagger | live, set by the control that moved
  filters: {
    windowStart: 18.5,
    windowEnd: 21,
    maxTravel: SEED_USER.maxTravelMinutes,
    budget: SEED_USER.budget,
    range: SEED_USER.range,
    mode: SEED_USER.mode,
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

/* ---- the situation ---------------------------------------------------
   Two things about the moment change what gets recommended: what time
   it is, and what the weather is doing. Neither is a filter. They move
   events up and down the ranking and decide what is still catchable. */

const isToday = () => state.date === TODAY;

const localDay = (t = new Date()) =>
  `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;

const daysFrom = (d, n) => {
  const t = new Date(`${d}T12:00:00`);
  t.setDate(t.getDate() + n);
  return localDay(t);
};

const fmtDate = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

function nowHour() {
  if (!state.nowAuto) return state.nowManual;
  if (!isToday()) return 0;   /* another day: nothing has started or finished */
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

const forecast = () => (state.forceRain ? SAMPLE_FORECAST : state.weather);

function weatherAt(h) {
  const f = forecast();
  if (!f) return null;
  return f.hours[Math.floor(h) % 24] || null;
}

async function ensureWeather() {
  if (state.weather || state.weatherBusy) return;
  state.weatherBusy = true;
  try {
    state.weather = await fetchForecast(state.origin, state.date);
  } catch (err) {
    /* A demo on bad wifi still needs something to rank against. */
    state.weather = SAMPLE_FORECAST;
  }
  state.weatherBusy = false;
  render();
}

/* ---- derived --------------------------------------------------------- */

const hourOf = (iso) => {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
};

const travelFor = (e, f = state.filters) => {
  const mode = f.mode;
  if (mode && mode !== "auto") return estimateTravel(state.origin, e, mode) ?? e.travelMinutes;
  return state.travelSource === "feed" ? e.travelMinutes : (estimateTravel(state.origin, e) ?? e.travelMinutes);
};

function decorate(events, f) {
  const now = nowHour();
  return events.map((e) => {
    const h = hourOf(e.startsAt);
    let endHour = hourOf(e.endsAt);
    if (endHour < h) endHour += 24;   /* a live listing that runs past midnight */
    const travel = travelFor(e, f);
    const duration = Math.max(0, endHour - h) * 60;

    /* When you would have to walk out of the door, and what is left of
       it by the time you arrive. */
    const leaveBy = h - travel / 60;
    const arriveAt = Math.max(h, now + travel / 60);
    const over = now >= endHour;
    const missed = duration > 0 ? clamp((arriveAt - h) / (endHour - h), 0, 1) : 0;
    const catchable = !over && arriveAt <= endHour - 0.25;

    /* A listing with no published price cannot be ruled out on cost. */
    const userOk = f.circumstances.every((c) => e.circumstances.includes(c)) &&
      (e.price == null || e.price <= budgetMax(f.budget));

    return {
      ...e,
      hour: h,
      endHour,
      travelMinutes: travel,
      travelMode: f.mode && f.mode !== "auto" ? f.mode : e.travelMode,
      durationMin: Math.round(duration),
      totalMinutes: Math.round(duration + travel * 2),
      backBy: (endHour + travel / 60) % 24,
      leaveBy: (leaveBy + 24) % 24,
      leaveInMin: Math.round((leaveBy - now) * 60),
      over,
      missed,
      catchable,
      userOk,
      inWindow: h >= f.windowStart && h <= f.windowEnd,
      reachable: travel <= f.maxTravel,
      passes: userOk && catchable
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
    : kind === "range" ? { range: value, maxTravel: (RANGES.find((x) => x.id === value) || {}).minutes }
      : kind === "mode" ? { mode: value }
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
  if (e.price == null) return 0.6;
  const cap = budgetMax(state.filters.budget);
  if (cap === Infinity) return Math.max(0.2, 1 - e.price / 60);
  if (e.price <= cap) return 1 - (e.price / cap) * 0.35;
  return Math.max(0, 0.5 - (e.price - cap) / 40);
}

/* Already gone is worthless; about to start and just catchable is the
   best thing we can offer someone deciding right now. */
function timingFit(e) {
  if (!e.catchable) return 0;
  if (e.leaveInMin < 0) return Math.max(0, 0.6 - e.missed * 0.5);
  if (e.leaveInMin <= 25) return 1;
  if (e.leaveInMin <= 90) return 0.88;
  return 0.72;
}

/* Rain moves outdoor things down and indoor things up, by how likely it
   is at the hour the thing actually starts. */
function weatherFit(e) {
  const w = weatherAt(e.hour);
  if (!w) return 0.55;
  const rain = (w.rain ?? 0) / 100;
  const cold = w.temp == null ? 0 : clamp((9 - w.temp) / 14, 0, 1);
  if (e.setting === "indoor") return clamp(0.5 + rain * 0.45 + cold * 0.15, 0, 1);
  const base = e.setting === "mixed" ? 0.78 : 1;
  return clamp(base * (1 - rain * 0.85) - cold * 0.3, 0, 1);
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
    ? [[36, interestFit(e)], [16, timingFit(e)], [14, weatherFit(e)],
       [10, timeFit(e)], [10, travelFit(e)], [8, moneyFit(e)], [6, circFit(e)]]
    : [[24, timingFit(e)], [22, weatherFit(e)], [18, timeFit(e)],
       [16, travelFit(e)], [12, moneyFit(e)], [8, circFit(e)]];
  const total = parts.reduce((a, [w]) => a + w, 0);
  const value = parts.reduce((a, [w, v]) => a + w * v, 0) / total;
  return clamp(Math.round(value * 100), 4, 99);
}

/* ---- words ----------------------------------------------------------- */

const modeWord = (m) =>
  m === "walk" ? "on foot" : m === "transit" ? "on the bus" : m === "bike" ? "by bike"
    : m === "train" ? "by train" : "by car";

const costLine = (e) =>
  e.price === 0 ? "Free"
    : e.price == null ? "Not listed"
      : has(e, "student-price") ? `$${e.price} student` : `$${e.price}`;

function fmtDuration(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function perks(e) {
  const bits = [];
  if (e.price === 0) bits.push("costs nothing");
  else if (e.price != null && has(e, "student-price")) bits.push(`$${e.price} with a student card`);
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
  if (e.over) return "already finished";
  if (!e.catchable) return "you'd miss it";
  if (e.price != null && e.price > budgetMax(state.filters.budget)) return "over budget";
  if (!e.passes) return "ruled out";
  if (!e.reachable) return "too far";
  if (!e.inWindow) return e.hour < state.filters.windowStart ? "before your window" : "after your window";
  return "ruled out";
}


/* ---- compatibility with each answer -----------------------------------
   The percentage is one number; this is the same arithmetic opened up so
   a person can see which of their answers an event fits and which it
   does not. Every row is a component the percentage already uses. */

function compat(e) {
  const f = state.filters;
  const rows = [];

  if (f.interests.length) {
    let best = { w: null, sim: 0 };
    for (const w of f.interests) {
      for (const t of e.tags) {
        const sim = similarity(w, t);
        if (sim > best.sim) best = { w, sim };
      }
    }
    const how = best.sim >= 0.99 ? "exactly" : best.sim >= 0.5 ? "close" : "not really";
    rows.push({ key: "into", label: "Into", score: interestFit(e), note: `${labelOf(INTERESTS, best.w)}, ${how}` });
  } else {
    rows.push({ key: "into", label: "Into", score: null, note: "nothing picked" });
  }

  rows.push({ key: "spend", label: "Spend", score: moneyFit(e), note: costLine(e).toLowerCase() });
  rows.push({ key: "free", label: "Free", score: timeFit(e), note: e.inWindow ? "in your window" : "outside your window" });
  rows.push({ key: "range", label: "Range", score: travelFit(e), note: `${e.travelMinutes} min ${modeWord(e.travelMode)}` });

  const met = f.circumstances.filter((c) => has(e, c)).length;
  rows.push({
    key: "needs", label: "Needs",
    score: f.circumstances.length ? circFit(e) : null,
    note: f.circumstances.length ? `${met} of ${f.circumstances.length} met` : "none asked for"
  });

  const w = weatherAt(e.hour);
  const nowNote = !e.catchable ? "you'd miss it"
    : e.leaveInMin >= 0 && e.leaveInMin <= 25 ? `leave in ${e.leaveInMin} min`
      : w && (w.rain ?? 0) >= 40 && e.setting !== "indoor" ? `${w.rain}% rain, outdoors`
        : "fine";
  rows.push({ key: "now", label: "Right now", score: (timingFit(e) + weatherFit(e)) / 2, note: nowNote });

  return rows;
}

function compatHTML(e, full) {
  const rows = compat(e);
  return `<div class="compat${full ? " is-full" : ""}">
    <p class="compat-h">How it fits your answers</p>
    <div class="compat-rows">${rows.map((r) => {
      const pct = r.score == null ? null : Math.round(r.score * 100);
      return `<div class="compat-row">
        <span class="compat-k">${r.label}</span>
        <span class="compat-bar" aria-hidden="true"><i style="width:${pct ?? 0}%"></i></span>
        <span class="compat-v">${pct == null ? "any" : pct}</span>
        ${full ? `<span class="compat-n">${esc(r.note)}</span>` : ""}
      </div>`;
    }).join("")}</div>
  </div>`;
}

function rank(e) {
  return matchPct(e) / 100
    + (e.leaveInMin >= 0 && e.leaveInMin <= 25 ? 0.1 : 0)
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

/* Ticketmaster sends a photo or poster for most listings; the campus
   calendars send none. A picture that fails to load falls back to the
   drawn motif, so no card is ever blank. */
const badCovers = new Set();   /* pictures that failed to load; not asked for again */
const coverFor = (e) =>
  (/^https:\/\//i.test(e.imageUrl || "") && !badCovers.has(e.imageUrl) ? e.imageUrl : artFor(e));

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
  shell: document.getElementById("shell"),
  sideWizard: document.getElementById("side-wizard"),
  mainWizard: document.getElementById("main-wizard"),
  stepDone: document.getElementById("step-done"),
  navHome: document.getElementById("nav-home"),
  startOver: document.getElementById("start-over"),
  home: document.getElementById("home"),
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
  stepFeed: document.getElementById("step-feed"),

  sideResults: document.getElementById("side-results"),
  mainResults: document.getElementById("main-results"),
  standfirst: document.getElementById("standfirst"),
  navProfile: document.getElementById("nav-profile"),
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
    const card = state.selectedId && document.querySelector(".card.is-sel");
    if (card) card.scrollIntoView({ block: "center" });
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
        <input type="search" id="w-place" placeholder="Street and city" aria-label="Search a place"
          autocomplete="off" role="combobox" aria-expanded="false" aria-controls="w-suggest" aria-autocomplete="list">
        <button type="button" class="btn" id="w-find">Find</button>
        <ul class="suggest" id="w-suggest" role="listbox" aria-label="Places like what you typed" hidden></ul>
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
        <label class="time"><span>Day</span><input type="date" id="w-date" min="${TODAY}" max="${daysFrom(TODAY, 15)}" value="${state.date}"></label>
        <label class="time"><span>From</span><input type="time" id="w-from" value="${toTimeValue(state.filters.windowStart)}"></label>
        <label class="time"><span>Until</span><input type="time" id="w-to" value="${toTimeValue(state.filters.windowEnd)}"></label>
      </div>`
  },
  {
    id: "range",
    q: "How far will you go?",
    hint: "As travel time from where you start, so it means the same thing anywhere. You can stretch it on the results.",
    body: () => `<div class="chips chips-big">${RANGES.map((s) => chipHTML("range", s.id, s.label)).join("")}</div>
      <p class="ask-sub">Getting around by</p>
      <div class="chips chips-big">${MODES.map((m) => chipHTML("mode", m.id, m.label)).join("")}</div>`
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
    syncHash(true);
    renderStep();
  });

  el.stepBack.addEventListener("click", () => {
    if (state.step === 0) return;
    state.step -= 1;
    syncHash(true);
    renderStep();
  });

  el.stepNext.addEventListener("click", () => {
    if (state.step >= STEPS.length - 1) return enterResults();
    state.step += 1;
    syncHash(true);
    renderStep();
  });

  el.stepSkip.addEventListener("click", enterResults);
  el.stepDone.addEventListener("click", enterResults);
  if (el.startOver) el.startOver.addEventListener("click", startOver);

  /* On this page "What's on" and the wordmark mean the results, not a
     reload that throws the answers away. */
  [el.home, el.navHome].forEach((a) => a && a.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (state.screen === "results") return;
    enterResults();
  }));

  /* The browser's Back and Forward buttons walk the questions and the
     results like pages. */
  window.addEventListener("hashchange", () => {
    const at = readHash();
    if (!at) return;
    if (at.screen === "results" && state.screen !== "results") return enterResults({ fromHistory: true });
    if (at.screen === "wizard") {
      /* Arriving here by Back is an edit of results that already exist,
         and the step body must be rebuilt from state, not the stale DOM. */
      if (state.screen === "results") state.returnTo = "results";
      state.screen = "wizard";
      state.step = at.step;
      builtStep = -1;
      render();
    }
  });

  el.stepBody.addEventListener("click", (ev) => {
    const chip = ev.target.closest(".chip");
    if (!chip) return;
    const { kind, value } = chip.dataset;
    if (kind === "place") return pickPlace(value);
    if (kind === "budget") state.filters.budget = value;
    else if (kind === "range") setRange(value);
    else if (kind === "mode") state.filters.mode = value;
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
  const editing = state.returnTo === "results";
  el.stepDone.hidden = !editing;
  el.stepSkip.hidden = editing || state.step === STEPS.length - 1;

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
    const input = el.stepBody.querySelector("#w-place");
    const go = () => { closeSuggestions(); findPlace(input.value); };
    el.stepBody.querySelector("#w-find").addEventListener("click", go);
    input.addEventListener("input", () => suggestFor(input.value));
    input.addEventListener("keydown", (ev) => {
      const open = suggestions.length && !el.stepBody.querySelector("#w-suggest").hidden;
      if (ev.key === "ArrowDown" && open) { ev.preventDefault(); moveSuggestion(1); return; }
      if (ev.key === "ArrowUp" && open) { ev.preventDefault(); moveSuggestion(-1); return; }
      if (ev.key === "Escape" && open) { ev.preventDefault(); closeSuggestions(); return; }
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      if (open && suggestActive >= 0) return chooseSuggestion(suggestActive);
      go();
    });
    input.addEventListener("blur", () => setTimeout(closeSuggestions, 150));
    el.stepBody.querySelector("#w-suggest").addEventListener("mousedown", (ev) => {
      const li = ev.target.closest("[data-i]");
      if (!li) return;
      ev.preventDefault();          /* keep the input's blur from closing first */
      chooseSuggestion(Number(li.dataset.i));
    });
    el.stepBody.querySelector("#w-geo").addEventListener("click", useMyLocation);
  }
  if (s.id === "time") {
    const day = el.stepBody.querySelector("#w-date");
    day.addEventListener("change", () => {
      if (!isCalendarDate(day.value) || day.value < TODAY || day.value > daysFrom(TODAY, 15)) { day.value = state.date; return; }
      if (day.value === state.date) return;
      state.date = day.value;
      state.weather = null;
      state.selectedId = null;
      pickClock();
      reloadEvents();
    });
    const from = el.stepBody.querySelector("#w-from");
    const to = el.stepBody.querySelector("#w-to");
    from.addEventListener("change", () => {
      const v = fromTimeValue(from.value);
      if (v == null) return;
      state.filters.windowStart = Math.min(v, state.filters.windowEnd - 0.25);
      fitSpan();
      state.clockPinned = false;
      if (state.clockFallback || state.nowAuto) pickClock();
      updateStep();
    });
    to.addEventListener("change", () => {
      const v = fromTimeValue(to.value);
      if (v == null) return;
      state.filters.windowEnd = Math.max(v, state.filters.windowStart + 0.25);
      fitSpan();
      state.clockPinned = false;
      if (state.clockFallback || state.nowAuto) pickClock();
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
      : kind === "range" ? f.range === value
        : kind === "mode" ? f.mode === value
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
  el.stepFeed.textContent = state.feed.note;

  [...el.stepDots.children].forEach((d, i) => {
    d.classList.toggle("is-on", i === state.step);
    d.classList.toggle("is-done", i < state.step);
  });
}

const rangeFor = (min) => (RANGES.find((x) => x.minutes === min) || {}).id || null;

function setRange(id) {
  state.filters.range = id;
  const r = RANGES.find((x) => x.id === id);
  if (r) state.filters.maxTravel = r.minutes;
}

/* Keep the axis wide enough to contain the window the user just chose. */
function fitSpan() {
  const f = state.filters;
  const s = span();
  if (f.windowStart < s.start || f.windowEnd > s.end) state.spanId = "day";
}

function enterResults({ fromHistory = false } = {}) {
  state.screen = "results";
  state.returnTo = null;
  if (!fromHistory) syncHash(true);
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
  state.returnTo = "results";
  builtStep = -1;
  syncHash(true);
  state.hoverId = null;
  render();
}

/* ---- history --------------------------------------------------------- */

const HASH_Q = /^#q([1-6])$/;

function readHash() {
  const h = window.location.hash;
  if (h === "#results") return { screen: "results" };
  const m = HASH_Q.exec(h);
  if (m) return { screen: "wizard", step: Number(m[1]) - 1 };
  return null;
}

function syncHash(push) {
  const want = state.screen === "results" ? "#results" : `#q${state.step + 1}`;
  if (window.location.hash === want) return;
  const url = `${window.location.pathname}${window.location.search}${want}`;
  if (push) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/* ---- answers, remembered ---------------------------------------------
   Coming back from the circles or profile page should land on the results
   with the same answers, not on question one. Only the answers are kept;
   nothing about who you are. */

function saveAnswers() {
  try {
    localStorage.setItem(ANSWERS_KEY, JSON.stringify({
      filters: state.filters,
      date: state.date,
      origin: state.origin,
      travelSource: state.travelSource,
      spanId: state.spanId,
      answered: state.screen === "results" || state.returnTo === "results"
    }));
  } catch (err) { /* private mode, or storage full; nothing to do */ }
}

function loadAnswers() {
  try {
    const j = JSON.parse(localStorage.getItem(ANSWERS_KEY) || "null");
    if (!j || !j.filters) return false;
    state.filters = { ...state.filters, ...j.filters };
    const r = RANGES.find((x) => x.id === state.filters.range);
    if (!r || r.minutes !== state.filters.maxTravel) state.filters.range = rangeFor(state.filters.maxTravel);
    if (j.origin && Number.isFinite(j.origin.lat)) state.origin = j.origin;
    if (!WANTED_DATE && isCalendarDate(j.date) && j.date >= TODAY) state.date = j.date;
    if (j.travelSource) state.travelSource = j.travelSource;
    if (j.spanId && SPANS[j.spanId]) state.spanId = j.spanId;
    return Boolean(j.answered);
  } catch (err) {
    return false;
  }
}

/* ---- the clock, sensibly ---------------------------------------------
   Ranking against the real clock is the point, but opened at half past
   eleven at night every evening listing has already finished and the page
   is empty. When the real time is past the free window, pretend it is
   half an hour before the window opens and say so. Scrubbing the clock
   or choosing "use the clock" takes over from this. */

function pickClock() {
  if (!isToday() || state.clockPinned) {
    state.clockFallback = false;
    state.nowAuto = true;
    return;
  }
  const d = new Date();
  const real = d.getHours() + d.getMinutes() / 60;
  const f = state.filters;
  const late = real > f.windowEnd - 0.25 || real < 5;
  if (!late) {
    state.clockFallback = false;
    state.nowAuto = true;
    return;
  }
  state.clockFallback = true;
  state.nowAuto = false;
  state.nowManual = Math.max(span().start, Math.round((f.windowStart - 0.5) * 4) / 4);
}

/* ---- places like what you typed ---------------------------------------
   As on a map search: from three characters on, a short list of matching
   places drops under the input. Requests wait for a pause in typing and
   never go out more than once a second, which is what the lookup service
   asks for. A reply for an older query is dropped. */

const SUGGEST_MIN = 3;
const SUGGEST_PAUSE_MS = 350;
const SUGGEST_GAP_MS = 1000;
let suggestions = [];
let suggestActive = -1;
let suggestTimer = null;
let suggestLastAt = 0;
let suggestSeq = 0;

function suggestFor(value) {
  const q = String(value || "").trim();
  clearTimeout(suggestTimer);
  if (q.length < SUGGEST_MIN) return closeSuggestions();
  const wait = Math.max(SUGGEST_PAUSE_MS, SUGGEST_GAP_MS - (Date.now() - suggestLastAt));
  suggestTimer = setTimeout(async () => {
    const mine = ++suggestSeq;
    suggestLastAt = Date.now();
    try {
      const found = await suggestPlaces(q);
      if (mine !== suggestSeq) return;
      suggestions = found;
      suggestActive = found.length ? 0 : -1;
      renderSuggestions();
    } catch (err) {
      if (mine === suggestSeq) closeSuggestions();
    }
  }, wait);
}

function renderSuggestions() {
  const list = el.stepBody.querySelector("#w-suggest");
  const input = el.stepBody.querySelector("#w-place");
  if (!list || !input) return;
  if (!suggestions.length) return closeSuggestions();
  list.innerHTML = suggestions.map((p, i) => `
    <li role="option" id="w-suggest-${i}" data-i="${i}" class="${i === suggestActive ? "is-active" : ""}"
        aria-selected="${i === suggestActive}">
      <span class="suggest-label">${esc(p.label)}</span>
      <span class="suggest-detail">${esc(p.detail)}</span>
    </li>`).join("");
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-activedescendant", suggestActive >= 0 ? `w-suggest-${suggestActive}` : "");
}

function moveSuggestion(step) {
  if (!suggestions.length) return;
  suggestActive = (suggestActive + step + suggestions.length) % suggestions.length;
  renderSuggestions();
}

function closeSuggestions() {
  clearTimeout(suggestTimer);
  suggestSeq++;                 /* a reply still in flight is dropped */
  suggestions = [];
  suggestActive = -1;
  const list = el.stepBody.querySelector("#w-suggest");
  const input = el.stepBody.querySelector("#w-place");
  if (list) { list.hidden = true; list.innerHTML = ""; }
  if (input) { input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); }
}

function chooseSuggestion(i) {
  const p = suggestions[i];
  if (!p) return;
  const input = el.stepBody.querySelector("#w-place");
  if (input) input.value = p.label;
  closeSuggestions();
  originPick++;
  suggestSeq++;
  state.origin = { lat: p.lat, lng: p.lng, label: p.label };
  state.travelSource = "estimated";
  state.geo = { busy: false, note: null };
  state.weather = null;
  state.reflow = "stagger";
  reloadEvents();
}

/* ---- location -------------------------------------------------------- */

/* A new origin means a new feed: the server searches and measures from
   wherever the user is. A stale response for an origin the user already
   left is dropped. */
let feedRequest = 0;
let originPick = 0;   /* a slow lookup must not overwrite a later pick */

async function reloadEvents() {
  const mine = ++feedRequest;
  state.feed = { ...state.feed, note: `Looking for what's on near ${state.origin.label}.` };
  render();
  const { events, feed } = await loadEvents(state.origin, state.date);
  if (mine !== feedRequest) return;
  state.events = events;
  state.feed = feed;
  state.selectedId = null;
  state.hoverId = null;
  render();
  loadCircleCounts();
}

function pickPlace(id) {
  const q = QUICK_PLACES.find((x) => x.id === id);
  if (!q) return;
  originPick++;
  state.origin = { lat: q.lat, lng: q.lng, label: q.label };
  state.travelSource = q.id === "phillip" ? "feed" : "estimated";
  state.geo = { busy: false, note: null };
  state.weather = null;
  state.reflow = "stagger";
  reloadEvents();
}

async function findPlace(query) {
  const q = String(query || "").trim();
  if (!q) return;
  const mine = ++originPick;
  state.geo = { busy: true, note: null };
  render();
  try {
    const found = await geocode(q);
    if (mine !== originPick) return;
    state.origin = found;
    state.travelSource = "estimated";
    state.geo = { busy: false, note: null };
    state.weather = null;
    reloadEvents();
  } catch (err) {
    if (mine !== originPick) return;
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

  const mine = ++originPick;
  let settled = false;
  const watchdog = setTimeout(() => {
    if (settled || mine !== originPick) return;
    settled = true;
    state.geo = { busy: false, note: "The browser never answered. Pick a spot below instead." };
    render();
  }, 12000);

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (settled || mine !== originPick) return;
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
      reloadEvents();
    },
    (err) => {
      if (settled || mine !== originPick) return;
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

/* ---- circles ---------------------------------------------------------
   The backend keeps a "circle" per event: the students who said they are
   going, with the Instagram handle they chose to share. Joining needs the
   session the profile page stores in localStorage. */

const CIRCLES_URL = "circles.html";
const joined = new Set();

/* The only "going" number shown anywhere is the count of students who
   actually joined that event's circle. The live feed carries it already;
   sample listings start at zero and pick it up from here if someone has
   joined one of them. */
async function loadCircleCounts() {
  try {
    const j = await api("/api/circles");
    const counts = new Map((j.circles || []).map((c) => [String(c.event_id), c.member_count || 0]));
    state.events.forEach((e) => { e.goingCount = counts.get(String(e.id)) || 0; });
    render();
  } catch (err) {
    /* Without the server the counts stay as the feed gave them: real for
       live listings, none for samples. Nothing is invented. */
  }
}

async function loadJoined() {
  if (!session()) return;
  try {
    const j = await api("/api/circles/mine", { auth: true });
    (j.circles || []).forEach((c) => joined.add(String(c.event_id)));
    render();
  } catch (err) {
    /* The map still works without knowing which circles you are in. */
    if (err.status === 401) joined.clear();
  }
}

const toProfile = () => { window.location.href = profileUrl(); };

async function joinCircle(e) {
  if (!session()) return toProfile();
  const id = String(e.id);
  state.joining = id;
  state.circleNote = null;
  render();
  try {
    await api("/api/circles/join", {
      method: "POST",
      auth: true,
      body: { eventId: id, eventName: e.title, eventUrl: e.source?.url || null, eventDate: e.startsAt }
    });
    joined.add(id);
    const raw = state.events.find((x) => String(x.id) === id);
    if (raw) raw.goingCount = (raw.goingCount || 0) + 1;
    state.circleNote = { id, text: "You're in. Others who join can see your handle." };
  } catch (err) {
    if (err.status === 401) {
      joined.clear();
      return toProfile();
    }
    state.circleNote = { id, text: err.message };
  }
  state.joining = null;
  render();
}

function circleHTML(e) {
  const id = String(e.id);
  const n = e.goingCount || 0;
  const busy = state.joining === id;
  const note = state.circleNote && state.circleNote.id === id ? state.circleNote.text : "";
  /* The server already filters provider links to http(s); belt and braces. */
  const href = webUrl(e.source?.url);
  const src = href
    ? `<a class="link" href="${esc(href)}" target="_blank" rel="noreferrer">${esc(e.source.name || "Details")}</a>`
    : `<span class="card-going">${n ? `${n} going` : ""}</span>`;
  const action = joined.has(id)
    ? `<a class="btn btn-join is-in" href="${CIRCLES_URL}">You're in, see who else</a>`
    : `<button type="button" class="btn btn-join" data-join="${esc(id)}"${busy ? " disabled" : ""}>
        ${busy ? "Joining" : n ? `Join circle, ${n} going` : "Join circle"}
       </button>`;
  return `<div class="card-actions">${src}${action}</div>` +
    (note ? `<p class="card-circle-note">${esc(note)}</p>` : "");
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
    const join = ev.target.closest("[data-join]");
    if (join) {
      const e = state.events.find((x) => String(x.id) === join.dataset.join);
      if (e) joinCircle(e);
      return;
    }
    const close = ev.target.closest("[data-close-map]");
    if (close) {
      state.selectedId = null;
      render();
      return;
    }
    /* Links inside a card go where they say; they do not select the card. */
    if (ev.target.closest("a")) return;
    const card = ev.target.closest(".card");
    if (!card) return;
    state.selectedId = state.selectedId === card.dataset.id ? null : card.dataset.id;
    render();
  });

  /* error does not bubble, so it is caught on the way down. */
  el.cards.addEventListener("error", (ev) => {
    const img = ev.target;
    if (img.tagName === "IMG" && img.dataset.fallback && img.src !== img.dataset.fallback) {
      badCovers.add(img.src);
      img.src = img.dataset.fallback;
    }
  }, true);

  el.cards.addEventListener("mouseover", (ev) => {
    const card = ev.target.closest(".card");
    if (card) state.hoverId = card.dataset.id;
  });
}

function mountRail() {
  el.rail.innerHTML = `
    <div class="nowbox">
      <div class="answers-top">
        <h2 class="answers-h">Right now</h2>
        <button type="button" class="link link-deep" id="now-reset">use the clock</button>
      </div>
      <p class="now-time" id="now-time"></p>
      <label class="slider slider-deep">
        <span class="slider-cap">Pretend</span>
        <input type="range" id="now-range" min="6" max="23.75" step="0.25">
      </label>
      <p class="now-weather" id="now-weather"></p>
      <p class="now-effect" id="now-effect"></p>
      <button type="button" class="link link-deep" id="now-rain"></button>
    </div>

    <div class="rail-head">
      <p class="rail-count" id="count">0</p>
      <p class="rail-note" id="count-note"></p>
      <p class="rail-feed" id="feed-note"></p>
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
        <input type="range" id="travel" min="5" max="90" step="1">
      </label>
    </div>`;

  const q = (s) => el.rail.querySelector(s);
  rail = {
    nowTime: q("#now-time"), nowRange: q("#now-range"),
    nowWeather: q("#now-weather"), nowEffect: q("#now-effect"),
    nowReset: q("#now-reset"), nowRain: q("#now-rain"),
    count: q("#count"), countNote: q("#count-note"), feed: q("#feed-note"), list: q("#answers-list"),
    windowVal: q("#window-val"), travelVal: q("#travel-val"),
    winStart: q("#win-start"), winEnd: q("#win-end"), travel: q("#travel")
  };

  q("#edit-all").addEventListener("click", () => editAnswers(0));

  rail.nowRange.addEventListener("input", () => {
    state.nowAuto = false;
    state.clockFallback = false;
    state.clockPinned = false;
    state.nowManual = Number(rail.nowRange.value);
    state.reflow = "live";
    render();
  });

  rail.nowReset.addEventListener("click", () => {
    state.nowAuto = true;
    state.clockFallback = false;
    state.clockPinned = true;
    state.reflow = "stagger";
    render();
  });

  rail.nowRain.addEventListener("click", () => {
    state.forceRain = !state.forceRain;
    state.reflow = "stagger";
    render();
  });

  rail.list.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-goto]");
    if (b) editAnswers(Number(b.dataset.goto));
  });

  rail.winStart.addEventListener("input", () => {
    state.filters.windowStart = Math.min(Number(rail.winStart.value), state.filters.windowEnd - 0.25);
    state.clockPinned = false;
    if (state.clockFallback || state.nowAuto) pickClock();
    state.reflow = "live";
    render();
  });
  rail.winEnd.addEventListener("input", () => {
    state.filters.windowEnd = Math.max(Number(rail.winEnd.value), state.filters.windowStart + 0.25);
    state.clockPinned = false;
    if (state.clockFallback || state.nowAuto) pickClock();
    state.reflow = "live";
    render();
  });
  rail.travel.addEventListener("input", () => {
    state.filters.maxTravel = Number(rail.travel.value);
    state.filters.range = rangeFor(state.filters.maxTravel);
    state.reflow = "live";
    render();
  });
}

let rail = null;

function updateRail(items) {
  const f = state.filters;
  const s = span();
  const shown = items.filter(inSpan);
  const now = nowHour();

  const realNow = new Date();
  const realHour = realNow.getHours() + realNow.getMinutes() / 60;
  rail.nowTime.textContent = state.nowAuto
    ? (isToday() ? `It's ${fmtClock(now)}` : `Planning for ${fmtDate(state.date)}`)
    : state.clockFallback
      ? `Pretending it's ${fmtClock(state.nowManual)}, since it's ${fmtClock(realHour)} now`
      : `Pretending it's ${fmtClock(state.nowManual)}`;
  rail.nowReset.hidden = state.nowAuto;
  if (document.activeElement !== rail.nowRange) rail.nowRange.value = now;

  const mid = (f.windowStart + f.windowEnd) / 2;
  const w = weatherAt(mid);
  rail.nowWeather.textContent = !forecast()
    ? "Checking the forecast."
    : forecast().unavailable
      ? `No forecast yet for ${fmtDate(state.date)}, so the weather is not in the ranking.`
      : `${Math.round(w?.temp ?? 0)} degrees, ${w?.rain ?? 0}% chance of rain around ${fmtClock(Math.floor(mid))}` +
        (forecast().sample ? ", from a sample forecast" : "");
  rail.nowEffect.textContent = forecast()?.unavailable ? "" : weatherEffect(w);
  rail.nowRain.textContent = state.forceRain
    ? "back to the real forecast"
    : "see it with rain";

  const fits = items.filter(isMatch);
  const offAxis = fits.filter((e) => !inSpan(e)).length;
  rail.count.textContent = fits.length;
  const gone = items.filter((e) => e.over).length;
  rail.countNote.textContent = `fit your answers, out of ${items.length} on today.` +
    (offAxis ? ` ${offAxis} of them start outside the hours on the chart; All day shows them.` : "") +
    (gone ? ` ${gone} already finished.` : "");
  rail.feed.textContent = state.feed.note;

  const intoLabels = f.interests.map((i) => labelOf(INTERESTS, i));
  const needLabels = f.circumstances.map((c) => labelOf(CIRCUMSTANCES, c));

  rail.list.innerHTML = [
    ["From", esc(state.origin.label), 0],
    ["Day", isToday() ? "today" : fmtDate(state.date), 3],
    ["Into", intoLabels.length ? esc(intoLabels.join(", ")) : "anything", 1],
    ["Spend", esc(labelOf(BUDGETS, f.budget)), 2],
    ["Free", `${fmtClock(f.windowStart)} to ${fmtClock(f.windowEnd)}`, 3],
    ["Range", f.range ? esc(labelOf(RANGES, f.range)) : `within ${f.maxTravel} minutes`, 4],
    ["By", esc(labelOf(MODES, f.mode)), 4],
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

function weatherEffect(w) {
  if (!w) return "";
  if ((w.rain ?? 0) >= 55) return "Wet out, so indoor things are ranked first.";
  if ((w.rain ?? 0) >= 30) return "It might rain, so outdoor things are ranked lower.";
  if (w.temp != null && w.temp < 9) return "Cold out, so outdoor things are ranked lower.";
  return "Dry and mild, so outdoor things are ranked up.";
}

/* ---- cards ----------------------------------------------------------- */

/* Every listing for the day is on the page: the ones that fit first, then
   everything else with the reason it does not. The chart's axis decides
   what is drawn on the chart, not what is listed. */
function renderCards(items) {
  const matches = items.filter(isMatch)
    .sort((a, b) => matchPct(b) - matchPct(a) || rank(b) - rank(a));
  const ruled = items.filter((e) => !isMatch(e)).sort((a, b) => a.hour - b.hour);

  el.cardsH.textContent = matches.length
    ? (matches.length === 1 ? "The one thing that fits" : `${matches.length} things that fit`)
    : "Nothing fits yet";
  const w = weatherAt((state.filters.windowStart + state.filters.windowEnd) / 2);
  el.cardsSub.textContent = matches.length
    ? `Ranked for ${fmtClock(nowHour())} and a ${w?.rain ?? 0}% chance of rain. ` +
      "Everything here is still catchable."
    : "Loosen one answer, or move the clock, and they come back.";

  const cards = matches.map((e, i) => cardHTML(e, i === 0)).join("");
  const restHead = ruled.length
    ? `<div class="cards-rest-head">
        <h2 class="cards-h">${ruled.length === 1 ? "One more thing on today" : `${ruled.length} more things on today`}</h2>
        <p class="cards-sub">Not for you as things stand. Each one says why. Change an answer and it may move up.</p>
       </div>`
    : "";
  const rest = ruled.map((e) => cardHTML(e, false)).join("");

  mountCards(cards + restHead + rest);
}

/* A re-render must not tear down a map the user is looking at, and a
   browser reloads an iframe the moment it is removed or moved, however
   briefly. So when the selected card already has its map, that card stays
   exactly where it is: its other parts are swapped in place, the map's
   links are refreshed around the untouched iframe, and every other card is
   rebuilt around it. */
function mountCards(html) {
  const sel = state.selectedId ? `.card[data-id="${CSS.escape(String(state.selectedId))}"]` : null;
  const keptCard = sel && el.cards.querySelector(sel);
  const keptMap = keptCard && keptCard.querySelector(".card-map");
  if (!keptMap) {
    el.cards.innerHTML = html;
    return;
  }

  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const newCard = tpl.content.querySelector(sel);
  const newMap = newCard && newCard.querySelector(".card-map");
  const sameMap = newMap &&
    (newMap.querySelector("iframe") || {}).src === (keptMap.querySelector("iframe") || {}).src;
  if (!sameMap) {
    el.cards.innerHTML = html;
    return;
  }

  /* whatever inside the card had keyboard focus keeps it after the swap;
     the card's markup order is stable, so the same index is the same control */
  const focusables = () => [...keptCard.querySelectorAll("a, button, input, select, textarea, [tabindex]")];
  const active = document.activeElement;
  const focusAt = active && active !== keptCard && keptCard.contains(active) ? focusables().indexOf(active) : -1;

  /* the selected card: attributes, art and body parts, but not the map */
  for (const { name, value } of newCard.attributes) keptCard.setAttribute(name, value);
  const oldArt = keptCard.querySelector(".card-art");
  const newArt = newCard.querySelector(".card-art");
  if (oldArt && newArt) oldArt.replaceWith(newArt);
  const oldBody = keptCard.querySelector(".card-body");
  const newBody = newCard.querySelector(".card-body");
  for (const c of [...oldBody.children]) if (c !== keptMap) c.remove();
  for (const c of [...newBody.children]) if (!c.classList.contains("card-map")) oldBody.insertBefore(c, keptMap);
  const oldLinks = keptMap.querySelector(".card-map-links");
  const newLinks = newMap.querySelector(".card-map-links");
  if (oldLinks && newLinks) oldLinks.replaceWith(newLinks);
  if (focusAt >= 0) {
    const again = focusables()[focusAt];
    if (again) again.focus({ preventScroll: true });
  }

  /* everything else, rebuilt around it */
  const nodes = [...tpl.content.childNodes];
  const at = nodes.indexOf(newCard);
  for (const c of [...el.cards.childNodes]) if (c !== keptCard) c.remove();
  nodes.slice(0, at).forEach((n) => el.cards.insertBefore(n, keptCard));
  nodes.slice(at + 1).forEach((n) => el.cards.appendChild(n));
}

function urgentFlag(e) {
  if (e.leaveInMin < 0) return `<span class="card-flag is-now">started, walk in</span>`;
  if (e.leaveInMin <= 25) return `<span class="card-flag is-now">leave in ${e.leaveInMin} min</span>`;
  return "";
}

function weatherNote(e) {
  const w = weatherAt(e.hour);
  if (!w || e.setting === "indoor") return "";
  if ((w.rain ?? 0) >= 40) {
    return `<p class="card-note">Outdoors, and a ${w.rain}% chance of rain at ${fmtClock(Math.floor(e.hour))}.</p>`;
  }
  if (w.temp != null && w.temp < 9) {
    return `<p class="card-note">Outdoors, and ${Math.round(w.temp)} degrees at ${fmtClock(Math.floor(e.hour))}.</p>`;
  }
  return "";
}

function cardHTML(e, lead) {
  const pct = matchPct(e);
  const out = !isMatch(e);
  return `<article class="card${lead ? " is-lead" : ""}${out ? " is-out" : ""}${e.id === state.selectedId ? " is-sel" : ""}"
    data-id="${e.id}" tabindex="0" role="button" aria-label="${esc(e.title)}, ${pct} percent match">
    <div class="card-art">
      <img src="${esc(coverFor(e))}" data-fallback="${artFor(e)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <span class="pct">${pct}<span class="pct-u">%</span></span>
      ${out ? `<span class="card-flag">${why(e)}</span>` : urgentFlag(e)}
    </div>
    <div class="card-body">
      <p class="card-when"><strong>${fmtClock(e.hour)}</strong> <span>to ${fmtClock(e.endHour)}</span></p>
      <h3 class="card-title">${esc(e.title)}</h3>
      <p class="card-venue">${esc(e.venue)}</p>
      <p class="card-desc">${esc(e.description || "")}</p>
      ${weatherNote(e)}
      ${compatHTML(e, lead)}
      <dl class="card-facts">
        <div><dt>Costs</dt><dd><strong>${costLine(e)}</strong></dd></div>
        <div><dt>Getting there</dt><dd><strong>${e.travelMinutes} min</strong> ${modeWord(e.travelMode)}</dd></div>
        <div><dt>Leave by</dt><dd><strong>${fmtClock(e.leaveBy)}</strong></dd></div>
        <div><dt>Back by</dt><dd><strong>${fmtClock(e.backBy)}</strong></dd></div>
      </dl>
      ${circleHTML(e)}
      ${e.id === state.selectedId ? mapHTML(e) : ""}
    </div>
  </article>`;
}

/* A small map for the selected listing, and directions from where the
   user starts by the way they said they get around. Both are plain links
   into OpenStreetMap and Google Maps: no keys, nothing sent until clicked. */
function mapHTML(e) {
  if (e.lat == null || e.lng == null) return "";
  const d = 0.008;
  const bbox = [e.lng - d, e.lat - d * 0.6, e.lng + d, e.lat + d * 0.6].map((n) => n.toFixed(5)).join(",");
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${e.lat.toFixed(5)},${e.lng.toFixed(5)}`;
  const osm = `https://www.openstreetmap.org/?mlat=${e.lat.toFixed(5)}&mlon=${e.lng.toFixed(5)}#map=16/${e.lat.toFixed(5)}/${e.lng.toFixed(5)}`;
  const tm = { walk: "walking", bike: "bicycling", transit: "transit", train: "transit", drive: "driving" }[e.travelMode] || "transit";
  const dirs = `https://www.google.com/maps/dir/?api=1&origin=${state.origin.lat.toFixed(5)},${state.origin.lng.toFixed(5)}` +
    `&destination=${e.lat.toFixed(5)},${e.lng.toFixed(5)}&travelmode=${tm}`;
  return `<div class="card-map">
    <iframe src="${embed}" title="Map of ${esc(e.venue)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    <div class="card-map-links">
      <a class="link" href="${dirs}" target="_blank" rel="noreferrer">Directions ${modeWord(e.travelMode)}, from ${esc(state.origin.label)}</a>
      <a class="link" href="${osm}" target="_blank" rel="noreferrer">Bigger map</a>
      <button type="button" class="link" data-close-map>Close</button>
    </div>
  </div>`;
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
  const km = e.lat != null && e.lng != null ? distanceKm(state.origin, e) : null;
  const far = km == null ? "" : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
  el.tip.innerHTML = `
    <span class="tip-title">${esc(e.title)}</span>
    <dl class="tip-grid">
      <dt>Time</dt><dd>${fmtClock(e.hour)} to ${fmtClock(e.endHour)}</dd>
      <dt>Distance</dt><dd>${far ? `${far}, ` : ""}${e.travelMinutes} min ${modeWord(e.travelMode)}</dd>
      <dt>Price</dt><dd>${costLine(e)}</dd>
    </dl>`;
  el.tip.hidden = false;

  const wrap = el.wrap.getBoundingClientRect();
  const r = dot.getBoundingClientRect();
  const w = el.tip.offsetWidth;
  const h = el.tip.offsetHeight;
  const x = r.left + r.width / 2 - wrap.left;
  const above = r.top - wrap.top - h - 12;
  const below = r.bottom - wrap.top + 12;
  /* When it cannot sit above the dot it goes below, but never past the
     bottom of the window: a hidden readout is no readout. */
  const viewH = window.innerHeight || document.documentElement.clientHeight || Infinity;
  const lastTop = viewH - wrap.top - h - 4;
  el.tip.style.left = `${clamp(x - w / 2, 4, Math.max(4, wrap.width - w - 4))}px`;
  const minTop = 4 - wrap.top;
  const top = above >= minTop ? above : Math.min(below, lastTop);
  el.tip.style.top = `${Math.max(minTop, Math.min(top, lastTop))}px`;
}

/* On a phone the answers follow the chart. Moving the node, rather than
   reordering it with CSS, keeps keyboard and screen-reader order equal to
   what is on screen. */
const narrow = window.matchMedia("(max-width: 900px)");
narrow.addEventListener("change", () => { if (state.status === "ready") render(); });

function placeResultsPanel() {
  const side = document.querySelector(".side");
  const wantOutside = narrow.matches && state.screen === "results";
  const outside = el.sideResults.parentElement !== side;
  /* On a phone the count, the answers and the sliders go between the
     chart and the list, not under a whole day of cards. */
  if (wantOutside && !outside) document.querySelector(".cards-head").before(el.sideResults);
  else if (!wantOutside && outside) side.appendChild(el.sideResults);
}

/* ---- start over --------------------------------------------------------
   The homepage button, and what a logout lands on: the answers go, the
   defaults come back, the feed is fetched for the default origin, and the
   first question is shown. */

function defaultFilters() {
  return {
    windowStart: 18.5,
    windowEnd: 21,
    maxTravel: SEED_USER.maxTravelMinutes,
    budget: SEED_USER.budget,
    range: SEED_USER.range,
    mode: SEED_USER.mode,
    circumstances: [],
    interests: []
  };
}

function startOver() {
  clearAnswers();
  state.filters = defaultFilters();
  state.origin = { ...SEED_USER.origin };
  state.travelSource = "feed";
  state.geo = { busy: false, note: null };
  state.weather = null;
  state.forceRain = false;
  state.clockPinned = false;
  state.date = TODAY;
  state.spanId = "evening";
  state.selectedId = null;
  state.hoverId = null;
  state.returnTo = null;
  state.screen = "wizard";
  state.step = 0;
  builtStep = -1;
  originPick++;
  closeSuggestions();
  pickClock();
  syncHash(true);
  render();
  reloadEvents();
}

/* ---- render ---------------------------------------------------------- */

function render() {
  if (state.status === "loading") return;
  if (state.status === "error") {
    el.sideWizard.hidden = true;
    el.mainWizard.hidden = true;
    el.sideResults.hidden = false;
    el.mainResults.hidden = false;
    el.standfirst.textContent = `The listings did not load. ${state.error}. Reload to try again.`;
    return;
  }

  const onWizard = state.screen === "wizard";
  el.sideWizard.hidden = !onWizard;
  el.mainWizard.hidden = !onWizard;
  el.sideResults.hidden = onWizard;
  el.mainResults.hidden = onWizard;
  el.shell.classList.toggle("is-wizard", onWizard);
  el.shell.classList.toggle("is-results", !onWizard);
  placeResultsPanel();
  if (el.navProfile) el.navProfile.textContent = session()?.profile?.username || "Log in";
  if (state.clockFallback || state.nowAuto) pickClock();
  saveAnswers();

  if (onWizard) {
    renderStep();
    return;
  }

  const items = decorate(state.events, state.filters);
  const matches = items.filter(isMatch);

  el.standfirst.textContent = state.selectedId
    ? describeSelected(items)
    : matches.length === 1
      ? `One thing you can get to, afford, and be back from${isToday() ? "" : ` on ${fmtDate(state.date)}`}.`
      : `${matches.length} things you can get to, afford, and be back from${isToday() ? "" : ` on ${fmtDate(state.date)}`}.`;

  [...el.spans.children].forEach((b) => {
    const on = b.dataset.span === state.spanId;
    b.setAttribute("aria-pressed", String(on));
    b.classList.toggle("is-on", on);
  });

  /* The list's own heading already says "Nothing fits yet" when there are
     listings that do not fit; this paragraph is for an empty day. */
  el.empty.hidden = items.length > 0;
  el.svg.classList.toggle("is-live-drag", state.reflow === "live" && !revealing);

  ensureWeather();

  radial.update({
    items,
    span: span(),
    windowStart: state.filters.windowStart,
    windowEnd: state.filters.windowEnd,
    maxTravel: state.filters.maxTravel,
    originLabel: state.origin.label,
    delay: delayFor(items)
  });

  renderCards(items);
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

/* #start is where the other pages send someone who wants a clean slate:
   forget the answers before anything is read back. */
if (window.location.hash === "#start") {
  clearAnswers();
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#q1`);
}

/* Remembered answers first, so the very first feed request already asks
   about the place the user was last at. */
const answered = loadAnswers();

loadEvents(state.origin, state.date)
  .then(({ events, feed }) => {
    state.events = events;
    state.feed = feed;
    state.status = "ready";
    mountWizard();
    mountResults();
    mountRail();

    /* Where to open: the address bar wins, then remembered answers land on
       the results, otherwise question one. */
    const at = readHash();
    if (at?.screen === "wizard") {
      state.step = at.step;
      if (answered) state.returnTo = "results";
    } else if (at?.screen === "results" || answered) {
      state.screen = "results";
    }
    pickClock();
    syncHash(false);
    if (state.screen === "results") {
      revealing = true;
      el.svg.classList.add("is-live", "is-reveal");
      clearTimeout(revealTimer);
      revealTimer = setTimeout(() => {
        revealing = false;
        el.svg.classList.remove("is-reveal");
        render();
      }, 950);
    }
    render();
    loadCircleCounts();
    loadJoined();
  })
  .catch((err) => {
    state.error = err.message;
    state.status = "error";
    render();
  });

window.addEventListener("resize", renderTip);

/* The clock keeps time while the page sits open: every half minute the
   real clock is re-read, the fallback re-judged, and the ranking redone. */
let lastTickMinute = -1;
setInterval(() => {
  if (state.status !== "ready" || state.screen !== "results") return;
  if (!state.nowAuto && !state.clockFallback) return;   /* a scrubbed clock stays put */
  if (!isToday()) return;                               /* another day: nothing moves */
  /* The page is built for one day: the listings, the sample set, the
     forecast and the clock all assume TODAY. When the real day moves on,
     patching around a stale day only produces contradictions, so the page
     is rebuilt once for the new day; the answers are remembered. */
  if (localDay() !== TODAY) {
    window.location.reload();
    return;
  }
  pickClock();
  const minute = Math.floor(nowHour() * 60);
  if (minute === lastTickMinute) return;                /* same minute, same ranking */
  lastTickMinute = minute;
  render();
}, 30000);
