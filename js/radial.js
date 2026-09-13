/* Polar canvas. Angle is clock time, radius is travel time.
   The time span is a property of the view, not a constant: the axis can
   cover the whole day or any slice of it. */

const SVG = "http://www.w3.org/2000/svg";

export const SPANS = {
  day:      { id: "day",      label: "All day",  start: 0,  end: 24 },
  daylight: { id: "daylight", label: "Daytime",  start: 6,  end: 18 },
  evening:  { id: "evening",  label: "Evening",  start: 17, end: 23 }
};

const CX = 350, CY = 340;
const R_MIN = 48, R_MAX = 240;
const RINGS = [10, 25, 45];

const clampHour = (h, span) => Math.max(span.start, Math.min(span.end, h));

export const angleFor = (h, span) =>
  Math.PI * (1 - (clampHour(h, span) - span.start) / (span.end - span.start));

export const radiusFor = (m, maxMin) =>
  R_MIN + (Math.min(m, maxMin) / maxMin) * (R_MAX - R_MIN);

export const pointFor = (h, m, maxMin, span) => {
  const a = angleFor(h, span), r = radiusFor(m, maxMin);
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a), r };
};

const make = (name, attrs = {}) => {
  const n = document.createElementNS(SVG, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

export const hourLabel = (h) => {
  const hh = h % 12 === 0 ? 12 : Math.floor(h) % 12;
  return `${hh} ${h < 12 || h === 24 ? "am" : "pm"}`;
};

export const fmtClock = (h) => {
  const raw = Math.floor(h), hh = raw % 24, mm = Math.round((h - raw) * 60);
  const half = hh % 12 === 0 ? 12 : hh % 12;
  return `${half}:${String(mm).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`;
};

/* Enough ticks to read the clock, few enough to stay legible. */
function tickHours(span) {
  const width = span.end - span.start;
  const step = width <= 8 ? 1 : width <= 14 ? 2 : 3;
  const ticks = [];
  for (let t = span.start; t <= span.end + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
  return ticks;
}

/* One pass of collision relief: nudge the later dot out along its own radius. */
function place(items, maxMin, span) {
  const pts = items.map((e) => {
    const p = pointFor(e.hour, e.travelMinutes, maxMin, span);
    return { e, x: p.x, y: p.y, nudged: false };
  });
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 15) {
        const a = angleFor(pts[j].e.hour, span);
        pts[j].x += 11 * Math.cos(a);
        pts[j].y -= 11 * Math.sin(a);
        pts[j].nudged = true;
      }
    }
  }
  return pts;
}

export function stateOf(e, span) {
  if (e.hour < span.start || e.hour > span.end) return "off";
  if (!e.passes || !e.reachable) return "out";
  return e.inWindow ? "match" : "late";
}

export function labelFor(e) {
  const price = e.price === 0 ? "free" : `$${e.price}`;
  const fit = e.passes && e.inWindow && e.reachable ? "fits your evening" : "outside your window";
  return `${e.title}, ${e.venue}, ${fmtClock(e.hour)}, ${e.travelMinutes} minutes by ${e.travelMode}, ${price}, ${fit}`;
}

