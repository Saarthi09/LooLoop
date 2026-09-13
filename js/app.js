import {
  loadEvents, SEED_USER, estimateTravel, geocode,
  INTERESTS, CIRCUMSTANCES, BUDGETS, SCOPES
} from "./data.js";
import { createRadial, stateOf, fmtClock, SPANS } from "./radial.js";

/* Single state object. Every handler mutates state, then calls render(). */
const state = {
  status: "loading",
  error: null,
  events: [],
  screen: "setup",           // setup | results
  origin: { ...SEED_USER.origin },
  travelSource: "feed",      // feed | estimated
  geo: { busy: false, note: null },
  view: "radial",            // radial | list
  spanId: "evening",
  selectedId: null,
  hoverId: null,
  pickIndex: 0,
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
        (f.interests.length === 0 || f.interests.some((t) => e.tags.includes(t))) &&
        e.price <= budgetMax(f.budget) &&
        (f.scope !== "campus" || e.scope === "campus")
    };
  }).sort((a, b) => a.hour - b.hour || a.travelMinutes - b.travelMinutes);
}

const isMatch = (e) => e.passes && e.inWindow && e.reachable;
const inSpan = (e) => e.hour >= span().start && e.hour <= span().end;

const countWith = (f) => decorate(state.events, f)
  .filter((e) => isMatch(e) && (state.screen === "setup" || inSpan(e))).length;
const withPatch = (patch) => ({ ...state.filters, ...patch });
const toggled = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const has = (e, c) => e.circumstances.includes(c);

/* How many listings would survive if this chip were the chosen answer.
   The same number does the work on the setup screen and in the rail. */
function chipCount(kind, value, on) {
  const f = state.filters;
  const patch = kind === "budget" ? { budget: value }
    : kind === "scope" ? { scope: value, maxTravel: (SCOPES.find((x) => x.id === value) || {}).minutes }
      : kind === "circ" ? { circumstances: on ? f.circumstances : [...f.circumstances, value] }
        : { interests: on ? f.interests : [...f.interests, value] };
  return countWith(withPatch(patch));
}

function costLine(e) {
  if (e.price === 0) return "Free";
  return has(e, "student-price") ? `$${e.price} student` : `$${e.price}`;
}

/* The short sentence that says why this is a sensible thing to do. */
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

const modeWord = (m) =>
  m === "walk" ? "on foot" : m === "transit" ? "on the bus" : m === "bike" ? "by bike" : "by car";

/* Ranked so an undecided person can take the first one and be fine. */
function rank(e) {
  return e.matchScore
    + (state.filters.interests.some((t) => e.tags.includes(t)) ? 0.25 : 0)
    + (e.price === 0 ? 0.15 : 0)
    + (has(e, "free-food") ? 0.1 : 0)
    + (has(e, "drop-in") ? 0.08 : 0)
    + (has(e, "beginner-welcome") && has(e, "solo-friendly") ? 0.1 : 0)
    - e.travelMinutes * 0.008;
}

/* ---- elements -------------------------------------------------------- */

