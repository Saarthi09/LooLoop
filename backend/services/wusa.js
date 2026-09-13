/* WUSA, the undergraduate student association, publishes its events
   calendar as iCalendar at wusa.ca. It needs no key, and it is the one
   campus source that is kept current: the Waterloo Open Data WCMS feed
   stopped carrying new events in 2026. This file fetches and parses it
   into plain objects; services/events.js turns those into listings. */

import { zonedToUtc } from "./events.js";

export const WUSA_ICS_URL = "https://wusa.ca/events/?ical=1";
const CACHE_MS = 10 * 60 * 1000;
let cache = { at: 0, events: [] };

export async function fetchWusaEvents({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (cache.events.length && now - cache.at < CACHE_MS) return cache.events;

  const response = await fetchImpl(WUSA_ICS_URL, {
    headers: {
      "User-Agent": "LooLoop/1.0 (student event finder)",
      Accept: "text/calendar",
    },
  });
  if (!response.ok) {
    throw new Error(`WUSA calendar request failed (${response.status}).`);
  }

  const events = parseIcs(await response.text());
  cache = { at: now, events };
  return events;
}

/* ---- iCalendar (RFC 5545), just the parts a calendar export uses ---- */

/* Long lines are folded onto continuation lines that start with a space. */
const unfold = (text) =>
  String(text).replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "");

const unescapeText = (s) =>
  String(s).replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

/* NAME;PARAM=value;OTHER="quoted: value":the value */
function parseProperty(line) {
  let inQuotes = false;
  let split = -1;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ":" && !inQuotes) {
      split = i;
      break;
    }
  }
  if (split < 0) return null;

  const [name, ...paramParts] = line.slice(0, split).split(";");
  const params = {};
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      params[part.slice(0, eq).toUpperCase()] = part
        .slice(eq + 1)
        .replace(/^"|"$/g, "");
    }
  }
  return { name: name.toUpperCase(), params, value: line.slice(split + 1) };
}

/* "20260914T153000" in a TZID, "20260914T193000Z" in UTC, or a bare
   date for an all-day event, which has no time to plan around and is
   returned as null. */
export function toInstant(prop) {
  if (!prop) return null;
  if (prop.params.VALUE === "DATE") return null;
  const m = prop.value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const parts = m.slice(1, 7).map((v) => Number(v || 0));
  if (m[7] === "Z") {
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5])).toISOString();
  }
  return zonedToUtc(parts, prop.params.TZID || "America/Toronto");
}

export function parseIcs(text) {
  const events = [];
  let current = null;

  for (const line of unfold(text).split("\n")) {
    if (line === "BEGIN:VEVENT") {
      current = { props: {}, categories: [] };
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(toEvent(current));
      current = null;
      continue;
    }
    if (!current) continue;

    const prop = parseProperty(line);
    if (!prop) continue;
    if (prop.name === "CATEGORIES") {
      current.categories.push(...prop.value.split(",").map((c) => unescapeText(c).trim()).filter(Boolean));
    } else if (!(prop.name in current.props)) {
      current.props[prop.name] = prop;
    }
  }

  return events.filter(Boolean);
}

function toEvent({ props, categories }) {
  const startsAt = toInstant(props.DTSTART);
  if (!startsAt) return null;
  const geo = props.GEO ? props.GEO.value.split(";").map(Number) : [];
  const [lat, lng] = geo.length === 2 && geo.every(Number.isFinite) ? geo : [null, null];

  return {
    uid: props.UID?.value || "",
    summary: unescapeText(props.SUMMARY?.value || "").trim(),
    startsAt,
    endsAt: toInstant(props.DTEND),
    location: unescapeText(props.LOCATION?.value || "").trim(),
    url: props.URL?.value || "",
    categories,
    organizer: props.ORGANIZER?.params.CN || "",
    lat,
    lng,
    description: unescapeText(props.DESCRIPTION?.value || "").trim(),
  };
}
