import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { rankEventsWithGemini } from "./services/gemini.js";
import {
  buildFeed,
  isDateString,
  localDateOf,
  stamp,
  torontoDayRange,
} from "./services/events.js";

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.join(here, "..");
const legacyPath = path.join(rootPath, "first");
dotenv.config({ path: path.join(here, ".env") });
const port = process.env.PORT || 3000;
const ticketmasterKey = process.env.TICKETMASTER_API_KEY;
const uWaterlooKey = process.env.UWATERLOO_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

app.use(cors());
app.use(express.json());

// The radial front-end at the repo root is the front door. The earlier
// pages in first/ (questionnaire, profile, circles) stay under /first.
// Only the folders a browser needs are exposed; backend/ never is.
app.use("/css", express.static(path.join(rootPath, "css")));
app.use("/js", express.static(path.join(rootPath, "js")));
app.use("/first", express.static(legacyPath));

function getSize(value) {
  return Math.min(Math.max(Number(value) || 12, 1), 25);
}

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseSecretKey) return null;
  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeInstagramHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "");
}

function validateInstagramHandle(handle) {
  if (handle && !/^[a-zA-Z0-9._]{1,30}$/.test(handle)) {
    return "Instagram handle can only use letters, numbers, periods, and underscores.";
  }
  return null;
}

function usernameToEmail(username) {
  return `${username}@accounts.looloop.app`;
}

function validateCredentials(username, password) {
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return "Username must be 3–20 characters using letters, numbers, or underscores.";
  }
  if (typeof password !== "string" || password.length < 8) {
    return "Password must contain at least 8 characters.";
  }
  return null;
}

function getAccessToken(req) {
  return req.headers.authorization?.replace(/^Bearer\s+/i, "");
}

async function getAuthenticatedUser(req) {
  const token = getAccessToken(req);
  if (!token) return { error: "Authentication required." };

  const supabase = createSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured.", status: 503 };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { error: "Your session is invalid or expired." };
  }

  return { supabase, user: data.user };
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

// The raw Waterloo Events listing, untouched, for the /api/events feed.
async function fetchWaterlooEvents(size) {
  if (!uWaterlooKey) {
    throw new Error("University of Waterloo API is not configured.");
  }

  const response = await fetch(
    `https://openapi.data.uwaterloo.ca/v3/Wcms/latestevents/${size}`,
    { headers: { "x-api-key": uWaterlooKey } },
  );
  const events = await response.json();
  if (!response.ok) throw new Error("University of Waterloo request failed.");
  return Array.isArray(events) ? events : [];
}

async function getWaterlooEvents({ size, keyword = "" }) {
  const events = await fetchWaterlooEvents(size);
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

// How many students have joined each event's circle, keyed by event id.
async function getCircleCounts() {
  const supabase = createSupabaseClient();
  if (!supabase) return new Map();

  const { data: circles, error: circleError } = await supabase
    .from("event_circles")
    .select("id, event_id");
  if (circleError) throw new Error(circleError.message);

  const { data: members, error: memberError } = await supabase
    .from("event_circle_members")
    .select("circle_id");
  if (memberError) throw new Error(memberError.message);

  const byCircle = new Map();
  members.forEach((member) => {
    byCircle.set(member.circle_id, (byCircle.get(member.circle_id) || 0) + 1);
  });
  return new Map(
    circles.map((circle) => [circle.event_id, byCircle.get(circle.id) || 0]),
  );
}

// One day of listings in the shape the radial front-end reads.
// Waterloo Region only: Ticketmaster within 30 km of uptown, plus every
// campus event Waterloo Events publishes. Missing providers are reported
// in `warnings` rather than failing the whole feed.
app.get("/api/events", async (req, res) => {
  const date = isDateString(req.query.date)
    ? req.query.date
    : localDateOf(new Date());
  const { start, end } = torontoDayRange(date);
  const ticketmasterRequest = {
    query: {
      latlong: "43.4643,-80.5204",
      radius: "30",
      unit: "km",
      countryCode: "CA",
      startDateTime: stamp(start),
      endDateTime: stamp(end),
    },
  };

  const [ticketmaster, waterloo, circles] = await Promise.allSettled([
    getTicketmasterEvents(ticketmasterRequest, 100),
    fetchWaterlooEvents(100),
    getCircleCounts(),
  ]);

  const warnings = [];
  if (ticketmaster.status === "rejected") {
    warnings.push(`Ticketmaster: ${ticketmaster.reason.message}`);
  }
  if (waterloo.status === "rejected") {
    warnings.push(`University of Waterloo: ${waterloo.reason.message}`);
  }
  if (circles.status === "rejected") {
    warnings.push(`Circles: ${circles.reason.message}`);
  }

  const events = buildFeed({
    date,
    ticketmaster: ticketmaster.value || [],
    waterloo: waterloo.value || [],
    circles: circles.value || new Map(),
  });
  const sources = [
    ticketmasterKey && ticketmaster.status === "fulfilled" && "Ticketmaster",
    uWaterlooKey && waterloo.status === "fulfilled" && "Waterloo Events",
  ].filter(Boolean);

  res.json({ date, events, sources, warnings });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    ticketmasterConnected: Boolean(ticketmasterKey),
    uWaterlooConnected: Boolean(uWaterlooKey),
    geminiConnected: Boolean(geminiKey),
    profilesConnected: Boolean(supabaseUrl && supabaseSecretKey),
  });
});