const el = {
  standfirst: document.getElementById("standfirst"),
  editPrefs: document.getElementById("edit-prefs"),
  setup: document.getElementById("setup"),
  setupForm: document.getElementById("setup-form"),
  results: document.getElementById("results"),
  views: document.getElementById("views"),
  spans: document.getElementById("spans"),
  pick: document.getElementById("pick"),
  wrap: document.getElementById("canvas-wrap"),
  svg: document.getElementById("radial"),
  tip: document.getElementById("tip"),
  list: document.getElementById("list"),
  empty: document.getElementById("empty"),
  legend: document.getElementById("legend"),
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
let rail = null;

/* ---- setup screen ---------------------------------------------------- */

const toTimeValue = (h) => {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

const fromTimeValue = (v) => {
  const [hh, mm] = String(v).split(":").map(Number);
  return Number.isFinite(hh) ? hh + (mm || 0) / 60 : null;
};

function mountSetup() {
  const f = state.filters;
  el.setupForm.innerHTML = `
    <fieldset class="ask">
      <legend class="ask-q">Where are you starting from?</legend>
      <p class="ask-hint">Everything is measured from here, so it is worth getting right.</p>
      <p class="ask-origin" id="setup-origin"></p>
      <div class="find">
        <input type="search" id="setup-place" placeholder="Street and city" aria-label="Search a place">
        <button type="button" class="btn" id="setup-find">Find</button>
      </div>
      <button type="button" class="btn btn-wide" id="setup-geo">Use my location</button>
      <p class="ask-note" id="setup-geo-note"></p>
    </fieldset>

    <fieldset class="ask">
      <legend class="ask-q">What are you into?</legend>
      <p class="ask-hint">Pick a few, or none if you want to see everything.</p>
      <div class="chips">${INTERESTS.map((i) => chipHTML("tag", i.id, i.label)).join("")}</div>
    </fieldset>

    <fieldset class="ask">
      <legend class="ask-q">What can you spend?</legend>
      <p class="ask-hint">Most of what's on tonight is free.</p>
      <div class="chips" id="setup-budget">
        ${BUDGETS.map((b) => chipHTML("budget", b.id, b.label, b.id === f.budget)).join("")}
      </div>
    </fieldset>

    <fieldset class="ask">
      <legend class="ask-q">When are you free?</legend>
      <p class="ask-hint">The gap between finishing work and wanting to sleep.</p>
      <div class="times">
        <label class="time"><span>From</span><input type="time" id="setup-from" value="${toTimeValue(f.windowStart)}"></label>
        <label class="time"><span>Until</span><input type="time" id="setup-to" value="${toTimeValue(f.windowEnd)}"></label>
      </div>
    </fieldset>

    <fieldset class="ask">
      <legend class="ask-q">How far will you go?</legend>
      <p class="ask-hint">This sets the travel limit. You can stretch it later.</p>
      <div class="chips" id="setup-scope">
        ${SCOPES.map((s) => chipHTML("scope", s.id, s.label, s.id === f.scope)).join("")}
      </div>
    </fieldset>

    <fieldset class="ask">
      <legend class="ask-q">Anything we should know?</legend>
      <p class="ask-hint">Only what would stop you turning up.</p>
      <div class="chips">${CIRCUMSTANCES.map((c) => chipHTML("circ", c.id, c.label)).join("")}</div>
    </fieldset>

    <div class="ask ask-go">
      <button type="submit" class="btn btn-go">Show me what's on</button>
      <p class="ask-note" id="setup-count"></p>
    </div>`;

  el.setupForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    enterResults();
  });

  el.setupForm.addEventListener("click", (ev) => {
    const chip = ev.target.closest(".chip");
    if (!chip) return;
    const { kind, value } = chip.dataset;
    if (kind === "budget") state.filters.budget = value;
    else if (kind === "scope") setScope(value);
    else if (kind === "tag") state.filters.interests = toggled(state.filters.interests, value);
    else if (kind === "circ") state.filters.circumstances = toggled(state.filters.circumstances, value);
    render();
  });

  const from = el.setupForm.querySelector("#setup-from");
  const to = el.setupForm.querySelector("#setup-to");
  from.addEventListener("change", () => {
    const v = fromTimeValue(from.value);
    if (v == null) return;
    state.filters.windowStart = Math.min(v, state.filters.windowEnd - 0.25);
    fitSpan();
    render();
  });
  to.addEventListener("change", () => {
    const v = fromTimeValue(to.value);
    if (v == null) return;
    state.filters.windowEnd = Math.max(v, state.filters.windowStart + 0.25);
    fitSpan();
    render();
  });

  el.setupForm.querySelector("#setup-find")
    .addEventListener("click", () => findPlace(el.setupForm.querySelector("#setup-place").value));
  el.setupForm.querySelector("#setup-place")
    .addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      findPlace(ev.target.value);
    });
  el.setupForm.querySelector("#setup-geo").addEventListener("click", useMyLocation);
}

function updateSetup() {
  const f = state.filters;
  el.setupForm.querySelectorAll(".chip").forEach((chip) => {
    const { kind, value } = chip.dataset;
    const on = kind === "budget" ? f.budget === value
      : kind === "scope" ? f.scope === value
        : kind === "tag" ? f.interests.includes(value)
          : f.circumstances.includes(value);
    chip.setAttribute("aria-pressed", String(on));
    chip.classList.toggle("is-on", on);
    chip.querySelector(".chip-n").textContent = chipCount(kind, value, on);
  });

  el.setupForm.querySelector("#setup-origin").textContent = state.origin.label;
  el.setupForm.querySelector("#setup-geo-note").textContent =
    state.geo.busy ? "Looking that up." : (state.geo.note || "");

  const n = countWith(f);
  el.setupForm.querySelector("#setup-count").textContent = n === 0
    ? "Nothing matches that yet. Loosen one answer."
    : n === 1
      ? `One of ${state.events.length} listings matches so far.`
      : `${n} of ${state.events.length} listings match so far.`;
}

