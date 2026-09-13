import { loadEvents, SEED_USER, estimateTravel, geocode } from "./data.js";
import { createRadial, stateOf, fmtClock, SPANS } from "./radial.js";

/* Single state object. Every handler mutates state, then calls render(). */
const state = {
  status: "loading",
  error: null,
  events: [],
  user: SEED_USER,
  origin: { ...SEED_USER.origin },
  travelSource: "feed",      // feed | estimated
  view: "radial",            // radial | list
  spanId: "evening",
  selectedId: null,
  hoverId: null,
  geo: { busy: false, note: null },
  reflow: "stagger",         // stagger | live, set by the control that moved
  filters: {
    windowStart: 18.5,
    windowEnd: 21,
    maxTravel: SEED_USER.maxTravelMinutes,
    circumstances: [],
    interests: []
  }
};

const span = () => SPANS[state.spanId];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---- derived --------------------------------------------------------- */

const hourOf = (iso) => {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
};

/* The feed's own travelMinutes stands until the user moves off the default
   origin; after that everything is estimated from coordinates. */
const travelFor = (e) =>
  state.travelSource === "feed" ? e.travelMinutes : (estimateTravel(state.origin, e) ?? e.travelMinutes);

function decorate(events, f) {
  return events.map((e) => {
    const h = hourOf(e.startsAt);
    const travel = travelFor(e);
    const okCirc = f.circumstances.every((c) => e.circumstances.includes(c));
    const okTags = f.interests.length === 0 || f.interests.some((t) => e.tags.includes(t));
    return {
      ...e,
      hour: h,
      endHour: hourOf(e.endsAt),
      travelMinutes: travel,
      inWindow: h >= f.windowStart && h <= f.windowEnd,
      reachable: travel <= f.maxTravel,
      passes: okCirc && okTags
    };
  }).sort((a, b) => a.hour - b.hour || a.travelMinutes - b.travelMinutes);
}

const isMatch = (e) => e.passes && e.inWindow && e.reachable;
const inSpan = (e) => e.hour >= span().start && e.hour <= span().end;

const countWith = (f) => decorate(state.events, f).filter((e) => isMatch(e) && inSpan(e)).length;
const withPatch = (patch) => ({ ...state.filters, ...patch });

const toggled = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const fmtPrice = (e) => (e.price === 0 ? "Free" : `$${e.price}`);

/* ---- elements -------------------------------------------------------- */

const el = {
  standfirst: document.getElementById("standfirst"),
  views: document.getElementById("views"),
  spans: document.getElementById("spans"),
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

let revealing = true;
let rail = null;

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
    setSpan(b.dataset.span);
    render();
  });
}

/* Changing the axis is a view change, so the free window follows it in
   rather than falling off the edge. */
function setSpan(id) {
  state.spanId = id;
  const s = SPANS[id];
  state.reflow = "stagger";
  state.filters.windowStart = clamp(state.filters.windowStart, s.start, s.end - 0.25);
  state.filters.windowEnd = clamp(state.filters.windowEnd, state.filters.windowStart + 0.25, s.end);
}

/* ---- rail ------------------------------------------------------------ */

const CIRC_ORDER = [
  "solo-friendly", "free", "step-free", "no-alcohol",
  "beginner-welcome", "quiet", "kid-friendly", "transit-reachable"
];

function mountRail() {
  const circs = CIRC_ORDER.filter((c) => state.events.some((e) => e.circumstances.includes(c)));
  const tags = [...new Set(state.events.flatMap((e) => e.tags))].sort();

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
      <h2 class="rail-h">Anything I should know</h2>
      <div class="chips">${circs.map((c) => chipHTML("circ", c)).join("")}</div>
    </div>

    <div class="rail-block">
      <h2 class="rail-h">What you're into</h2>
      <div class="chips">${tags.map((t) => chipHTML("tag", t)).join("")}</div>
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
      const key = chip.dataset.kind === "circ" ? "circumstances" : "interests";
      state.filters[key] = toggled(state.filters[key], chip.dataset.value);
      state.reflow = "stagger";
      render();
    });
  });

  rail.placeGo.addEventListener("click", findPlace);
  rail.place.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); findPlace(); }
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

