import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = process.env.PORT || 3000;
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendPath = path.join(here, "..", "first");
const ticketmasterKey = process.env.TICKETMASTER_API_KEY;
const uWaterlooKey = process.env.UWATERLOO_API_KEY;

app.use(cors());
app.use(express.json());
app.use("/", express.static(frontendPath));

function getSize(value) {
  return Math.min(Math.max(Number(value) || 12, 1), 25);
}

function normalizeWaterlooEvent(event) {
  return {
    id: `uw-${event.uniqueKey || event.siteId}-${event.eventStartDate}`,
    name: event.title,
    dates: {
      start: {
        dateTime: event.eventStartDate,
        localDate: event.eventStartDate?.slice(0, 10),
      },
    },
    url: event.eventWebsite || event.itemUri,
    source: "University of Waterloo",
    _embedded: {
      venues: [
        {
          name: event.locationName || event.host || "University of Waterloo",
          city: { name: "Waterloo" },
        },
      ],
    },
  };
}

async function getWaterlooEvents({ size, keyword = "" }) {
  if (!uWaterlooKey) throw new Error("University of Waterloo API is not configured.");

  const response = await fetch(
    `https://openapi.data.uwaterloo.ca/v3/Wcms/latestevents/${size}`,
    { headers: { "x-api-key": uWaterlooKey } },
  );
  const events = await response.json();
  if (!response.ok) throw new Error("University of Waterloo request failed.");

  const query = keyword.toLowerCase();
  return events
    .filter(
      (event) =>
        !query ||
        `${event.title} ${event.eventTags} ${event.eventType}`
          .toLowerCase()
          .includes(query),
    )
    .map(normalizeWaterlooEvent);
}

async function getTicketmasterEvents(req, size) {
  if (!ticketmasterKey) return [];

  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("apikey", ticketmasterKey);
  url.searchParams.set("size", String(size));

  for (const name of [
    "keyword",
    "city",
    "stateCode",
    "countryCode",
    "classificationName",
    "startDateTime",
    "endDateTime",
    "latlong",
    "radius",
    "unit",
  ]) {
    if (typeof req.query[name] === "string" && req.query[name].trim()) {
      url.searchParams.set(name, req.query[name].trim());
    }
  }

  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.fault?.faultstring || "Ticketmaster request failed.");
  }

  return (payload._embedded?.events || []).map((event) => ({
    ...event,
    source: "Ticketmaster",
  }));
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    ticketmasterConnected: Boolean(ticketmasterKey),
    uWaterlooConnected: Boolean(uWaterlooKey),
  });
});

// Campus-only events. Example: /api/uwaterloo-events?keyword=workshop&size=10
app.get("/api/uwaterloo-events", async (req, res) => {
  try {
    const events = await getWaterlooEvents({
      size: getSize(req.query.size),
      keyword: String(req.query.keyword || ""),
    });
    res.json({ events });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get("/api/discover", async (req, res) => {
  const size = getSize(req.query.size);
  const city = String(req.query.city || "").trim();
  const shouldIncludeWaterloo = !city || /waterloo|kitchener/i.test(city);

  const requests = [getTicketmasterEvents(req, size)];
  if (shouldIncludeWaterloo && uWaterlooKey) {
    requests.push(
      getWaterlooEvents({
        size,
        keyword: String(req.query.keyword || ""),
      }),
    );
  }

  const providers = await Promise.allSettled(requests);
  const events = providers
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value)
    .sort(
      (a, b) =>
        new Date(a.dates?.start?.dateTime || a.dates?.start?.localDate) -
        new Date(b.dates?.start?.dateTime || b.dates?.start?.localDate),
    )
    .slice(0, size);

  if (!events.length && providers.every((result) => result.status === "rejected")) {
    return res.status(502).json({ error: "Could not reach an event provider." });
  }

  return res.json({ events });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.listen(port, () => {
  console.log(`LooLoop is running at http://localhost:${port}`);
});