/* The scope answer sets the travel limit, then gets out of the way. */
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
  state.pickIndex = 0;
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

function chipHTML(kind, value, label, on = false) {
  return `<button type="button" class="chip${on ? " is-on" : ""}" data-kind="${kind}" data-value="${value}" aria-pressed="${on}">
    <span>${esc(label)}</span><span class="chip-n"></span>
  </button>`;
}

/* ---- toolbar --------------------------------------------------------- */

function mountToolbar() {
  el.views.innerHTML = [["radial", "Radial"], ["list", "List"]]
    .map(([v, label]) => `<button type="button" class="seg" data-view="${v}" aria-pressed="false">${label}</button>`)
    .join("");

  el.spans.innerHTML = Object.values(SPANS)
    .map((s) => `<button type="button" class="seg" data-span="${s.id}" aria-pressed="false">${s.label}</button>`)
    .join("");

  el.views.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-view]");
    if (!b) return;
    state.view = b.dataset.view;
    state.hoverId = null;
    render();
  });

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

  el.editPrefs.addEventListener("click", () => {
    state.screen = "setup";
    state.hoverId = null;
    render();
  });
}

/* ---- rail ------------------------------------------------------------ */

function mountRail() {
  el.rail.innerHTML = `
    <div class="rail-block rail-head">
      <p class="rail-count" id="count">0</p>
      <p class="rail-note" id="count-note"></p>
    </div>

    <div class="rail-block">
      <div class="rail-top">
        <h2 class="rail-h">Starting from</h2>
        <button type="button" class="link" id="origin-reset">Reset</button>
      </div>
      <p class="rail-fact" id="origin-label"></p>
      <p class="rail-sub" id="origin-note"></p>
      <div class="find">
        <input type="search" id="place" placeholder="Street and city" aria-label="Search a place">
        <button type="button" class="btn" id="place-go">Find</button>
      </div>
      <button type="button" class="btn btn-wide" id="geo">Use my location</button>
    </div>

    <div class="rail-block">
      <h2 class="rail-h">What you'll spend</h2>
      <div class="chips">${BUDGETS.map((b) => chipHTML("budget", b.id, b.label)).join("")}</div>
    </div>

    <div class="rail-block">
      <h2 class="rail-h">Where to look</h2>
      <div class="chips">${SCOPES.map((s) => chipHTML("scope", s.id, s.label)).join("")}</div>
    </div>

    <div class="rail-block">
      <div class="rail-top">
        <h2 class="rail-h">Free window</h2>
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
    </div>

    <div class="rail-block">
      <div class="rail-top">
        <h2 class="rail-h">Max travel</h2>
        <span class="rail-val" id="travel-val"></span>
      </div>
      <label class="slider">
        <span class="slider-cap">Minutes</span>
        <input type="range" id="travel" min="5" max="60" step="1">
      </label>
    </div>

    <div class="rail-block">
      <h2 class="rail-h">Anything we should know</h2>
      <div class="chips">${CIRCUMSTANCES.map((c) => chipHTML("circ", c.id, c.label)).join("")}</div>
    </div>

    <div class="rail-block">
      <h2 class="rail-h">What you're into</h2>
      <div class="chips">${INTERESTS.map((i) => chipHTML("tag", i.id, i.label)).join("")}</div>
    </div>`;

  const q = (s) => el.rail.querySelector(s);
  rail = {
    count: q("#count"), countNote: q("#count-note"),
    originLabel: q("#origin-label"), originNote: q("#origin-note"),
    place: q("#place"), placeGo: q("#place-go"), geo: q("#geo"), reset: q("#origin-reset"),
    windowVal: q("#window-val"), travelVal: q("#travel-val"),
    winStart: q("#win-start"), winEnd: q("#win-end"), travel: q("#travel"),
    chips: [...el.rail.querySelectorAll(".chip")]
  };

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

  rail.chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const { kind, value } = chip.dataset;
      if (kind === "budget") state.filters.budget = value;
      else if (kind === "scope") setScope(value);
      else if (kind === "circ") state.filters.circumstances = toggled(state.filters.circumstances, value);
      else state.filters.interests = toggled(state.filters.interests, value);
      state.reflow = "stagger";
      state.pickIndex = 0;
      render();
    });
  });

  rail.placeGo.addEventListener("click", () => findPlace(rail.place.value));
  rail.place.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    findPlace(rail.place.value);
  });
  rail.geo.addEventListener("click", useMyLocation);
  rail.reset.addEventListener("click", () => {
    state.origin = { ...SEED_USER.origin };
    state.travelSource = "feed";
    state.geo = { busy: false, note: null };
    state.reflow = "stagger";
    render();
  });
}

