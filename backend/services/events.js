/* One feed, one shape.
   Ticketmaster and Waterloo Events describe an event differently. The
   radial front-end (js/data.js) reads a single shape: a start and end,
   a venue with coordinates, a price, a scope, an indoor or outdoor
   setting, interest tags, and the circumstances that decide whether a
   student can actually turn up. This file gets from one to the other. */

const TZ = "America/Toronto";

/* Phillip & Columbia, where the front-end measures travel from until the
   user says otherwise. Same speed model as js/data.js. */
const ORIGIN = { lat: 43.476, lng: -80.5397 };
const CAMPUS = { lat: 43.4723, lng: -80.5449 };
const UPTOWN = { lat: 43.4643, lng: -80.5204 };
const SPEEDS = {
  walk: { kmh: 4.6, fixed: 1 },
  transit: { kmh: 11, fixed: 9 },
};

/* Campus buildings Waterloo Events names, so a talk in MC does not sit on
   top of a swim in the PAC. Anything unrecognised lands on the SLC. */
const CAMPUS_PLACES = [
  [/student life centre|\bslc\b/i, 43.4723, -80.5449],
  [/physical activities complex|\bpac\b/i, 43.472, -80.5468],
  [/mathematics and computer|\bmc\b/i, 43.4723, -80.5435],
  [/davis centre|\bdc\b/i, 43.4729, -80.5423],
  [/engineering 7|\be7\b/i, 43.4727, -80.5397],
  [/engineering 5|\be5\b|velocity/i, 43.473, -80.5396],
  [/quantum[- ]nano|\bqnc\b/i, 43.4703, -80.5423],
  [/dana porter|\bdp\b/i, 43.4694, -80.5424],
  [/needles hall|\bnh\b/i, 43.4713, -80.5445],
  [/tatham centre|\btc\b/i, 43.4703, -80.5405],
  [/federation hall|fed hall/i, 43.4754, -80.5473],
  [/hagey hall|\bhh\b/i, 43.4688, -80.5417],
  [/arts lecture|\bal\b/i, 43.4692, -80.5428],
  [/modern languages|\bml\b/i, 43.47, -80.5432],
  [/columbia icefield|\bcif\b/i, 43.4762, -80.5504],
  [/science teaching|\bstc\b/i, 43.4708, -80.5455],
  [/environment 3|\bev3\b/i, 43.4685, -80.5432],
  [/health services/i, 43.4706, -80.547],
  [/conrad grebel/i, 43.474, -80.549],
  [/st\.? paul'?s/i, 43.4715, -80.549],
  [/renison/i, 43.4703, -80.552],
  [/grad house/i, 43.469, -80.545],
  [/columbia (lake|fields)/i, 43.4768, -80.546],
];

/* Interests as the front-end names them, matched on whatever words a
   provider gives us. Ordered specific to general, because the first tag
   chooses the card's artwork. */
const TAG_RULES = [
  ["ai-ml", /\bai\b|machine learning|artificial intelligence|neural|\bllm|data science/i],
  ["research", /research|thesis|defen[cs]e|colloquium|symposium|graduate studies/i],
  ["startups", /startup|entrepreneur|velocity|founder|pitch (competition|night|event)|elevator pitch|innovation|venture/i],
  ["career", /career|co-?op\b|resume|interview|networking|employer|job fair|recruit/i],
  ["tech", /\btech|software|coding|hackathon|engineering|computer|cybersecurity|robotic|programming/i],
  ["music", /music|concert|\bband\b|choir|jazz|orchestra|\bdj\b|karaoke|open mic|symphony/i],
  ["sports", /sport|hockey|basketball|baseball|blue jays|raptors|soccer|football|volleyball|badminton|swim|\brun\b|running|athletic|intramural|fitness|\bgym\b|climb|skat/i],
  ["arts", /\barts?\b|theatre|theater|\bfilm|cinema|gallery|exhibit|dance|drama|photograph|design|craft|pottery|comedy|improv/i],
  ["wellness", /wellness|health|mental|yoga|meditat|mindful|counsel|therap/i],
  ["outdoors", /outdoor|\bpark\b|trail|hik(e|ing)|garden|nature|sustainab|environment|\bbike|cycling/i],
  ["food", /\bfood|lunch|dinner|breakfast|snack|pizza|\bbbq\b|barbecue|potluck|coffee|\btea\b|cook/i],
  ["games", /\bgames?\b|trivia|quiz|chess|board game|esports|tournament|puzzle/i],
  ["academic", /lecture|seminar|workshop|\btalk\b|\bclass(es)?\b|course|tutorial|panel|info session/i],
  ["social", /social|meet|mixer|welcome|orientation|open house|reception|party|\bclub|community|student|celebrat|\bfair\b|festival/i],
];

const TM_SEGMENTS = {
  Music: "music",
  Sports: "sports",
  "Arts & Theatre": "arts",
  Film: "arts",
  Miscellaneous: "social",
};

const OUTDOOR = /outdoor|\bpark\b|trail|hik(e|ing)|garden|\bfield|patio|amphitheat|\bwalk\b|\brun\b|market|public square|lake|beach/i;

/* ---- time ------------------------------------------------------------ */

export const isDateString = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

export function localDateOf(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function offsetMs(utc, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utc);
  const v = (type) => Number(parts.find((p) => p.type === type).value);
  return (
    Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second")) -
    utc.getTime()
  );
}

const torontoOffsetMs = (utc) => offsetMs(utc, TZ);

/* A wall-clock time in a named zone, as a UTC ISO string. The offset is
   read at the guessed instant, which is right except inside the hour a
   clock change skips or repeats. */
export function zonedToUtc([y, mo, d, h = 0, mi = 0, sec = 0], tz = TZ) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, sec);
  let offset;
  try {
    offset = offsetMs(new Date(guess), tz);
  } catch (err) {
    offset = offsetMs(new Date(guess), TZ); /* an unknown zone name */
  }
  return new Date(guess - offset).toISOString();
}