export function createRadial(root, { onSelect, onHover } = {}) {
  root.setAttribute("viewBox", "0 0 700 420");

  const defs = make("defs");
  const clip = make("clipPath", { id: "loo-top" });
  clip.appendChild(make("rect", { x: 0, y: 0, width: 700, height: CY }));
  defs.appendChild(clip);

  const field = make("g", { "clip-path": "url(#loo-top)", class: "field" });

  /* The recessed surface is the half-disc itself, not a bounding box. */
  field.appendChild(make("path", {
    class: "disc",
    d: `M ${CX - R_MAX} ${CY} A ${R_MAX} ${R_MAX} 0 0 1 ${CX + R_MAX} ${CY} Z`
  }));

  const wedge = make("path", { class: "wedge" });
  field.appendChild(wedge);

  const ringEls = RINGS.map(() => make("circle", { class: "ring", cx: CX, cy: CY, r: 0 }));
  ringEls.forEach((r) => field.appendChild(r));
  const rim = make("circle", { class: "rim", cx: CX, cy: CY, r: R_MAX });
  field.appendChild(rim);

  const chrome = make("g", { class: "chrome" });
  chrome.appendChild(make("line", {
    class: "baseline", x1: CX - R_MAX, y1: CY, x2: CX + R_MAX, y2: CY
  }));
  chrome.appendChild(make("circle", { class: "origin", cx: CX, cy: CY, r: 3.5 }));

  const hours = make("g", { class: "hours" });
  chrome.appendChild(hours);

  const ringLabels = RINGS.map(() => {
    const t = make("text", { class: "ring-label", y: CY + 18, "text-anchor": "middle" });
    chrome.appendChild(t);
    return t;
  });

  const rimLabel = make("text", { class: "ring-label", x: CX - R_MAX, y: CY + 18, "text-anchor": "start" });
  chrome.appendChild(rimLabel);

  const originLabel = make("text", { class: "origin-label", x: CX, y: CY + 40, "text-anchor": "middle" });
  chrome.appendChild(originLabel);

  const dotLayer = make("g", { class: "dots" });

  root.append(defs, field, chrome, dotLayer);

  let order = [];
  let reachable = [];
  let activeId = null;      /* roving tabindex: one stop for the whole layer */
  let drawnSpan = null;
  const dots = new Map();

  function syncTabindex() {
    const active = reachable.includes(activeId) ? activeId : reachable[0];
    dots.forEach((c, id) => c.setAttribute("tabindex", id === active ? "0" : "-1"));
  }

  function drawHours(span) {
    if (drawnSpan && drawnSpan.start === span.start && drawnSpan.end === span.end) return;
    drawnSpan = { start: span.start, end: span.end };
    hours.textContent = "";
    tickHours(span).forEach((h, i) => {
      const a = angleFor(h, span);
      hours.appendChild(make("line", {
        class: "tick",
        x1: CX + R_MAX * Math.cos(a), y1: CY - R_MAX * Math.sin(a),
        x2: CX + (R_MAX + 7) * Math.cos(a), y2: CY - (R_MAX + 7) * Math.sin(a)
      }));
      if (i % 2 !== 0) return;
      const rr = R_MAX + 20;
      const t = make("text", {
        class: "hour-label",
        x: CX + rr * Math.cos(a),
        y: CY - rr * Math.sin(a) + 4,
        "text-anchor": Math.cos(a) < -0.5 ? "end" : Math.cos(a) > 0.5 ? "start" : "middle"
      });
      t.textContent = hourLabel(h);
      hours.appendChild(t);
    });
  }

  function ensureDots(items) {
    let made = false;
    items.forEach((e) => {
      if (dots.has(e.id)) return;
      made = true;
      const c = make("circle", {
        class: "dot", cx: CX, cy: CY, r: 0,
        tabindex: "-1", role: "button", "data-id": e.id
      });
      c.addEventListener("click", () => onSelect && onSelect(e.id));
      c.addEventListener("focus", () => {
        activeId = e.id;
        syncTabindex();
        onHover && onHover(e.id);
      });
      c.addEventListener("blur", () => onHover && onHover(null));
      c.addEventListener("mouseenter", () => onHover && onHover(e.id));
      c.addEventListener("mouseleave", () => onHover && onHover(null));
      c.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onSelect && onSelect(e.id);
          return;
        }
        const step = ev.key === "ArrowRight" || ev.key === "ArrowDown" ? 1
          : ev.key === "ArrowLeft" || ev.key === "ArrowUp" ? -1 : 0;
        if (!step) return;
        ev.preventDefault();
        const list = reachable.length ? reachable : order;
        const i = list.indexOf(e.id);
        const next = dots.get(list[(i + step + list.length) % list.length]);
        if (next) next.focus();
      });
      dots.set(e.id, c);
      dotLayer.appendChild(c);
    });
    /* Flush layout so fresh dots start at the centre and transition outward. */
    if (made) root.getBoundingClientRect();
  }

  /* view: { items, span, windowStart, windowEnd, maxTravel, originLabel, delay } */
  function update(view) {
    const span = view.span;
    ensureDots(view.items);
    drawHours(span);
    order = view.items.map((e) => e.id);

    const ws = Math.max(span.start, Math.min(span.end, view.windowStart));
    const we = Math.max(span.start, Math.min(span.end, view.windowEnd));
    if (we - ws < 0.01) {
      wedge.setAttribute("d", "");
    } else {
      const a1 = angleFor(ws, span), a2 = angleFor(we, span);
      wedge.setAttribute("d", [
        `M ${CX} ${CY}`,
        `L ${CX + R_MAX * Math.cos(a1)} ${CY - R_MAX * Math.sin(a1)}`,
        `A ${R_MAX} ${R_MAX} 0 0 1 ${CX + R_MAX * Math.cos(a2)} ${CY - R_MAX * Math.sin(a2)}`,
        "Z"
      ].join(" "));
    }

    RINGS.forEach((m, i) => {
      const r = radiusFor(m, view.maxTravel);
      const on = m < view.maxTravel;
      ringEls[i].setAttribute("r", on ? r : 0);
      ringEls[i].style.opacity = on ? "" : "0";
      ringLabels[i].setAttribute("x", CX - r);
      /* Drop the label rather than let it collide with the rim's own. */
      ringLabels[i].style.opacity = on && r < R_MAX - 40 ? "" : "0";
      ringLabels[i].textContent = `${m} min`;
    });
    rim.setAttribute("r", R_MAX);
    rimLabel.textContent = `${view.maxTravel} min`;
    originLabel.textContent = view.originLabel;

    const pts = place(view.items, view.maxTravel, span);
    const R = { match: 7, late: 5, out: 3, off: 3 };
    reachable = view.items.filter((e) => {
      const s = stateOf(e, span);
      return s === "match" || s === "late";
    }).map((e) => e.id);

    pts.forEach((p, i) => {
      const c = dots.get(p.e.id);
      const s = stateOf(p.e, span);
      c.setAttribute("cx", p.x);
      c.setAttribute("cy", p.y);
      c.setAttribute("r", R[s]);
      c.setAttribute("class", `dot is-${s}${p.nudged ? " is-nudged" : ""}`);
      c.setAttribute("aria-label", labelFor(p.e));
      c.style.transitionDelay = view.delay ? view.delay(p, i) : "0ms";
    });

    syncTabindex();
    return pts;
  }

  return { update, dots };
}