function updateRail(items) {
  const f = state.filters;
  const s = span();
  const shown = items.filter(inSpan);

  rail.count.textContent = shown.filter(isMatch).length;
  rail.countNote.textContent = s.start === 0 && s.end === 24
    ? `fit somewhere in the day, out of ${shown.length} listings.`
    : `fit between ${fmtClock(s.start)} and ${fmtClock(s.end)}, out of ${shown.length} listings in those hours.`;

  rail.originLabel.textContent = state.origin.label;
  rail.originNote.textContent = state.geo.busy
    ? "Looking that up."
    : state.geo.note || (state.travelSource === "feed"
      ? "Travel times as published."
      : "Travel times estimated from distance.");

  rail.windowVal.textContent = `${fmtClock(f.windowStart)} to ${fmtClock(f.windowEnd)}`;
  rail.travelVal.textContent = `${f.maxTravel} min`;

  [rail.winStart, rail.winEnd].forEach((input) => {
    input.min = s.start;
    input.max = s.end;
  });

  if (document.activeElement !== rail.winStart) rail.winStart.value = f.windowStart;
  if (document.activeElement !== rail.winEnd) rail.winEnd.value = f.windowEnd;
  if (document.activeElement !== rail.travel) rail.travel.value = f.maxTravel;

  rail.chips.forEach((chip) => {
    const { kind, value } = chip.dataset;
    const on = kind === "budget" ? f.budget === value
      : kind === "scope" ? f.scope === value
        : kind === "circ" ? f.circumstances.includes(value)
          : f.interests.includes(value);
    chip.setAttribute("aria-pressed", String(on));
    chip.classList.toggle("is-on", on);
    chip.querySelector(".chip-n").textContent = chipCount(kind, value, on);
  });
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
        : "The place lookup is not answering. Try a different place, or carry on with the published times."
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

/* ---- best pick ------------------------------------------------------- */

function renderPick(matches) {
  if (!matches.length) {
    el.pick.hidden = true;
    return;
  }
  const ranked = [...matches].sort((a, b) => rank(b) - rank(a));
  const e = ranked[state.pickIndex % ranked.length];

  el.pick.hidden = false;
  el.pick.innerHTML = `
    <div class="pick-main">
      <p class="pick-eyebrow">If you only do one thing</p>
      <h2 class="pick-title">${esc(e.title)}</h2>
      <p class="pick-where">${esc(e.venue)}, ${fmtClock(e.hour)}</p>
      <p class="pick-why">${esc(perks(e))}</p>
    </div>
    <dl class="pick-facts">
      <div><dt>Costs</dt><dd>${costLine(e)}</dd></div>
      <div><dt>Gone for</dt><dd>${fmtDuration(e.totalMinutes)}</dd></div>
      <div><dt>Back by</dt><dd>${fmtClock(e.backBy)}</dd></div>
    </dl>
    <div class="pick-actions">
      <button type="button" class="btn" id="pick-open">See it on the chart</button>
      ${ranked.length > 1 ? `<button type="button" class="link" id="pick-next">Something else</button>` : ""}
    </div>`;

  el.pick.querySelector("#pick-open").addEventListener("click", () => {
    state.view = "radial";
    state.selectedId = e.id;
    state.hoverId = e.id;
    render();
  });
  const next = el.pick.querySelector("#pick-next");
  if (next) next.addEventListener("click", () => {
    state.pickIndex = (state.pickIndex + 1) % ranked.length;
    render();
  });
}

function fmtDuration(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* ---- render ---------------------------------------------------------- */

function render() {
  if (state.status === "loading") {
    el.standfirst.textContent = "Loading what's on around Waterloo.";
    return;
  }
  if (state.status === "error") {
    el.standfirst.textContent = `The listings did not load. ${state.error}. Reload to try again.`;
    return;
  }

  const onSetup = state.screen === "setup";
  el.setup.hidden = !onSetup;
  el.results.hidden = onSetup;
  el.editPrefs.hidden = onSetup;

  if (onSetup) {
    el.standfirst.textContent = "Answer these and we'll only show what you can actually get to.";
    updateSetup();
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

  [...el.views.children].forEach((b) => setPressed(b, b.dataset.view === state.view));
  [...el.spans.children].forEach((b) => setPressed(b, b.dataset.span === state.spanId));

  const isRadial = state.view === "radial";
  el.wrap.hidden = !isRadial;
  el.legend.hidden = !isRadial;
  el.list.hidden = isRadial;
  el.empty.hidden = matches.length > 0;
  el.svg.classList.toggle("is-live-drag", state.reflow === "live" && !revealing);

  renderPick(matches);

  radial.update({
    items,
    span: span(),
    windowStart: state.filters.windowStart,
    windowEnd: state.filters.windowEnd,
    maxTravel: state.filters.maxTravel,
    originLabel: state.origin.label,
    delay: delayFor(items)
  });

  if (!isRadial) renderList(shown);
  renderTip();
  updateRail(items);
}

function setPressed(button, on) {
  button.setAttribute("aria-pressed", String(on));
  button.classList.toggle("is-on", on);
}

/* ---- list view ------------------------------------------------------- */

function renderList(items) {
  const head = `<div class="list-head" aria-hidden="true">
    <span>Starts</span><span>What and where</span><span>Getting there</span>
    <span>Costs</span><span>Back by</span><span>Fit</span>
  </div>`;

  el.list.innerHTML = head + items.map((e) => {
    const s = stateOf(e, span());
    const sel = e.id === state.selectedId ? " is-sel" : "";
    return `<button type="button" class="row is-${s}${sel}" data-id="${e.id}">
      <span class="row-time">${fmtClock(e.hour)}</span>
      <span class="row-main">
        <span class="row-title">${esc(e.title)}</span>
        <span class="row-venue">${esc(e.venue)}</span>
      </span>
      <span class="row-travel">${e.travelMinutes} min ${modeWord(e.travelMode)}</span>
      <span class="row-price">${costLine(e)}</span>
      <span class="row-back">${fmtClock(e.backBy)}</span>
      <span class="row-why">${why(e)}</span>
    </button>`;
  }).join("");

  el.list.querySelectorAll(".row").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedId = state.selectedId === row.dataset.id ? null : row.dataset.id;
      render();
    });
  });
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

