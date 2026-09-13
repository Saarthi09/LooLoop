import { loadEvents, SEED_USER } from "./data.js";
import { createRadial, T_START, T_END } from "./radial.js";

/* Single state object. Every handler mutates state, then calls render(). */
const state = {
  status: "loading",
  error: null,
  events: [],
  user: SEED_USER,
  selectedId: null,
  reflow: "stagger",       // stagger | live, set by the control that moved
  filters: {
    windowStart: 18.5,
    windowEnd: 21,
    maxTravel: SEED_USER.maxTravelMinutes,
    circumstances: [],
    interests: []
  }
};

/* ---- derived --------------------------------------------------------- */

const hourOf = (iso) => {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
};

const fmtClock = (h) => {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  const half = hh % 12 === 0 ? 12 : hh % 12;
  return `${half}:${String(mm).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`;
};

function decorate(events, f) {
  return events.map((e) => {
    const h = hourOf(e.startsAt);
    const okCirc = f.circumstances.every((c) => e.circumstances.includes(c));
    const okTags = f.interests.length === 0 || f.interests.some((t) => e.tags.includes(t));
    return {
      ...e,
      hour: h,
      inWindow: h >= f.windowStart && h <= f.windowEnd,
      reachable: e.travelMinutes <= f.maxTravel,
      passes: okCirc && okTags
    };
  }).sort((a, b) => a.hour - b.hour || a.travelMinutes - b.travelMinutes);
}

const isMatch = (e) => e.passes && e.inWindow && e.reachable;

/* How many would fit if the filters were f. Used for every live count. */
const countWith = (f) => decorate(state.events, f).filter(isMatch).length;
const withPatch = (patch) => ({ ...state.filters, ...patch });

const toggled = (list, v) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

/* ---- elements -------------------------------------------------------- */

const el = {
  standfirst: document.getElementById("standfirst"),
  svg: document.getElementById("radial"),
  empty: document.getElementById("empty"),
  legend: document.getElementById("legend"),
  rail: document.getElementById("rail")
};

const radial = createRadial(el.svg, {
  onSelect: (id) => {
    state.selectedId = id;
    render();
  }
});

let revealing = true;
let rail = null;

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
      <p class="rail-note">fit tonight, out of ${state.events.length} listings near you.</p>
    </div>

    <div class="rail-block">
      <div class="rail-top">
        <h2 class="rail-h">Free window</h2>
        <span class="rail-val" id="window-val"></span>
      </div>
      <label class="slider">
        <span class="slider-cap">Start</span>
        <input type="range" id="win-start" min="${T_START}" max="${T_END}" step="0.25">
      </label>
      <label class="slider">
        <span class="slider-cap">End</span>
        <input type="range" id="win-end" min="${T_START}" max="${T_END}" step="0.25">
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
      <div class="chips" id="chips-circ">
        ${circs.map((c) => chipHTML("circ", c)).join("")}
      </div>
    </div>

    <div class="rail-block">
      <h2 class="rail-h">What you're into</h2>
      <div class="chips" id="chips-tag">
        ${tags.map((t) => chipHTML("tag", t)).join("")}
      </div>
    </div>`;

  rail = {
    count: el.rail.querySelector("#count"),
    windowVal: el.rail.querySelector("#window-val"),
    travelVal: el.rail.querySelector("#travel-val"),
    winStart: el.rail.querySelector("#win-start"),
    winEnd: el.rail.querySelector("#win-end"),
    travel: el.rail.querySelector("#travel"),
    chips: [...el.rail.querySelectorAll(".chip")]
  };

  rail.winStart.addEventListener("input", () => {
    const v = Number(rail.winStart.value);
    state.filters.windowStart = Math.min(v, state.filters.windowEnd - 0.25);
    state.reflow = "live";
    render();
  });

  rail.winEnd.addEventListener("input", () => {
    const v = Number(rail.winEnd.value);
    state.filters.windowEnd = Math.max(v, state.filters.windowStart + 0.25);
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
      const key = kind === "circ" ? "circumstances" : "interests";
      state.filters[key] = toggled(state.filters[key], value);
      state.reflow = "stagger";
      render();
    });
  });
}

function chipHTML(kind, value) {
  return `<button type="button" class="chip" data-kind="${kind}" data-value="${value}" aria-pressed="false">
    <span class="chip-label">${value.replace(/-/g, " ")}</span><span class="chip-n"></span>
  </button>`;
}

function updateRail(items) {
  const f = state.filters;
  rail.count.textContent = items.filter(isMatch).length;
  rail.windowVal.textContent = `${fmtClock(f.windowStart)} to ${fmtClock(f.windowEnd)}`;
  rail.travelVal.textContent = `${f.maxTravel} min`;

  if (document.activeElement !== rail.winStart) rail.winStart.value = f.windowStart;
  if (document.activeElement !== rail.winEnd) rail.winEnd.value = f.windowEnd;
  if (document.activeElement !== rail.travel) rail.travel.value = f.maxTravel;

  rail.chips.forEach((chip) => {
    const { kind, value } = chip.dataset;
    const key = kind === "circ" ? "circumstances" : "interests";
    const on = f[key].includes(value);
    chip.setAttribute("aria-pressed", String(on));
    chip.classList.toggle("is-on", on);
    chip.querySelector(".chip-n").textContent =
      countWith(withPatch({ [key]: on ? f[key] : [...f[key], value] }));
  });
}

/* ---- render ---------------------------------------------------------- */

function render() {
  if (state.status === "loading") {
    el.standfirst.textContent = `Checking what's on near ${state.user.origin.label}.`;
    return;
  }

  if (state.status === "error") {
    el.standfirst.textContent = `The listings did not load. ${state.error}. Reload to try again.`;
    return;
  }

  const items = decorate(state.events, state.filters);
  const matches = items.filter(isMatch);

  el.standfirst.textContent = state.selectedId
    ? describeSelected(items)
    : `${matches.length} of tonight's listings fit the time you have and the distance you'll go.`;

  el.empty.hidden = matches.length > 0;
  el.svg.classList.toggle("is-live-drag", state.reflow === "live" && !revealing);

  radial.update({
    items,
    windowStart: state.filters.windowStart,
    windowEnd: state.filters.windowEnd,
    maxTravel: state.filters.maxTravel,
    originLabel: state.user.origin.label,
    delay: delayFor(items)
  });

  updateRail(items);
}

/* Reveal orders by radius, reflow orders by index, drags do not stagger. */
function delayFor(items) {
  if (revealing) {
    const byTravel = [...items].sort((a, b) => a.travelMinutes - b.travelMinutes).map((e) => e.id);
    return (p) => `${500 + Math.min(byTravel.indexOf(p.e.id) * 7, 120)}ms`;
  }
  if (state.reflow === "live") return () => "0ms";
  return (p, i) => `${Math.min(i * 14, 440)}ms`;
}

function describeSelected(items) {
  const e = items.find((x) => x.id === state.selectedId);
  if (!e) return "";
  return `${e.title}, ${fmtClock(e.hour)}, ${e.travelMinutes} minutes by ${e.travelMode}.`;
}

/* ---- boot ------------------------------------------------------------ */

render();

loadEvents()
  .then((events) => {
    state.events = events;
    state.status = "ready";

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
