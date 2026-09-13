import { loadEvents, SEED_USER } from "./data.js";

/* Single state object. Every handler mutates state, then calls render(). */
const state = {
  status: "loading",      // loading | ready | error
  error: null,
  events: [],
  user: SEED_USER,
  filters: {
    windowStart: 18.5,    // fractional hours, local
    windowEnd: 21,
    maxTravel: SEED_USER.maxTravelMinutes,
    circumstances: [],
    interests: []
  }
};

/* ---- derived --------------------------------------------------------- */

export const hourOf = (iso) => {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
};

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const fmtPrice = (e) => (e.price === 0 ? "Free" : `$${e.price}`);

function decorate(events, f) {
  return events.map((e) => {
    const h = hourOf(e.startsAt);
    const inWindow = h >= f.windowStart && h <= f.windowEnd;
    const reachable = e.travelMinutes <= f.maxTravel;
    const okCirc = f.circumstances.every((c) => e.circumstances.includes(c));
    const okTags = f.interests.length === 0 || f.interests.some((t) => e.tags.includes(t));
    return { ...e, hour: h, inWindow, reachable, passes: okCirc && okTags };
  });
}

/* ---- render ---------------------------------------------------------- */

const el = {
  standfirst: document.getElementById("standfirst"),
  rows: document.getElementById("rows"),
  rail: document.getElementById("rail")
};

function render() {
  if (state.status === "loading") {
    el.standfirst.textContent = `Checking what's on near ${state.user.origin.label}.`;
    el.rows.innerHTML = `<p class="notice">Reading tonight's listings.</p>`;
    el.rail.innerHTML = "";
    return;
  }

  if (state.status === "error") {
    el.standfirst.textContent = "The listings did not load.";
    el.rows.innerHTML =
      `<p class="notice">${state.error}. Reload the page to try again.</p>`;
    el.rail.innerHTML = "";
    return;
  }

  const items = decorate(state.events, state.filters).sort((a, b) => a.hour - b.hour);
  const matches = items.filter((e) => e.passes && e.inWindow && e.reachable);

  el.standfirst.textContent =
    `Tonight near ${state.user.origin.label}, within ${state.filters.maxTravel} minutes of travel.`;

  el.rows.innerHTML = items.length === 0
    ? `<p class="notice">Nothing fits that window. Try widening the time or the travel distance.</p>`
    : items.map(rowHTML).join("");

  el.rail.innerHTML = `
    <div class="rail-block">
      <h2 class="rail-h">Fits your evening</h2>
      <p class="rail-count">${matches.length}</p>
      <p class="rail-note">of ${items.length} listings, inside your free window and inside your travel limit.</p>
    </div>
    <div class="rail-block">
      <h2 class="rail-h">Free window</h2>
      <p class="rail-fact">${clock(state.filters.windowStart)} to ${clock(state.filters.windowEnd)}</p>
    </div>
    <div class="rail-block">
      <h2 class="rail-h">Travel limit</h2>
      <p class="rail-fact">${state.filters.maxTravel} minutes</p>
    </div>
    <div class="rail-block">
      <h2 class="rail-h">Starting from</h2>
      <p class="rail-fact">${state.user.origin.label}</p>
    </div>`;
}

function rowHTML(e) {
  const match = e.passes && e.inWindow && e.reachable;
  const cls = ["row", match ? "is-match" : "is-dim"].join(" ");
  return `<div class="${cls}">
    <span class="row-time">${fmtTime(e.startsAt)}</span>
    <span class="row-main">
      <span class="row-title">${escape(e.title)}</span>
      <span class="row-venue">${escape(e.venue)}</span>
    </span>
    <span class="row-travel">${e.travelMinutes} min ${e.travelMode}</span>
    <span class="row-price">${fmtPrice(e)}</span>
  </div>`;
}

function clock(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function escape(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* ---- boot ------------------------------------------------------------ */

render();

loadEvents()
  .then((events) => {
    state.events = events;
    state.status = "ready";
    render();
  })
  .catch((err) => {
    state.error = err.message;
    state.status = "error";
    render();
  });