/* Midnight to midnight in Toronto for a calendar day, as UTC instants. */
export function torontoDayRange(date) {
  const offset = torontoOffsetMs(new Date(`${date}T12:00:00Z`));
  const start = new Date(new Date(`${date}T00:00:00Z`).getTime() - offset);
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

/* Ticketmaster wants whole seconds and a literal Z. */
export const stamp = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

const plusMinutes = (iso, minutes) =>
  new Date(new Date(iso).getTime() + minutes * 60000).toISOString();

/* Waterloo Events sends UTC instants with no zone marker ("2026-09-13T20:00:00").
   Left alone, JavaScript would read that as local time, four hours out. */
const asUtc = (s) => (/(?:[+-]\d{2}:\d{2}|Z)$/.test(s) ? s : `${s}Z`);

const hoursBetween = (a, b) => (new Date(b) - new Date(a)) / 3600000;

/* ---- geography ------------------------------------------------------- */

function distanceKm(a, b) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function travelFrom(origin, point) {
  const km = distanceKm(origin, point);
  const mode = km <= 2.2 ? "walk" : "transit";
  const { kmh, fixed } = SPEEDS[mode];
  return { travelMinutes: Math.max(1, Math.round(fixed + (km / kmh) * 60)), travelMode: mode };
}

function scopeFor(point, city) {
  if (distanceKm(point, CAMPUS) <= 1.3) return "campus";
  if (/waterloo|kitchener/i.test(city || "") || distanceKm(point, UPTOWN) <= 16) return "kw";
  return "any";
}

function campusPoint(locationName) {
  const hit = CAMPUS_PLACES.find(([re]) => re.test(locationName || ""));
  return hit ? { lat: hit[1], lng: hit[2] } : { ...CAMPUS };
}

/* ---- words ----------------------------------------------------------- */

function tagsFor(text, first) {
  const tags = TAG_RULES.filter(([, re]) => re.test(text)).map(([id]) => id);
  const ordered = first ? [first, ...tags.filter((t) => t !== first)] : tags;
  return ordered.length ? ordered.slice(0, 3) : ["social"];
}

function circumstancesFor({ text, price, scope, studentPrice }) {
  const list = [];
  if (price === 0) list.push("free");
  if (studentPrice) list.push("student-price");
  if (/free (food|pizza|lunch|dinner|breakfast|snacks)|food (is )?provided|refreshments|snacks provided|lunch provided/i.test(text)) {
    list.push("free-food");
  }
  if (/drop[- ]in|no (registration|sign[- ]?up) (required|needed)|walk[- ]ins? welcome/i.test(text)) {
    list.push("drop-in");
  }
  if (/beginner|no experience|all levels|all skill levels|intro(duction)? to/i.test(text)) {
    list.push("beginner-welcome");
  }
  if (/alcohol[- ]free|\bdry\b/i.test(text)) list.push("no-alcohol");
  if (/wheelchair|accessible|barrier[- ]free/i.test(text)) list.push("step-free");
  if (scope !== "any") list.push("transit-reachable");
  return list;
}

/* Provider links go straight into an href, so only web URLs pass. */
const safeUrl = (value) => (/^https?:\/\//i.test(String(value || "")) ? String(value) : null);

const costTierFor = (price) =>
  price == null ? "any" : price === 0 ? "free" : price < 10 ? "cheap" : price < 25 ? "moderate" : "any";

/* "Free", "$15", "$10 students / $20 general", "Free for students". */
function parseCost(text) {
  const s = String(text || "").trim();
  if (!s) return { price: null, studentPrice: false };
  if (/^free\b/i.test(s) || /no (charge|cost)/i.test(s)) return { price: 0, studentPrice: false };
  const amounts = [...s.matchAll(/\$\s?(\d+(?:\.\d{1,2})?)/g)].map((m) => Number(m[1]));
  const studentPrice = /student/i.test(s);
  if (!amounts.length) return { price: null, studentPrice };
  return { price: Math.min(...amounts), studentPrice: studentPrice && amounts.length > 1 };
}

function plainText(html, max = 160) {
  const s = String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/* ---- providers ------------------------------------------------------- */

export function normalizeTicketmaster(event) {
  const startsAt = event.dates?.start?.dateTime;
  if (!startsAt) return null; /* a listing with no time cannot sit on a clock */
  const venue = event._embedded?.venues?.[0] || {};
  const lat = Number(venue.location?.latitude);
  const lng = Number(venue.location?.longitude);
  const point = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : { ...UPTOWN };
  const segment = event.classifications?.[0]?.segment?.name;
  const genre = event.classifications?.[0]?.genre?.name || "";
  const text = [event.name, venue.name, segment, genre, event.info, event.pleaseNote]
    .filter(Boolean)
    .join(" ");
  const price = Number.isFinite(event.priceRanges?.[0]?.min) ? event.priceRanges[0].min : null;
  const scope = scopeFor(point, venue.city?.name);
  const image =
    event.images?.filter((i) => i.ratio === "16_9").sort((a, b) => b.width - a.width)[0] ||
    event.images?.[0];

  return {
    id: String(event.id),
    title: event.name || "Untitled event",
    venue: [venue.name, venue.city?.name].filter(Boolean).join(", ") || "Venue TBA",
    startsAt,
    endsAt: event.dates?.end?.dateTime || plusMinutes(startsAt, 150),
    lat: point.lat,
    lng: point.lng,
    ...travelFrom(ORIGIN, point),
    price,
    currency: event.priceRanges?.[0]?.currency || "CAD",
    costTier: costTierFor(price),
    scope,
    setting: OUTDOOR.test(`${event.name} ${venue.name}`) ? "outdoor" : "indoor",
    tags: tagsFor(text, TM_SEGMENTS[segment]),
    circumstances: circumstancesFor({ text, price, scope, studentPrice: false }),
    goingCount: 0,
    source: { name: "Ticketmaster", url: safeUrl(event.url) },
    imageUrl: safeUrl(image?.url),
    description: plainText(event.info || event.pleaseNote || genre),
  };
}

export function normalizeWaterloo(event) {
  if (!event.eventStartDate) return null;
  const startsAt = asUtc(event.eventStartDate);
  const point = campusPoint(event.locationName);
  const { price, studentPrice } = parseCost(event.cost);
  const text = [event.title, event.eventTags, event.eventType, event.audience, event.host, plainText(event.content, 400)]
    .filter(Boolean)
    .join(" ");
  const scope = "campus";
  const endsAt =
    event.eventEndDate && new Date(asUtc(event.eventEndDate)) > new Date(startsAt)
      ? asUtc(event.eventEndDate)
      : plusMinutes(startsAt, 90);
  /* An all-day or multi-day listing has no start time to plan around. */
  if (hoursBetween(startsAt, endsAt) >= 20) return null;

  return {
    id: `uw-${event.uniqueKey || event.siteId}-${event.eventStartDate}`,
    title: event.title || "Untitled event",
    venue: event.locationName || event.host || "University of Waterloo",
    startsAt,
    endsAt,
    lat: point.lat,
    lng: point.lng,
    ...travelFrom(ORIGIN, point),
    price,
    currency: "CAD",
    costTier: costTierFor(price),
    scope,
    setting: OUTDOOR.test(`${event.title} ${event.locationName || ""}`) ? "outdoor" : "indoor",
    tags: tagsFor(text),
    circumstances: circumstancesFor({ text, price, scope, studentPrice }),
    goingCount: 0,
    source: { name: "Waterloo Events", url: safeUrl(event.eventWebsite) || safeUrl(event.itemUri) },
    imageUrl: null,
    description: plainText(event.content),
  };
}

/* Where a WUSA trip goes when the calendar names a city but no GEO. */
const CITY_POINTS = [
  [/toronto|rogers centre|scotiabank arena/i, { lat: 43.6532, lng: -79.3832 }, "Toronto"],
  [/hamilton/i, { lat: 43.2557, lng: -79.8711 }, "Hamilton"],
  [/guelph/i, { lat: 43.5448, lng: -80.2482 }, "Guelph"],
  [/cambridge/i, { lat: 43.3616, lng: -80.3144 }, "Cambridge"],
  [/kitchener/i, { lat: 43.4516, lng: -80.4925 }, "Kitchener"],
];

/* "Free", "free event", "$5", "$10 for non-members"; plain "free food"
   says nothing about the ticket. */
function priceFromText(text) {
  const s = String(text || "");
  const amounts = [...s.matchAll(/\$\s?(\d+(?:\.\d{1,2})?)/g)].map((m) => Number(m[1]));
  if (amounts.length) {
    return { price: Math.min(...amounts), studentPrice: /student|member/i.test(s) && amounts.length > 1 };
  }
  if (/\bfree\b(?!\s+(food|pizza|snacks?|lunch|dinner|breakfast|drinks?|coffee|swag|merch|stuff))/i.test(s)) {
    return { price: 0, studentPrice: false };
  }
  return { price: null, studentPrice: false };
}

export function normalizeWusa(event) {
  if (!event.startsAt) return null;
  const endsAt =
    event.endsAt && new Date(event.endsAt) > new Date(event.startsAt)
      ? event.endsAt
      : plusMinutes(event.startsAt, 120);
  if (hoursBetween(event.startsAt, endsAt) >= 20) return null;

  const city = CITY_POINTS.find(([re]) => re.test(event.location || ""));
  const onCampus = !city || /university of waterloo|\buw\b|waterloo, n2l/i.test(event.location || "");
  const point =
    event.lat != null && event.lng != null
      ? { lat: event.lat, lng: event.lng }
      : onCampus
        ? campusPoint(event.location)
        : city[1];
  const scope = scopeFor(point, city?.[2] || "Waterloo");
  const firstPlace = (event.location || "").split(",")[0].trim();
  const venue = [firstPlace || "Campus", !onCampus && city ? city[2] : null].filter(Boolean).join(", ");
  const text = [event.summary, event.categories.join(" "), event.organizer, event.description]
    .filter(Boolean)
    .join(" ");
  const { price, studentPrice } = priceFromText(`${event.summary} ${event.description}`);

  return {
    id: `wusa-${event.uid || event.url}-${event.startsAt}`,
    title: event.summary || "Untitled event",
    venue,
    startsAt: event.startsAt,
    endsAt,
    lat: point.lat,
    lng: point.lng,
    ...travelFrom(ORIGIN, point),
    price,
    currency: "CAD",
    costTier: costTierFor(price),
    scope,
    setting: OUTDOOR.test(`${event.summary} ${event.location || ""}`) ? "outdoor" : "indoor",
    tags: tagsFor(text),
    circumstances: circumstancesFor({ text, price, scope, studentPrice }),
    goingCount: 0,
    source: { name: "WUSA", url: safeUrl(event.url) },
    imageUrl: null,
    description: plainText(event.description),
  };
}

/* ---- the feed -------------------------------------------------------- */

/* circles: Map of event id to how many students have joined its circle. */
export function buildFeed({ date, ticketmaster = [], waterloo = [], wusa = [], circles = new Map() }) {
  const seen = new Set();
  return [
    ...wusa.map(normalizeWusa),
    ...waterloo.map(normalizeWaterloo),
    ...ticketmaster.map(normalizeTicketmaster),
  ]
    .filter((e) => e && localDateOf(e.startsAt) === date)
    .filter((e) => (seen.has(e.id) ? false : seen.add(e.id)))
    .map((e) => ({ ...e, goingCount: circles.get(e.id) || 0 }))
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}
