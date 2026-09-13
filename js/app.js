import {
  loadEvents, SEED_USER, estimateTravel, geocode, similarity,
  INTERESTS, CIRCUMSTANCES, BUDGETS, SCOPES, ART_PALETTES
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

/* ---- generated artwork ------------------------------------------------
   One deterministic cover per event, built from the same arcs and dots
   the chart uses. No network, so it cannot fail on a conference wifi. */

const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const artCache = new Map();

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function artFor(e) {
  if (artCache.has(e.id)) return artCache.get(e.id);
  const pal = (ART_PALETTES[e.tags[0]] || ART_PALETTES.social).map((n) => cssVar(`--${n}`));
  const n = hash(e.id);
  const W = 300, H = 190;
  let shapes = "";

  switch (n % 4) {
    case 0:
      for (let i = 3; i >= 1; i--) {
        shapes += `<circle cx="46" cy="${H - 14}" r="${i * 56 + 12}" fill="none" stroke="${pal[i % 2 + 1]}" stroke-width="${9 + i * 5}"/>`;
      }
      break;
    case 1:
      shapes += `<circle cx="${210 + (n % 30)}" cy="${64 + (n % 20)}" r="72" fill="${pal[1]}"/>`;
      shapes += `<rect x="0" y="${H - 54}" width="${W}" height="17" fill="${pal[2]}"/>`;
      shapes += `<rect x="0" y="${H - 28}" width="${W * 0.62}" height="17" fill="${pal[1]}"/>`;
      break;
    case 2:
      for (let i = 0; i < 5; i++) {
        const x = -70 + i * 76;
        shapes += `<polygon points="${x},${H} ${x + 40},${H} ${x + 40 + 70},0 ${x + 70},0" fill="${pal[i % 2 + 1]}" opacity="${i % 2 ? 1 : 0.88}"/>`;
      }
      break;
    default:
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 6; c++) {
          shapes += `<circle cx="${26 + c * 50}" cy="${28 + r * 45}" r="7" fill="${pal[2]}"/>`;
        }
      }
      shapes += `<circle cx="${96 + (n % 4) * 50}" cy="${73 + (n % 2) * 45}" r="40" fill="${pal[1]}"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    `<rect width="${W}" height="${H}" fill="${pal[0]}"/>${shapes}</svg>`;
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
      <p class="ask-note" id="w-geo-note"></p>`
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
    if (kind === "budget") state.filters.budget = value;
    else if (kind === "scope") setScope(value);
    else if (kind === "tag") state.filters.interests = toggled(state.filters.interests, value);
    else if (kind === "circ") state.filters.circumstances = toggled(state.filters.circumstances, value);
    updateStep();
  });
}

function renderStep() {
  const s = STEPS[state.step];
  el.stepCount.textContent = `Question ${state.step + 1} of ${STEPS.length}`;
  el.stepQ.textContent = s.q;
  el.stepHint.textContent = s.hint;
  el.stepBody.innerHTML = s.body();
  el.stepBack.disabled = state.step === 0;
  el.stepNext.textContent = state.step === STEPS.length - 1 ? "Show me what's on" : "Next";
  el.stepSkip.hidden = state.step === STEPS.length - 1;
  wireStep(s);
  updateStep();
  const first = el.stepBody.querySelector("button, input");
  if (first) first.focus({ preventScroll: true });
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
  state.hoverId = null;
  render();
}

/* ---- location -------------------------------------------------------- */

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

function useMyLocation() {
  if (!navigator.geolocation) {
    state.geo = { busy: false, note: "This browser will not share a location. Type a place instead." };
    render();
    return;
  }
  state.geo = { busy: true, note: null };
  render();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      /* Coordinates stay in the page. Nothing is sent anywhere to name them. */
      state.origin = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        label: "Where you are now"
      };
      state.travelSource = "estimated";
      state.geo = { busy: false, note: null };
      state.reflow = "stagger";
      render();
    },
    (err) => {
      state.geo = {
        busy: false,
        note: err.code === err.PERMISSION_DENIED
          ? "Your browser is holding the location back. Type a place instead."
          : "Could not get a fix. Type a place instead."
      };
      render();
    },
    { timeout: 8000, maximumAge: 300000 }
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