app.post("/api/auth/signup", async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = req.body.password;
  const instagramHandle = normalizeInstagramHandle(req.body.instagramHandle);
  const validationError =
    validateCredentials(username, password) ||
    validateInstagramHandle(instagramHandle);
  if (validationError) return res.status(400).json({ error: validationError });

  const supabase = createSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ error: "Supabase Auth is not configured." });
  }

  const email = usernameToEmail(username);
  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, instagram_handle: instagramHandle || null },
  });
  if (createError) {
    const status = /already|registered|exists/i.test(createError.message)
      ? 409
      : 400;
    return res.status(status).json({ error: createError.message });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return res.status(401).json({ error: error.message });

  return res.status(201).json({
    profile: { id: data.user.id, username, instagramHandle },
    accessToken: data.session.access_token,
    expiresAt: data.session.expires_at,
  });
});

app.post("/api/auth/login", async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = req.body.password;
  const validationError = validateCredentials(username, password);
  if (validationError) return res.status(400).json({ error: validationError });

  const supabase = createSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ error: "Supabase Auth is not configured." });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error)
    return res.status(401).json({ error: "Invalid username or password." });

  return res.json({
    profile: {
      id: data.user.id,
      username,
      instagramHandle: data.user.user_metadata.instagram_handle || "",
    },
    accessToken: data.session.access_token,
    expiresAt: data.session.expires_at,
  });
});