function chipHTML(kind, value) {
  return `<button type="button" class="chip" data-kind="${kind}" data-value="${value}" aria-pressed="false">
    <span>${value.replace(/-/g, " ")}</span><span class="chip-n"></span>
  </button>`;
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
    : state.geo.note
      ? state.geo.note
      : state.travelSource === "feed"
        ? "Travel times as published."
        : "Travel times estimated from distance.";

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
    const key = chip.dataset.kind === "circ" ? "circumstances" : "interests";
    const on = f[key].includes(chip.dataset.value);
    chip.setAttribute("aria-pressed", String(on));
    chip.classList.toggle("is-on", on);
    chip.querySelector(".chip-n").textContent =
      countWith(withPatch({ [key]: on ? f[key] : [...f[key], chip.dataset.value] }));
  });
}

/* ---- location -------------------------------------------------------- */

async function findPlace() {
  const query = rail.place.value.trim();
  if (!query) return;
  state.geo = { busy: true, note: null };
  render();
  try {
    const hit = await geocode(query);
    state.origin = hit;
    state.travelSource = "estimated";
    state.geo = { busy: false, note: null };
  } catch (err) {
    state.geo = {
      busy: false,
      note: err.message === "no match"
        ? "No place by that name. Try a street and city."
        : "The place lookup is not answering. Type a different place, or carry on with the published times."
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

/* ---- render ---------------------------------------------------------- */

function render() {
  if (state.status === "loading") {
    el.standfirst.textContent = `Checking what's on near ${state.origin.label}.`;
    return;
  }

  if (state.status === "error") {
    el.standfirst.textContent = `The listings did not load. ${state.error}. Reload to try again.`;
    return;
  }

  const items = decorate(state.events, state.filters);
  const shown = items.filter(inSpan);
  const matches = shown.filter(isMatch);

  el.standfirst.textContent = state.selectedId
    ? describeSelected(items)
    : `${matches.length} listings fit the time you have and the distance you'll go.`;

  [...el.views.children].forEach((b) =>
    setPressed(b, b.dataset.view === state.view));
  [...el.spans.children].forEach((b) =>
    setPressed(b, b.dataset.span === state.spanId));

  const isRadial = state.view === "radial";
  el.wrap.hidden = !isRadial;
  el.legend.hidden = !isRadial;
  el.list.hidden = isRadial;
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
  if (!items.length) {
    el.list.innerHTML = "";
    return;
  }
  const head = `<div class="list-head" aria-hidden="true">
    <span>Starts</span><span>What and where</span><span>Travel</span><span>Price</span><span>Fit</span>
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
      <span class="row-travel">${e.travelMinutes} min ${e.travelMode}</span>
      <span class="row-price">${fmtPrice(e)}</span>
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

function why(e) {
  if (isMatch(e)) return "fits";
  if (!e.reachable) return "too far";
  if (!e.inWindow) return "wrong time";
  return "filtered out";
}

/* ---- hover text ------------------------------------------------------ */

function renderTip() {
  const e = state.hoverId && decorate(state.events, state.filters).find((x) => x.id === state.hoverId);
  const dot = e && radial.dots.get(e.id);
  if (!e || !dot || state.view !== "radial" || stateOf(e, span()) === "off") {
    el.tip.hidden = true;
    return;
  }

  el.tip.innerHTML = `
    <span class="tip-title">${esc(e.title)}</span>
    <span class="tip-venue">${esc(e.venue)}</span>
    <span class="tip-grid">
      <span class="tip-k">Time</span><span class="tip-v">${fmtClock(e.hour)} to ${fmtClock(e.endHour)}</span>
      <span class="tip-k">Travel</span><span class="tip-v">${e.travelMinutes} min by ${e.travelMode}</span>
      <span class="tip-k">Price</span><span class="tip-v">${fmtPrice(e)}</span>
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
  return `${e.title}, ${e.venue}, ${fmtClock(e.hour)}, ${e.travelMinutes} minutes by ${e.travelMode}.`;
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

    mountToolbar();
    mountRail();
    el.legend.innerHTML = `
      <span class="key"><svg class="key-dot" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" class="is-match"></circle></svg>fits your window</span>
      <span class="key"><svg class="key-dot" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" class="is-late"></circle></svg>reachable, wrong time</span>
      <span class="key"><svg class="key-dot" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" class="is-out"></circle></svg>filtered out</span>`;

    el.svg.classList.add("is-live", "is-reveal");
    render();

    setTimeout(() => {
      revealing = false;
      el.svg.classList.remove("is-reveal");
      render();
    }, 950);
  })
  .catch((err) => {
    state.error = err.message;
    state.status = "error";
    render();
  });

window.addEventListener("resize", renderTip);
