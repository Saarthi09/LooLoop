import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rankEventsWithGemini } from "./services/gemini.js";

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendPath = path.join(here, "..", "first");
dotenv.config({ path: path.join(here, ".env") });
const port = process.env.PORT || 3000;
const ticketmasterKey = process.env.TICKETMASTER_API_KEY;
const uWaterlooKey = process.env.UWATERLOO_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

app.use(cors());
app.use(express.json());
app.use("/", express.static(frontendPath));

function getSize(value) {
  return Math.min(Math.max(Number(value) | | 12, 1), 25);
}

function eventText(event) {
  return [
    event.name,
    event.source,
    event._embedded?.venues?.[0]?.name,
    event.classifications?.map((item) => item.segment?.name).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function fitsAvailability(event, availability) {
  if (!availability || availability === "anytime") return true;
  const value = event.dates?.start?.dateTime || event.dates?.start?.localDate;
  if (!value) return false;

  const date = new Date(value);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  if (availability === "weekends") return isWeekend;
  if (availability === "weekday-evenings") {
    return !isWeekend && date.getHours() >= 16;
  }
  if (availability === "weekday-daytime") {
    return !isWeekend && date.getHours() < 17;
  }
  return true;
}

function fallbackRecommendations(events, preferences) {
  const interests = (preferences.interests || []).map((item) =>
    item.toLowerCase(),
  );
  const budget = Number(preferences.budget);

  return events
    .map((event) => {
      const text = eventText(event);
      const price = event.priceRanges?.[0]?.min;
      const reasons = [];
      let score = 35;

      if (interests.some((interest) => text.includes(interest))) {
        score += 30;
        reasons.push("Matches one of your interests");
      }
      if (event.source === "University of Waterloo") {
        score += 20;
        reasons.push("Located within the Waterloo campus community");
      }
      if (Number.isFinite(budget) && (price == null || price <= budget)) {
        score += 10;
        reasons.push(
          price == null ? "No listed ticket cost" : "Fits your budget",
        );
      }
      if (preferences.goal === "meet-people") {
        score += 5;
        reasons.push("A useful chance to meet other students");
      }
      if (fitsAvailability(event, preferences.availability)) {
        score += 15;
        reasons.push("Fits your usual availability");
      }

      return {
        event,
        matchScore: Math.min(score, 100),
        reasons: reasons.slice(0, 3),
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 8);
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
  if (!uWaterlooKey) {
    throw new Error("University of Waterloo API is not configured.");
  }

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
    throw new Error(
      payload.fault?.faultstring || "Ticketmaster request failed.",
    );
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
    geminiConnected: Boolean(geminiKey),
  });
});

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
  const includeWaterloo = !city || /waterloo|kitchener/i.test(city);
  const requests = [getTicketmasterEvents(req, size)];

  if (includeWaterloo && uWaterlooKey) {
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

  if (
    !events.length &&
    providers.every((result) => result.status === "rejected")
  ) {
    return res
      .status(502)
      .json({ error: "Could not reach an event provider." });
  }

  return res.json({ events });
});

app.post("/api/recommend", async (req, res) => {
  const preferences = req.body;
  const interests = Array.isArray(preferences.interests)
    ? preferences.interests.filter(Boolean).slice(0, 8)
    : [];
  const city = String(preferences.city || "Waterloo").trim();
  const campus = String(preferences.campus || "").trim();
  const keyword = interests[0] || "";
  const eventRequest = {
    query: {
      city,
      keyword,
    },
  };

  try {
    const providerRequests = [getTicketmasterEvents(eventRequest, 20)];
    if (uWaterlooKey && /waterloo/i.test(`${city} ${campus}`)) {
      providerRequests.push(getWaterlooEvents({ size: 20 }));
    }

    const providerResults = await Promise.allSettled(providerRequests);
    const events = providerResults
      .filter((result) => result.status === "fulfilled")
      .flatMap((result) => result.value)
      .filter(
        (event, index, allEvents) =>
          allEvents.findIndex((item) => item.id === event.id) === index,
      );

    if (!events.length) {
      return res.status(404).json({ error: "No matching events were found." });
    }

    const fallback = fallbackRecommendations(events, {
      ...preferences,
      interests,
    });
    if (!geminiKey) {
      return res.json({
        summary: "Recommendations based on your newcomer preferences.",
        recommendations: fallback,
        mode: "rules",
      });
    }

    try {
      const aiResult = await rankEventsWithGemini({
        apiKey: geminiKey,
        preferences: { ...preferences, interests },
        events: events.slice(0, 15),
      });
      const eventById = new Map(
        events.map((event) => [String(event.id), event]),
      );
      const recommendations = aiResult.recommendations
        .map((item) => ({
          event: eventById.get(item.eventId),
          matchScore: item.score,
          reasons: item.reasons,
        }))
        .filter((item) => item.event);

      return res.json({
        summary: aiResult.summary,
        recommendations: recommendations.length ? recommendations : fallback,
        mode: recommendations.length ? "gemini" : "rules",
      });
    } catch (error) {
      console.error("Gemini recommendation failed:", error.message);
      return res.json({
        summary: "Recommendations based on your newcomer preferences.",
        recommendations: fallback,
        mode: "rules",
      });
    }
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.listen(port, () => {
  console.log(`LooLoop is running at http://localhost:${port}`);
});