app.get("/api/auth/profile", async (req, res) => {
  const auth = await getAuthenticatedUser(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  return res.json({
    profile: {
      id: auth.user.id,
      username: auth.user.user_metadata.username,
      instagramHandle: auth.user.user_metadata.instagram_handle || "",
    },
  });
});

app.put("/api/auth/profile", async (req, res) => {
  const auth = await getAuthenticatedUser(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  const instagramHandle = normalizeInstagramHandle(req.body.instagramHandle);
  const validationError = validateInstagramHandle(instagramHandle);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { data, error } = await auth.supabase.auth.admin.updateUserById(
    auth.user.id,
    {
      user_metadata: {
        ...auth.user.user_metadata,
        instagram_handle: instagramHandle || null,
      },
    },
  );
  if (error) return res.status(400).json({ error: error.message });

  const { error: membershipError } = await auth.supabase
    .from("event_circle_members")
    .update({ instagram_handle: instagramHandle || null })
    .eq("user_id", auth.user.id);
  if (membershipError) {
    return res.status(500).json({ error: membershipError.message });
  }

  return res.json({
    profile: {
      id: data.user.id,
      username: data.user.user_metadata.username,
      instagramHandle,
    },
  });
});

app.post("/api/circles/join", async (req, res) => {
  const auth = await getAuthenticatedUser(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  const eventId = String(req.body.eventId || "").trim();
  const eventName = String(req.body.eventName || "").trim();
  const eventUrl = String(req.body.eventUrl || "").trim() || null;
  const eventDate = String(req.body.eventDate || "").trim() || null;
  if (!eventId || !eventName) {
    return res.status(400).json({ error: "Event ID and name are required." });
  }

  const { data: circle, error: circleError } = await auth.supabase
    .from("event_circles")
    .upsert(
      {
        event_id: eventId,
        event_name: eventName,
        event_url: eventUrl,
        event_date: eventDate,
      },
      { onConflict: "event_id" },
    )
    .select()
    .single();
  if (circleError) {
    return res.status(500).json({ error: circleError.message });
  }

  const username =
    auth.user.user_metadata.username ||
    auth.user.email?.split("@")[0] ||
    "student";
  const instagramHandle =
    auth.user.user_metadata.instagram_handle || null;
  const { error: memberError } = await auth.supabase
    .from("event_circle_members")
    .upsert(
      {
        circle_id: circle.id,
        user_id: auth.user.id,
        username,
        instagram_handle: instagramHandle,
      },
      { onConflict: "circle_id,user_id" },
    );
  if (memberError) {
    return res.status(500).json({ error: memberError.message });
  }

  return res.status(201).json({ circle });
});

app.get("/api/circles", async (_req, res) => {
  const supabase = createSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ error: "Supabase is not configured." });
  }

  const { data: circles, error: circleError } = await supabase
    .from("event_circles")
    .select("id, event_id, event_name, event_url, event_date, created_at")
    .order("created_at", { ascending: false });
  if (circleError) {
    return res.status(500).json({ error: circleError.message });
  }

  const { data: members, error: memberError } = await supabase
    .from("event_circle_members")
    .select("circle_id");
  if (memberError) {
    return res.status(500).json({ error: memberError.message });
  }

  const memberCounts = members.reduce((counts, member) => {
    counts[member.circle_id] = (counts[member.circle_id] || 0) + 1;
    return counts;
  }, {});

  return res.json({
    circles: circles.map((circle) => ({
      ...circle,
      member_count: memberCounts[circle.id] || 0,
    })),
  });
});

app.get("/api/circles/mine", async (req, res) => {
  const auth = await getAuthenticatedUser(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  const { data: memberships, error: membershipError } = await auth.supabase
    .from("event_circle_members")
    .select("circle_id, joined_at")
    .eq("user_id", auth.user.id)
    .order("joined_at", { ascending: false });
  if (membershipError) {
    return res.status(500).json({ error: membershipError.message });
  }

  const circleIds = memberships.map((membership) => membership.circle_id);
  if (!circleIds.length) return res.json({ circles: [] });

  const { data: circles, error: circleError } = await auth.supabase
    .from("event_circles")
    .select("id, event_id, event_name, event_url, event_date, created_at")
    .in("id", circleIds);
  if (circleError) {
    return res.status(500).json({ error: circleError.message });
  }

  const joinedAtByCircle = new Map(
    memberships.map((membership) => [
      membership.circle_id,
      membership.joined_at,
    ]),
  );
  const orderedCircles = circles
    .map((circle) => ({
      ...circle,
      joined_at: joinedAtByCircle.get(circle.id),
    }))
    .sort((a, b) => new Date(b.joined_at) - new Date(a.joined_at));

  return res.json({ circles: orderedCircles });
});

app.get("/api/circles/:circleId", async (req, res) => {
  const auth = await getAuthenticatedUser(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  const { data: circle, error: circleError } = await auth.supabase
    .from("event_circles")
    .select("id, event_id, event_name, event_url, event_date, created_at")
    .eq("id", req.params.circleId)
    .single();
  if (circleError) {
    const status = circleError.code === "PGRST116" ? 404 : 500;
    return res.status(status).json({
      error: status === 404 ? "Circle not found." : circleError.message,
    });
  }

  const { data: members, error: memberError } = await auth.supabase
    .from("event_circle_members")
    .select("user_id, username, instagram_handle, joined_at")
    .eq("circle_id", circle.id)
    .order("joined_at", { ascending: true });
  if (memberError) {
    return res.status(500).json({ error: memberError.message });
  }

  return res.json({ circle, members });
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

app.get(["/", "/index.html"], (_req, res) => {
  res.sendFile(path.join(rootPath, "index.html"));
});

app.listen(port, () => {
  console.log(`LooLoop is running at http://localhost:${port}`);
});