/* ---- hover text ------------------------------------------------------ */

function renderTip() {
  if (state.screen !== "setup" && state.hoverId) {
    const e = decorate(state.events, state.filters).find((x) => x.id === state.hoverId);
    const dot = e && radial.dots.get(e.id);
    if (e && dot && state.view === "radial" && stateOf(e, span()) !== "off") {
      showTip(e, dot);
      return;
    }
  }
  el.tip.hidden = true;
}

function showTip(e, dot) {
  el.tip.innerHTML = `
    <span class="tip-title">${esc(e.title)}</span>
    <span class="tip-venue">${esc(e.venue)}</span>
    <span class="tip-grid">
      <span class="tip-k">Time</span><span class="tip-v">${fmtClock(e.hour)} to ${fmtClock(e.endHour)}</span>
      <span class="tip-k">Getting there</span><span class="tip-v">${e.travelMinutes} min ${modeWord(e.travelMode)}</span>
      <span class="tip-k">Costs</span><span class="tip-v">${costLine(e)}</span>
      <span class="tip-k">Gone for</span><span class="tip-v">${fmtDuration(e.totalMinutes)}, back by ${fmtClock(e.backBy)}</span>
    </span>
    <span class="tip-why">${why(e)}</span>`;
  el.tip.hidden = false;

  const wrap = el.wrap.getBoundingClientRect();
  const r = dot.getBoundingClientRect();
  const w = el.tip.offsetWidth;
  const h = el.tip.offsetHeight;
  const x = r.left + r.width / 2 - wrap.left;
  const above = r.top - wrap.top - h - 10;
  el.tip.style.left = `${clamp(x - w / 2, 4, Math.max(4, wrap.width - w - 4))}px`;
  el.tip.style.top = `${above < 0 ? r.bottom - wrap.top + 10 : above}px`;
}

/* ---- helpers --------------------------------------------------------- */

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

render();

loadEvents()
  .then((events) => {
    state.events = events;
    state.status = "ready";

    mountSetup();
    mountToolbar();
    mountRail();
    el.legend.innerHTML = `
      <span class="key"><svg class="key-dot" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" class="is-match"></circle></svg>you can get to this</span>
      <span class="key"><svg class="key-dot" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" class="is-late"></circle></svg>reachable, wrong time</span>
      <span class="key"><svg class="key-dot" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" class="is-out"></circle></svg>ruled out by your answers</span>`;

    render();
  })
  .catch((err) => {
    state.error = err.message;
    state.status = "error";
    render();
  });

window.addEventListener("resize", renderTip);
