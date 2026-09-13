/* ---- where the listings come from ------------------------------------
   The Express server in backend/ merges Ticketmaster and Waterloo Events
   into the shape used below and serves it at /api/events. Opened from a
   plain static server (Live Server, python -m http.server) the API is on
   port 3000 instead. When it cannot be reached, or has nothing on for
   today, the seed set below stands in and is labelled as a sample. */
import { API_BASE } from "./api.js";

export const USE_API = true;
export const API_URL = `${API_BASE}/api/events`;

/* Today, in the browser's own zone, so the seed always reads as today.
   For a demo of another day, open the page with ?date=2026-09-14. */
const pad = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const offsetOf = (d) => {
  const m = -d.getTimezoneOffset();
  return `${m < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`;
};
const wanted = new URLSearchParams(window.location.search).get("date");
/* The shape alone lets 2026-13-45 through, which stamps every seed with a
   NaN offset. A real date round-trips through Date and back unchanged. */
const isCalendarDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && localDate(new Date(`${v}T12:00:00`)) === v;
export const TODAY = isCalendarDate(wanted || "") ? wanted : localDate(new Date());
const D = TODAY;
const Z = offsetOf(new Date(`${D}T12:00:00`));
const at = (t) => `${D}T${t}:00${Z}`;

/* ---- taxonomy --------------------------------------------------------
   Interests are the flattened union of Ticketmaster's segments and the
   tags Waterloo Events publishes, cut down to something a person can
   pick from in ten seconds. The mapping back to each provider lives in
   PROVIDER_MAP below. */

export const INTERESTS = [
  { id: "music",     label: "music" },
  { id: "sports",    label: "sports" },
  { id: "tech",      label: "tech" },
  { id: "ai-ml",     label: "ai and ml" },
  { id: "career",    label: "career and co-op" },
  { id: "startups",  label: "startups" },
  { id: "arts",      label: "arts and film" },
  { id: "academic",  label: "talks and classes" },
  { id: "research",  label: "research" },
  { id: "social",    label: "meeting people" },
  { id: "wellness",  label: "wellness" },
  { id: "outdoors",  label: "outdoors" },
  { id: "food",      label: "food" },
  { id: "games",     label: "games" }
];

/* What each interest asks the two providers for. Nothing reads this yet;
   it is here so the backend has one place to work from. */
export const PROVIDER_MAP = {
  music:    { ticketmaster: ["Music"],               waterloo: ["Music", "Performance"] },
  sports:   { ticketmaster: ["Sports"],              waterloo: ["Sport", "Recreation"] },
  tech:     { ticketmaster: [],                      waterloo: ["Technology", "Engineering", "Cybersecurity"] },
  "ai-ml":  { ticketmaster: [],                      waterloo: ["AI", "Machine Learning", "Research"] },
  career:   { ticketmaster: [],                      waterloo: ["Career", "Co-op", "Career development", "Networking"] },
  startups: { ticketmaster: [],                      waterloo: ["Entrepreneurship", "Innovation", "Pitch competition"] },
  arts:     { ticketmaster: ["Arts & Theatre", "Film"], waterloo: ["Exhibition", "Performance"] },
  academic: { ticketmaster: [],                      waterloo: ["Lecture", "Seminar", "Workshop", "Public lecture"] },
  research: { ticketmaster: [],                      waterloo: ["Research", "Thesis defence", "Conference"] },
  social:   { ticketmaster: ["Miscellaneous"],       waterloo: ["Reception", "Open house", "Student"] },
  wellness: { ticketmaster: [],                      waterloo: ["Wellness", "Health", "Mental Health"] },
  outdoors: { ticketmaster: [],                      waterloo: ["Sustainability", "Recreation"] },
  food:     { ticketmaster: ["Miscellaneous"],       waterloo: ["Reception"] },
  games:    { ticketmaster: ["Miscellaneous"],       waterloo: ["Trivia", "Student"] }
};

/* Things that decide whether a student can actually turn up. */
export const CIRCUMSTANCES = [
  { id: "free",              label: "costs nothing" },
  { id: "free-food",         label: "food provided" },
  { id: "student-price",     label: "student price" },
  { id: "drop-in",           label: "no signup" },
  { id: "solo-friendly",     label: "fine on your own" },
  { id: "beginner-welcome",  label: "no experience needed" },
  { id: "no-alcohol",        label: "no drinking" },
  { id: "quiet",             label: "quiet" },
  { id: "step-free",         label: "step free" },
  { id: "transit-reachable", label: "bus or ION" }
];

/* price is the number, costTier is what the budget question filters on. */
export const BUDGETS = [
  { id: "free",     label: "nothing",    max: 0 },
  { id: "cheap",    label: "under $10",  max: 9.99 },
  { id: "moderate", label: "under $25",  max: 24.99 },
  { id: "any",      label: "no limit",   max: Infinity }
];

export const SCOPES = [
  { id: "campus", label: "on campus",        minutes: 15 },
  { id: "kw",     label: "Waterloo and Kitchener", minutes: 30 },
  { id: "any",    label: "anywhere nearby",  minutes: 60 }
];

const RAW_EVENTS = [
  {
    id: "evt_001",
    title: "Sunrise run, easy 5k round the ring road",
    venue: "Ring Road, north campus",
    startsAt: at("07:00"), endsAt: at("08:00"),
    travelMinutes: 6, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "outdoor",
    tags: ["outdoors", "sports", "wellness"],
    circumstances: ["free", "solo-friendly", "beginner-welcome", "drop-in"],
    goingCount: 0, matchScore: 0.74,
    source: { name: "Instagram", url: "https://instagram.com" },
    imageUrl: null,
    description: "Two pace groups. The slow one walks the hill and nobody minds."
  },
  {
    id: "evt_002",
    title: "Lap swim, student rate with your Watcard",
    venue: "Waterloo Memorial Recreation Complex",
    startsAt: at("07:00"), endsAt: at("09:00"),
    travelMinutes: 20, travelMode: "transit",
    price: 4, currency: "CAD", costTier: "cheap",
    scope: "kw",
    setting: "indoor",
    tags: ["sports", "wellness"],
    circumstances: ["student-price", "solo-friendly", "no-alcohol", "step-free"],
    goingCount: 0, matchScore: 0.42,
    source: { name: "Venue site", url: "https://example.ca" },
    imageUrl: null,
    description: "Four dollars with a student card. Towels are not included, bring one."
  },
  {
    id: "evt_003",
    title: "Free breakfast before class, first two hundred",
    venue: "Student Life Centre",
    startsAt: at("08:00"), endsAt: at("10:00"),
    travelMinutes: 9, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["food", "social"],
    circumstances: ["free", "free-food", "drop-in", "solo-friendly", "step-free"],
    goingCount: 0, matchScore: 0.93,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Eggs, toast and coffee in the Great Hall. Queue moves faster after half eight."
  },
  {
    id: "evt_004",
    title: "Farmers market, go early for the bread",
    venue: "St. Jacobs Farmers' Market",
    startsAt: at("08:30"), endsAt: at("15:00"),
    travelMinutes: 29, travelMode: "transit",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "mixed",
    tags: ["food", "social", "outdoors"],
    circumstances: ["free", "solo-friendly", "step-free"],
    goingCount: 0, matchScore: 0.83,
    source: { name: "Venue site", url: "https://example.ca" },
    imageUrl: null,
    description: "Free to walk in, you only pay for what you buy. Route 21 goes most of the way."
  },
  {
    id: "evt_005",
    title: "Drop-in badminton, rackets at the desk",
    venue: "Physical Activities Complex",
    startsAt: at("09:00"), endsAt: at("11:00"),
    travelMinutes: 10, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["sports", "wellness"],
    circumstances: ["free", "drop-in", "beginner-welcome", "solo-friendly", "no-alcohol"],
    goingCount: 0, matchScore: 0.75,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Turn up with running shoes. They put singles into doubles games."
  },
  {
    id: "evt_006",
    title: "Intro to Git, for people who have broken it",
    venue: "Mathematics and Computer Building",
    startsAt: at("09:30"), endsAt: at("11:00"),
    travelMinutes: 8, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["tech", "academic"],
    circumstances: ["free", "beginner-welcome", "no-alcohol", "quiet", "drop-in"],
    goingCount: 0, matchScore: 0.77,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Bring a laptop if you have one. Two machines at the back if you do not."
  },
  {
    id: "evt_007",
    title: "Parkrun, a free timed 5k, no signup on the day",
    venue: "Waterloo Park",
    startsAt: at("09:30"), endsAt: at("10:30"),
    travelMinutes: 21, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "kw",
    setting: "outdoor",
    tags: ["outdoors", "sports", "wellness"],
    circumstances: ["free", "solo-friendly", "beginner-welcome"],
    goingCount: 0, matchScore: 0.8,
    source: { name: "Instagram", url: "https://instagram.com" },
    imageUrl: null,
    description: "Register once online, run it any week. Walkers finish last and get clapped in."
  },
  {
    id: "evt_008",
    title: "Clubs fair, a hundred and twenty tables",
    venue: "Student Life Centre",
    startsAt: at("10:00"), endsAt: at("15:00"),
    travelMinutes: 9, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["social", "academic"],
    circumstances: ["free", "solo-friendly", "drop-in", "step-free", "free-food"],
    goingCount: 0, matchScore: 0.93,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Most tables give away food to get you to sign up. That is a legitimate lunch plan."
  },
  {
    id: "evt_009",
    title: "Free museum morning, last Sunday of term start",
    venue: "THEMUSEUM",
    startsAt: at("10:30"), endsAt: at("13:00"),
    travelMinutes: 36, travelMode: "transit",
    price: 0, currency: "CAD", costTier: "free",
    scope: "kw",
    setting: "indoor",
    tags: ["arts", "social"],
    circumstances: ["free", "solo-friendly", "step-free", "quiet"],
    goingCount: 0, matchScore: 0.72,
    source: { name: "Venue site", url: "https://example.ca" },
    imageUrl: null,
    description: "Three floors, no ticket needed before one o'clock. The ION stops outside."
  },
  {
    id: "evt_010",
    title: "Trail walk along the Grand, five kilometres",
    venue: "Walter Bean Trail",
    startsAt: at("10:00"), endsAt: at("12:00"),
    travelMinutes: 22, travelMode: "transit",
    price: 0, currency: "CAD", costTier: "free",
    scope: "kw",
    setting: "outdoor",
    tags: ["outdoors", "wellness"],
    circumstances: ["free", "solo-friendly", "beginner-welcome", "quiet"],
    goingCount: 0, matchScore: 0.73,
    source: { name: "Meetup", url: "https://meetup.com" },
    imageUrl: null,
    description: "Flat gravel the whole way. Good if you have not left campus in a week."
  },
  {
    id: "evt_011",
    title: "Co-op resume clinic, fifteen minute slots",
    venue: "Tatham Centre",
    startsAt: at("11:00"), endsAt: at("14:00"),
    travelMinutes: 9, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["career", "academic"],
    circumstances: ["free", "beginner-welcome", "no-alcohol", "drop-in", "step-free"],
    goingCount: 0, matchScore: 0.81,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "An advisor reads it in front of you and marks it up. Bring it on your phone."
  },
  {
    id: "evt_012",
    title: "Uptown market, makers and a food truck row",
    venue: "Waterloo Public Square",
    startsAt: at("11:00"), endsAt: at("16:00"),
    travelMinutes: 19, travelMode: "transit",
    price: 0, currency: "CAD", costTier: "free",
    scope: "kw",
    setting: "outdoor",
    tags: ["food", "social", "outdoors"],
    circumstances: ["free", "solo-friendly", "step-free", "drop-in"],
    goingCount: 0, matchScore: 0.93,
    source: { name: "Venue site", url: "https://example.ca" },
    imageUrl: null,
    description: "Free to wander. Most trucks do a student price if you ask."
  },
  {
    id: "evt_013",
    title: "Free lunch, welcome for international students",
    venue: "Federation Hall",
    startsAt: at("11:30"), endsAt: at("13:30"),
    travelMinutes: 9, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["food", "social"],
    circumstances: ["free", "free-food", "solo-friendly", "beginner-welcome", "step-free"],
    goingCount: 0, matchScore: 0.95,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Hot food, no ticket. They seat you with people from your faculty."
  },
  {
    id: "evt_014",
    title: "Quantum computing, a talk that assumes nothing",
    venue: "Quantum-Nano Centre",
    startsAt: at("12:00"), endsAt: at("13:00"),
    travelMinutes: 10, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["tech", "academic", "research"],
    circumstances: ["free", "beginner-welcome", "quiet", "no-alcohol", "step-free"],
    goingCount: 0, matchScore: 0.9,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Forty minutes, then questions. No physics past first year is assumed."
  },
  {
    id: "evt_015",
    title: "Intro to large language models, pizza after",
    venue: "Communitech, The Tannery",
    startsAt: at("12:30"), endsAt: at("14:30"),
    travelMinutes: 32, travelMode: "transit",
    price: 0, currency: "CAD", costTier: "free",
    scope: "kw",
    setting: "indoor",
    tags: ["tech", "ai-ml", "career"],
    circumstances: ["free", "free-food", "beginner-welcome", "solo-friendly", "step-free"],
    goingCount: 0, matchScore: 0.86,
    source: { name: "Meetup", url: "https://meetup.com" },
    imageUrl: null,
    description: "A talk, a demo, then food and people to talk to. Students get in free."
  },
  {
    id: "evt_016",
    title: "Chess club, boards out, all levels",
    venue: "Student Life Centre",
    startsAt: at("12:30"), endsAt: at("16:00"),
    travelMinutes: 9, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["games", "social"],
    circumstances: ["free", "drop-in", "solo-friendly", "beginner-welcome", "no-alcohol"],
    goingCount: 0, matchScore: 0.74,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Tables by the turnkey desk. Someone will teach you the openings if you ask."
  },
  {
    id: "evt_017",
    title: "Machine learning reading group, first session",
    venue: "Davis Centre",
    startsAt: at("13:00"), endsAt: at("14:30"),
    travelMinutes: 6, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["ai-ml", "tech", "research", "academic"],
    circumstances: ["free", "quiet", "no-alcohol", "solo-friendly"],
    goingCount: 0, matchScore: 0.66,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "One paper a week. The first session is deliberately an easy one."
  },
  {
    id: "evt_018",
    title: "Beginner pottery, one pot on the wheel",
    venue: "Button Factory Arts",
    startsAt: at("13:00"), endsAt: at("15:00"),
    travelMinutes: 19, travelMode: "transit",
    price: 25, currency: "CAD", costTier: "pricey",
    scope: "kw",
    setting: "indoor",
    tags: ["arts"],
    circumstances: ["student-price", "beginner-welcome", "no-alcohol", "solo-friendly", "step-free"],
    goingCount: 0, matchScore: 0.52,
    source: { name: "Venue site", url: "https://example.ca" },
    imageUrl: null,
    description: "Twenty five with a student card. They fire it and you collect it in three weeks."
  },
  {
    id: "evt_019",
    title: "Pickup soccer on the north fields",
    venue: "Columbia Fields",
    startsAt: at("13:30"), endsAt: at("15:30"),
    travelMinutes: 8, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "outdoor",
    tags: ["sports", "outdoors"],
    circumstances: ["free", "drop-in", "beginner-welcome", "solo-friendly"],
    goingCount: 0, matchScore: 0.76,
    source: { name: "Instagram", url: "https://instagram.com" },
    imageUrl: null,
    description: "Bring a light shirt and a dark one. Sides get redrawn every twenty minutes."
  },
  {
    id: "evt_020",
    title: "Ultimate frisbee, mixed, nobody keeps score",
    venue: "RIM Park",
    startsAt: at("13:30"), endsAt: at("15:30"),
    travelMinutes: 34, travelMode: "transit",
    price: 0, currency: "CAD", costTier: "free",
    scope: "kw",
    setting: "outdoor",
    tags: ["sports", "outdoors"],
    circumstances: ["free", "beginner-welcome", "solo-friendly", "drop-in"],
    goingCount: 0, matchScore: 0.75,
    source: { name: "Meetup", url: "https://meetup.com" },
    imageUrl: null,
    description: "They will explain the rules in five minutes at the start."
  },
  {
    id: "evt_021",
    title: "Startup office hours, twenty minutes with a founder",
    venue: "Velocity, Engineering 5",
    startsAt: at("14:00"), endsAt: at("17:00"),
    travelMinutes: 5, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["startups", "career", "tech"],
    circumstances: ["free", "beginner-welcome", "no-alcohol", "step-free"],
    goingCount: 0, matchScore: 0.77,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "You do not need a company. Half the slots are people asking what to do next."
  },
  {
    id: "evt_022",
    title: "Canoe on Laurel Creek, boats and vests provided",
    venue: "Laurel Creek Conservation Area",
    startsAt: at("14:00"), endsAt: at("16:00"),
    travelMinutes: 13, travelMode: "bike",
    price: 8, currency: "CAD", costTier: "cheap",
    scope: "campus",
    setting: "outdoor",
    tags: ["outdoors", "sports"],
    circumstances: ["student-price", "beginner-welcome", "no-alcohol", "solo-friendly"],
    goingCount: 0, matchScore: 0.53,
    source: { name: "Venue site", url: "https://example.ca" },
    imageUrl: null,
    description: "Eight dollars for two hours. They pair you up if you turn up alone."
  },
  {
    id: "evt_023",
    title: "First term and feeling flattened, a drop-in hour",
    venue: "Health Services",
    startsAt: at("14:30"), endsAt: at("16:00"),
    travelMinutes: 12, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["wellness"],
    circumstances: ["free", "drop-in", "quiet", "no-alcohol", "solo-friendly", "step-free"],
    goingCount: 0, matchScore: 0.64,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "No appointment and no file opened. You can sit and say nothing."
  },
  {
    id: "evt_024",
    title: "Board game library, borrow one and play here",
    venue: "Student Life Centre",
    startsAt: at("15:00"), endsAt: at("19:00"),
    travelMinutes: 9, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["games", "social"],
    circumstances: ["free", "drop-in", "solo-friendly", "beginner-welcome", "step-free"],
    goingCount: 0, matchScore: 0.78,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Four hundred games behind the desk. Leave your Watcard, take a box."
  },
  {
    id: "evt_025",
    title: "Matinee, nine dollars with a student card",
    venue: "Princess Cinemas",
    startsAt: at("15:00"), endsAt: at("17:15"),
    travelMinutes: 19, travelMode: "transit",
    price: 9, currency: "CAD", costTier: "cheap",
    scope: "kw",
    setting: "indoor",
    tags: ["arts", "social"],
    circumstances: ["student-price", "solo-friendly", "quiet", "step-free"],
    goingCount: 0, matchScore: 0.49,
    source: { name: "Venue site", url: "https://example.ca" },
    imageUrl: null,
    description: "The small screen upstairs. Nine dollars any showing before six."
  },
  {
    id: "evt_026",
    title: "Learn to skate, helmets and skates included",
    venue: "Columbia Icefield",
    startsAt: at("15:30"), endsAt: at("17:00"),
    travelMinutes: 12, travelMode: "walk",
    price: 5, currency: "CAD", costTier: "cheap",
    scope: "campus",
    setting: "indoor",
    tags: ["sports", "wellness"],
    circumstances: ["student-price", "beginner-welcome", "solo-friendly", "no-alcohol"],
    goingCount: 0, matchScore: 0.55,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Five dollars including rentals. Half the ice is held for people holding the boards."
  },
  {
    id: "evt_027",
    title: "Cooking for one without living on noodles",
    venue: "Conrad Grebel University College",
    startsAt: at("16:00"), endsAt: at("17:30"),
    travelMinutes: 11, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["food", "wellness", "academic"],
    circumstances: ["free", "free-food", "beginner-welcome", "no-alcohol", "solo-friendly"],
    goingCount: 0, matchScore: 0.76,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "A live demo, then you eat what was made. Recipes cost under four dollars a portion."
  },
  {
    id: "evt_028",
    title: "Community garden hour, tools provided",
    venue: "Victoria Park",
    startsAt: at("16:00"), endsAt: at("17:30"),
    travelMinutes: 35, travelMode: "transit",
    price: 0, currency: "CAD", costTier: "free",
    scope: "kw",
    setting: "outdoor",
    tags: ["outdoors", "social", "wellness"],
    circumstances: ["free", "solo-friendly", "drop-in", "no-alcohol"],
    goingCount: 0, matchScore: 0.62,
    source: { name: "Meetup", url: "https://meetup.com" },
    imageUrl: null,
    description: "Weeding and bed turnover. Gloves are not provided, bring your own."
  },
  {
    id: "evt_029",
    title: "Bike tune-up clinic, free, bring the bike",
    venue: "SLC Bike Centre",
    startsAt: at("16:30"), endsAt: at("19:00"),
    travelMinutes: 9, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "outdoor",
    tags: ["outdoors", "tech"],
    circumstances: ["free", "drop-in", "beginner-welcome", "solo-friendly", "no-alcohol"],
    goingCount: 0, matchScore: 0.74,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Volunteers show you rather than do it. Parts at cost if you need them."
  },
  {
    id: "evt_030",
    title: "Thrift swap, bring five things take five",
    venue: "The Boathouse, Victoria Park",
    startsAt: at("16:30"), endsAt: at("19:30"),
    travelMinutes: 36, travelMode: "transit",
    price: 0, currency: "CAD", costTier: "free",
    scope: "kw",
    setting: "outdoor",
    tags: ["social", "arts"],
    circumstances: ["free", "solo-friendly", "step-free", "no-alcohol"],
    goingCount: 0, matchScore: 0.75,
    source: { name: "Instagram", url: "https://instagram.com" },
    imageUrl: null,
    description: "Sorted by size on rails. Whatever is left goes to a shelter on Monday."
  },
  {
    id: "evt_031",
    title: "Kitchener night market, thirty stalls",
    venue: "Carl Zehr Square",
    startsAt: at("17:00"), endsAt: at("22:00"),
    travelMinutes: 35, travelMode: "transit",
    price: 0, currency: "CAD", costTier: "free",
    scope: "kw",
    setting: "outdoor",
    tags: ["food", "social", "outdoors"],
    circumstances: ["free", "solo-friendly", "step-free", "drop-in"],
    goingCount: 0, matchScore: 0.93,
    source: { name: "Venue site", url: "https://example.ca" },
    imageUrl: null,
    description: "Free entry, food from six dollars. The ION drops you at the door."
  },
  {
    id: "evt_032",
    title: "Intramural dodgeball, teams made on the spot",
    venue: "Physical Activities Complex",
    startsAt: at("17:00"), endsAt: at("19:00"),
    travelMinutes: 10, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["sports", "social"],
    circumstances: ["free", "drop-in", "beginner-welcome", "solo-friendly", "no-alcohol"],
    goingCount: 0, matchScore: 0.79,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Turn up alone and they will put you on a short team. No kit needed."
  },
  {
    id: "evt_033",
    title: "Hackathon team finding, no idea required",
    venue: "Engineering 7",
    startsAt: at("17:30"), endsAt: at("19:30"),
    travelMinutes: 6, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["tech", "startups", "social"],
    circumstances: ["free", "free-food", "beginner-welcome", "solo-friendly", "step-free"],
    goingCount: 0, matchScore: 0.92,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "You stand up, say what you can do, and sit down. Pizza at seven."
  },
  {
    id: "evt_034",
    title: "Yoga on the grass, pay what you can",
    venue: "Waterloo Park",
    startsAt: at("18:00"), endsAt: at("19:00"),
    travelMinutes: 17, travelMode: "transit",
    price: 0, currency: "CAD", costTier: "free",
    scope: "kw",
    setting: "outdoor",
    tags: ["wellness", "outdoors"],
    circumstances: ["free", "beginner-welcome", "solo-friendly", "no-alcohol", "quiet"],
    goingCount: 0, matchScore: 0.77,
    source: { name: "Instagram", url: "https://instagram.com" },
    imageUrl: null,
    description: "Spare mats by the bandstand. Cancelled if it rains, they post by five."
  },
  {
    id: "evt_035",
    title: "Free pizza and a talk on landing a first co-op",
    venue: "Tatham Centre",
    startsAt: at("18:00"), endsAt: at("19:30"),
    travelMinutes: 9, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["career", "academic"],
    circumstances: ["free", "free-food", "beginner-welcome", "solo-friendly", "step-free"],
    goingCount: 0, matchScore: 0.95,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Three upper years say what they actually did. Pizza before, not after."
  },
  {
    id: "evt_036",
    title: "Open mic, sign up at the door from eight",
    venue: "The Grad House",
    startsAt: at("18:30"), endsAt: at("22:00"),
    travelMinutes: 13, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["music", "social"],
    circumstances: ["free", "solo-friendly", "drop-in", "beginner-welcome"],
    goingCount: 0, matchScore: 0.78,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "You can just watch. Nobody is made to play and the room is small."
  },
  {
    id: "evt_037",
    title: "Trivia night, teams of four or fewer",
    venue: "Federation Hall",
    startsAt: at("18:45"), endsAt: at("21:00"),
    travelMinutes: 9, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["games", "social"],
    circumstances: ["free", "solo-friendly", "drop-in", "beginner-welcome"],
    goingCount: 0, matchScore: 0.9,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Come alone and the host sticks you on a team that is short."
  },
  {
    id: "evt_038",
    title: "Movie night, free popcorn, bring a blanket",
    venue: "Student Life Centre",
    startsAt: at("19:00"), endsAt: at("21:30"),
    travelMinutes: 9, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["arts", "social"],
    circumstances: ["free", "free-food", "solo-friendly", "drop-in", "step-free"],
    goingCount: 0, matchScore: 0.93,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Projected in the Great Hall. Floor cushions go fast, the chairs do not."
  },
  {
    id: "evt_039",
    title: "Intro bouldering, shoes and chalk included",
    venue: "Grand River Rocks",
    startsAt: at("19:00"), endsAt: at("21:00"),
    travelMinutes: 45, travelMode: "transit",
    price: 20, currency: "CAD", costTier: "moderate",
    scope: "kw",
    setting: "indoor",
    tags: ["sports", "wellness"],
    circumstances: ["student-price", "beginner-welcome", "solo-friendly", "no-alcohol"],
    goingCount: 0, matchScore: 0.54,
    source: { name: "Venue site", url: "https://example.ca" },
    imageUrl: null,
    description: "Twenty with a student card, including rentals. Forty minutes of teaching first."
  },
  {
    id: "evt_040",
    title: "Language exchange, six tables, twenty minutes each",
    venue: "Dana Porter Library",
    startsAt: at("19:15"), endsAt: at("21:00"),
    travelMinutes: 11, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["social", "academic"],
    circumstances: ["free", "solo-friendly", "beginner-welcome", "quiet", "step-free"],
    goingCount: 0, matchScore: 0.8,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Everyone moves one seat over when the bell goes. No level required."
  },
  {
    id: "evt_041",
    title: "Jazz set, students half price at the door",
    venue: "The Jazz Room",
    startsAt: at("19:30"), endsAt: at("22:00"),
    travelMinutes: 19, travelMode: "transit",
    price: 10, currency: "CAD", costTier: "moderate",
    scope: "kw",
    setting: "indoor",
    tags: ["music"],
    circumstances: ["student-price", "solo-friendly", "step-free"],
    goingCount: 0, matchScore: 0.55,
    source: { name: "Venue site", url: "https://example.ca" },
    imageUrl: null,
    description: "Ten dollars with a student card. Seats at the bar if you are early."
  },
  {
    id: "evt_042",
    title: "Improv jam, watch or put your name in",
    venue: "Registry Theatre",
    startsAt: at("19:30"), endsAt: at("21:30"),
    travelMinutes: 36, travelMode: "transit",
    price: 8, currency: "CAD", costTier: "cheap",
    scope: "kw",
    setting: "indoor",
    tags: ["arts", "social"],
    circumstances: ["student-price", "beginner-welcome", "solo-friendly"],
    goingCount: 0, matchScore: 0.58,
    source: { name: "Venue site", url: "https://example.ca" },
    imageUrl: null,
    description: "Names in a hat at half seven, teams drawn at random. Eight dollars."
  },
  {
    id: "evt_043",
    title: "Symphony open rehearsal, free with a student card",
    venue: "Centre In The Square",
    startsAt: at("19:45"), endsAt: at("21:30"),
    travelMinutes: 36, travelMode: "transit",
    price: 0, currency: "CAD", costTier: "free",
    scope: "kw",
    setting: "indoor",
    tags: ["music", "arts"],
    circumstances: ["free", "student-price", "solo-friendly", "quiet", "step-free"],
    goingCount: 0, matchScore: 0.83,
    source: { name: "Ticketmaster", url: "https://ticketmaster.ca" },
    imageUrl: null,
    description: "You sit in the stalls while they stop and start. Leave whenever you like."
  },
  {
    id: "evt_044",
    title: "Pickup basketball under the lights",
    venue: "Waterloo Memorial Recreation Complex",
    startsAt: at("20:00"), endsAt: at("22:00"),
    travelMinutes: 20, travelMode: "transit",
    price: 0, currency: "CAD", costTier: "free",
    scope: "kw",
    setting: "indoor",
    tags: ["sports", "social"],
    circumstances: ["free", "drop-in", "solo-friendly", "beginner-welcome"],
    goingCount: 0, matchScore: 0.76,
    source: { name: "Instagram", url: "https://instagram.com" },
    imageUrl: null,
    description: "Winners hold the court. Call your own fouls, nobody argues much."
  },
  {
    id: "evt_045",
    title: "Study hall with free coffee, runs until midnight",
    venue: "Modern Languages Building",
    startsAt: at("20:00"), endsAt: at("23:59"),
    travelMinutes: 10, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["academic", "wellness"],
    circumstances: ["free", "free-food", "quiet", "solo-friendly", "drop-in", "no-alcohol"],
    goingCount: 0, matchScore: 0.74,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Silent room and a talking room. Coffee and biscuits at the front."
  },
  {
    id: "evt_046",
    title: "Karaoke, no cover, list fills by nine",
    venue: "Chainsaw",
    startsAt: at("20:15"), endsAt: at("23:59"),
    travelMinutes: 18, travelMode: "transit",
    price: 0, currency: "CAD", costTier: "free",
    scope: "kw",
    setting: "indoor",
    tags: ["music", "social"],
    circumstances: ["free", "solo-friendly", "drop-in"],
    goingCount: 0, matchScore: 0.78,
    source: { name: "Instagram", url: "https://instagram.com" },
    imageUrl: null,
    description: "No cover charge. Two people have to go up before they will let you duet."
  },
  {
    id: "evt_047",
    title: "Comedy night, five dollars for students",
    venue: "Huether Hotel",
    startsAt: at("20:30"), endsAt: at("22:30"),
    travelMinutes: 18, travelMode: "transit",
    price: 5, currency: "CAD", costTier: "cheap",
    scope: "kw",
    setting: "indoor",
    tags: ["arts", "social"],
    circumstances: ["student-price", "solo-friendly"],
    goingCount: 0, matchScore: 0.53,
    source: { name: "Ticketmaster", url: "https://ticketmaster.ca" },
    imageUrl: null,
    description: "Upstairs room, seven acts, none of them longer than ten minutes."
  },
  {
    id: "evt_048",
    title: "Board games and bubble tea, uptown",
    venue: "Waterloo Public Square",
    startsAt: at("21:00"), endsAt: at("23:30"),
    travelMinutes: 19, travelMode: "transit",
    price: 6, currency: "CAD", costTier: "cheap",
    scope: "kw",
    setting: "outdoor",
    tags: ["games", "food", "social"],
    circumstances: ["student-price", "solo-friendly", "drop-in", "no-alcohol"],
    goingCount: 0, matchScore: 0.47,
    source: { name: "Meetup", url: "https://meetup.com" },
    imageUrl: null,
    description: "You buy a drink, the games are free. Table at the back is the regulars."
  },
  {
    id: "evt_049",
    title: "Late skate, lights down and music up",
    venue: "Columbia Icefield",
    startsAt: at("21:00"), endsAt: at("22:30"),
    travelMinutes: 12, travelMode: "walk",
    price: 5, currency: "CAD", costTier: "cheap",
    scope: "campus",
    setting: "indoor",
    tags: ["sports", "social"],
    circumstances: ["student-price", "solo-friendly", "beginner-welcome", "no-alcohol"],
    goingCount: 0, matchScore: 0.61,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Five dollars with rentals. Quieter than the afternoon session."
  },
  {
    id: "evt_050",
    title: "Three local bands, doors at nine",
    venue: "Starlight Social Club",
    startsAt: at("21:30"), endsAt: at("23:59"),
    travelMinutes: 17, travelMode: "transit",
    price: 15, currency: "CAD", costTier: "moderate",
    scope: "kw",
    setting: "indoor",
    tags: ["music"],
    circumstances: ["student-price", "solo-friendly"],
    goingCount: 0, matchScore: 0.71,
    source: { name: "Ticketmaster", url: "https://ticketmaster.ca" },
    imageUrl: null,
    description: "Fifteen in advance, more on the door. First band closer to ten."
  },
  {
    id: "evt_051",
    title: "Late run, uptown loop, six kilometres",
    venue: "Waterloo Public Square",
    startsAt: at("21:45"), endsAt: at("22:45"),
    travelMinutes: 19, travelMode: "transit",
    price: 0, currency: "CAD", costTier: "free",
    scope: "kw",
    setting: "outdoor",
    tags: ["outdoors", "sports", "wellness"],
    circumstances: ["free", "solo-friendly", "drop-in"],
    goingCount: 0, matchScore: 0.63,
    source: { name: "Meetup", url: "https://meetup.com" },
    imageUrl: null,
    description: "Lit streets the whole way. Six minute kilometres, back where you started."
  },
  {
    id: "evt_052",
    title: "Midnight ramen, the queue is the event",
    venue: "King Street North, uptown",
    startsAt: at("22:00"), endsAt: at("23:30"),
    travelMinutes: 19, travelMode: "transit",
    price: 14, currency: "CAD", costTier: "moderate",
    scope: "kw",
    setting: "outdoor",
    tags: ["food", "social"],
    circumstances: ["student-price", "solo-friendly", "drop-in"],
    goingCount: 0, matchScore: 0.5,
    source: { name: "Instagram", url: "https://instagram.com" },
    imageUrl: null,
    description: "Fourteen dollars for a bowl. The queue outside is where people actually talk."
  },
  {
    id: "evt_053",
    title: "Late gym, quiet hours, half the machines free",
    venue: "Physical Activities Complex",
    startsAt: at("22:30"), endsAt: at("23:59"),
    travelMinutes: 10, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["sports", "wellness"],
    circumstances: ["free", "solo-friendly", "quiet", "no-alcohol", "drop-in"],
    goingCount: 0, matchScore: 0.67,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Card access after ten. Emptiest hour of the whole day."
  },
  {
    id: "evt_054",
    title: "Telescopes out on Columbia Lake if it is clear",
    venue: "Columbia Lake",
    startsAt: at("23:00"), endsAt: at("23:59"),
    travelMinutes: 16, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "outdoor",
    tags: ["research", "outdoors", "academic"],
    circumstances: ["free", "solo-friendly", "quiet", "beginner-welcome", "no-alcohol"],
    goingCount: 0, matchScore: 0.74,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "The society brings four scopes. Cancelled without notice if it clouds over."
  },
  {
    id: "evt_055",
    title: "Dim sum, order by pointing at the table",
    venue: "Kitchener Market",
    startsAt: at("12:00"), endsAt: at("14:00"),
    travelMinutes: 37, travelMode: "transit",
    price: 18, currency: "CAD", costTier: "moderate",
    scope: "kw",
    setting: "mixed",
    tags: ["food", "social"],
    circumstances: ["student-price", "solo-friendly", "step-free"],
    goingCount: 0, matchScore: 0.47,
    source: { name: "Instagram", url: "https://instagram.com" },
    imageUrl: null,
    description: "Eighteen a head if four of you share. Cash is faster than the card machine."
  },
  {
    id: "evt_056",
    title: "Campus tour for people who are still lost",
    venue: "Needles Hall",
    startsAt: at("10:30"), endsAt: at("12:00"),
    travelMinutes: 9, travelMode: "walk",
    price: 0, currency: "CAD", costTier: "free",
    scope: "campus",
    setting: "indoor",
    tags: ["academic", "social"],
    circumstances: ["free", "beginner-welcome", "solo-friendly", "step-free", "drop-in"],
    goingCount: 0, matchScore: 0.81,
    source: { name: "Waterloo Events", url: "https://uwaterloo.ca/events" },
    imageUrl: null,
    description: "Ninety minutes, ends at the library. Shows you where the cheap food is."
  },
];

/* Venue coordinates, so travel time can be recomputed when the user moves.
   The API is expected to carry lat and lng on every event; the seed set
   attaches them from this table. */
const VENUE_COORDS = {
  "Student Life Centre": [43.4723, -80.5449],
  "Physical Activities Complex": [43.472, -80.5468],
  "Mathematics and Computer Building": [43.4723, -80.5435],
  "Needles Hall": [43.4713, -80.5445],
  "Tatham Centre": [43.4703, -80.5405],
  "Federation Hall": [43.4754, -80.5473],
  "Quantum-Nano Centre": [43.4703, -80.5423],
  "Davis Centre": [43.4729, -80.5423],
  "Columbia Fields": [43.4768, -80.546],
  "Velocity, Engineering 5": [43.473, -80.5396],
  "Health Services": [43.4706, -80.547],
  "Columbia Icefield": [43.4762, -80.5504],
  "Conrad Grebel University College": [43.474, -80.549],
  "SLC Bike Centre": [43.4725, -80.5452],
  "Engineering 7": [43.4727, -80.5397],
  "The Grad House": [43.469, -80.545],
  "Dana Porter Library": [43.4694, -80.5424],
  "Modern Languages Building": [43.47, -80.5432],
  "Ring Road, north campus": [43.474, -80.543],
  "Columbia Lake": [43.478, -80.554],
  "Waterloo Park": [43.4633, -80.5323],
  "Waterloo Public Square": [43.4643, -80.523],
  "The Jazz Room": [43.4658, -80.5227],
  "Chainsaw": [43.467, -80.523],
  "Huether Hotel": [43.4664, -80.5237],
  "Starlight Social Club": [43.4652, -80.5296],
  "Princess Cinemas": [43.4654, -80.5233],
  "Button Factory Arts": [43.4672, -80.521],
  "Laurel Creek Conservation Area": [43.485, -80.558],
  "Waterloo Memorial Recreation Complex": [43.472, -80.516],
  "King Street North, uptown": [43.465, -80.524],
  "Walter Bean Trail": [43.48, -80.51],
  "RIM Park": [43.5, -80.493],
  "St. Jacobs Farmers' Market": [43.5083, -80.5533],
  "Communitech, The Tannery": [43.4519, -80.4989],
  "THEMUSEUM": [43.4497, -80.49],
  "Carl Zehr Square": [43.4516, -80.4925],
  "Victoria Park": [43.447, -80.496],
  "Kitchener Market": [43.4506, -80.4869],
  "Centre In The Square": [43.4527, -80.4863],
  "Registry Theatre": [43.4504, -80.4909],
  "Grand River Rocks": [43.4423, -80.4736],
  "The Boathouse, Victoria Park": [43.4468, -80.4949],
};

export const SEED_EVENTS = RAW_EVENTS.map((e) => {
  const c = VENUE_COORDS[e.venue] || [null, null];
  return { ...e, lat: c[0], lng: c[1] };
});


/* Somewhere to start from when the browser will not share a location. */
export const QUICK_PLACES = [
  { id: "phillip",  label: "Phillip & Columbia", lat: 43.4760, lng: -80.5397 },
  { id: "slc",      label: "UW campus",          lat: 43.4723, lng: -80.5449 },
  { id: "uptown",   label: "Uptown Waterloo",    lat: 43.4650, lng: -80.5240 },
  { id: "laurier",  label: "Laurier",            lat: 43.4738, lng: -80.5272 },
  { id: "kitchener",label: "Downtown Kitchener", lat: 43.4516, lng: -80.4925 },
  { id: "north",    label: "North Waterloo",     lat: 43.4980, lng: -80.5270 }
];

export const SEED_USER = {
  origin: { lat: 43.4760, lng: -80.5397, label: "Phillip & Columbia" },
  maxTravelMinutes: 30,
  budget: "free",
  scope: "kw",
  freeWindows: [
    { startsAt: at("18:30"), endsAt: at("21:00") }
  ],
  interests: [],
  circumstances: []
};

const SAMPLE_FEED = (note) => ({ events: SEED_EVENTS, feed: { live: false, note } });

/* The server already builds this shape; this only guards the fields the
   ranking reads unconditionally, so one odd listing cannot stop the page. */
function fromFeed(e) {
  return {
    ...e,
    tags: Array.isArray(e.tags) && e.tags.length ? e.tags : ["social"],
    circumstances: Array.isArray(e.circumstances) ? e.circumstances : [],
    price: typeof e.price === "number" ? e.price : null,
    travelMinutes: Number.isFinite(e.travelMinutes) ? e.travelMinutes : 30,
    travelMode: e.travelMode || "transit",
    setting: e.setting || "indoor",
    scope: e.scope || "any",
    goingCount: e.goingCount || 0
  };
}

/* Resolves to { events, feed }, where feed says whether these are live.
   A thin live day (a Sunday with four Ticketmaster listings, all an hour
   away) must not replace the whole sample set with nothing usable, so
   below a floor of reachable listings the samples stay in alongside the
   live ones, and the note says exactly that. */
const USABLE_FLOOR = 8;

/* The feed is asked for listings around wherever the user is, and the
   server measures travel from there too. The sample set is Waterloo's,
   so it only ever joins a thin feed when the user is near Waterloo;
   anywhere else the live feed stands alone, however thin. */
const WATERLOO = { lat: 43.4760, lng: -80.5397 };
const NEAR_WATERLOO_KM = 40;
const FEED_RADIUS_KM = 60;

export async function loadEvents(origin = SEED_USER.origin) {
  if (!USE_API) return SAMPLE_FEED("Sample listings.");
  const near = distanceKm(origin, WATERLOO) <= NEAR_WATERLOO_KM;
  const where = origin.label ? ` near ${origin.label}` : "";
  try {
    const qs = `?date=${D}&lat=${origin.lat.toFixed(4)}&lng=${origin.lng.toFixed(4)}&radius=${FEED_RADIUS_KM}`;
    const r = await fetch(`${API_URL}${qs}`, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`events ${r.status}`);
    const j = await r.json();
    const live = (Array.isArray(j) ? j : j.events || []).map(fromFeed);
    const from = (j.sources || []).join(" and ");
    const usable = live.filter((e) => e.travelMinutes <= 60).length;

    if (usable >= USABLE_FLOOR) {
      return { events: live, feed: { live: true, note: `Live listings${where} today${from ? ` from ${from}` : ""}.` } };
    }
    if (!near) {
      const n = live.length;
      return {
        events: live,
        feed: {
          live: n > 0,
          thin: true,
          note: n
            ? `${n} live listing${n === 1 ? "" : "s"}${where} today${from ? ` from ${from}` : ""}.`
            : `Nothing on the feed${where} today. Try a bigger city, or another day with ?date=.`
        }
      };
    }
    if (!live.length) {
      return SAMPLE_FEED("The live feed has nothing on for today, so these are sample listings.");
    }
    const ids = new Set(live.map((e) => String(e.id)));
    const events = [...live, ...SEED_EVENTS.filter((e) => !ids.has(String(e.id)))];
    const n = live.length;
    return {
      events,
      feed: {
        live: true,
        thin: true,
        note: `${n} live listing${n === 1 ? "" : "s"} today${from ? ` from ${from}` : ""}, ` +
          "shown alongside sample listings because the live feed is thin."
      }
    };
  } catch (err) {
    return SAMPLE_FEED("The listings server is not running, so these are sample listings.");
  }
}

/* ---- travel model ----------------------------------------------------
   Straight-line distance with a per-mode speed. It is an estimate, not a
   routing engine, and it is only used once the user moves off the default
   origin. The feed's own travelMinutes wins until then. */

const SPEEDS = {            /* km/h door to door, plus a fixed overhead */
  walk:    { kmh: 4.6, fixed: 1 },
  bike:    { kmh: 11,  fixed: 3 },
  transit: { kmh: 11,  fixed: 9 },
  drive:   { kmh: 18,  fixed: 4 }
};

export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function estimateTravel(origin, event) {
  if (event.lat == null || event.lng == null) return null;
  const km = distanceKm(origin, { lat: event.lat, lng: event.lng });
  const mode = SPEEDS[event.travelMode] ? event.travelMode : "transit";
  const { kmh, fixed } = SPEEDS[mode];
  return Math.max(1, Math.round(fixed + (km / kmh) * 60));
}

/* ---- geocoding -------------------------------------------------------
   OpenStreetMap's Nominatim. Google's Geocoding API needs a billed key,
   so it is not an option for a key-free build. Only ever called with a
   place name the user typed. */

export const GEOCODE_URL = "https://nominatim.openstreetmap.org/search";

export async function geocode(query) {
  const url = `${GEOCODE_URL}?format=json&addressdetails=1&limit=1` +
    `&countrycodes=ca&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`geocoder ${r.status}`);
  const hits = await r.json();
  if (!hits.length) throw new Error("no match");
  const hit = hits[0];
  return { lat: Number(hit.lat), lng: Number(hit.lon), label: placeLabel(hit) };
}

/* display_name is a full postal address and far too long for a label. */
function placeLabel(hit) {
  const a = hit.address || {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const area = a.neighbourhood || a.suburb || a.city_district ||
    a.town || a.city || a.village || a.county || "";
  const name = (hit.name || "").trim();
  /* A long POI name is worse than the street it sits on. */
  const primary = (!name || (street && name.length > 28)) ? (street || name) : name;
  const label = [...new Set([primary, area].filter(Boolean))].join(", ") ||
    String(hit.display_name).split(",")[0].trim();
  return label.length > 38 ? `${label.slice(0, 37).trimEnd()}…` : label;
}

/* ---- how close one interest is to another ----------------------------
   A match percentage that only counted exact tag hits would call a
   machine learning reading group a 0% match for someone who picked
   "tech". These are the pairs that are near enough to say so. Anything
   unlisted falls back to BASE_SIMILARITY. */

const BASE_SIMILARITY = 0.12;

const NEAR = [
  ["tech", "ai-ml", 0.85], ["tech", "startups", 0.65], ["tech", "research", 0.6],
  ["tech", "academic", 0.55], ["tech", "career", 0.45], ["tech", "games", 0.3],
  ["ai-ml", "research", 0.72], ["ai-ml", "academic", 0.5], ["ai-ml", "startups", 0.5],
  ["ai-ml", "career", 0.35],
  ["research", "academic", 0.8], ["research", "career", 0.3],
  ["academic", "career", 0.5],
  ["startups", "career", 0.7], ["startups", "social", 0.35],
  ["arts", "music", 0.62], ["arts", "social", 0.35], ["arts", "academic", 0.3],
  ["music", "social", 0.45],
  ["sports", "wellness", 0.68], ["sports", "outdoors", 0.7], ["sports", "social", 0.35],
  ["wellness", "outdoors", 0.55], ["wellness", "social", 0.3], ["wellness", "food", 0.3],
  ["outdoors", "social", 0.35],
  ["social", "food", 0.5], ["social", "games", 0.6],
  ["food", "games", 0.3]
];

const SIM = new Map();
for (const [a, b, v] of NEAR) {
  SIM.set(`${a}|${b}`, v);
  SIM.set(`${b}|${a}`, v);
}

export function similarity(a, b) {
  if (a === b) return 1;
  return SIM.get(`${a}|${b}`) ?? BASE_SIMILARITY;
}

/* Artwork palette per leading interest: [ground, subject, detail].
   Chosen so the subject always reads against its ground. */
export const ART_PALETTES = {
  music:    ["art-5", "art-3", "art-2"],
  sports:   ["art-1", "art-7", "art-5"],
  tech:     ["art-3", "art-6", "art-7"],
  "ai-ml":  ["art-3", "art-5", "art-6"],
  career:   ["art-6", "art-7", "art-3"],
  startups: ["art-2", "art-7", "art-3"],
  arts:     ["art-4", "art-3", "art-2"],
  academic: ["art-7", "art-3", "art-1"],
  research: ["art-3", "art-5", "art-7"],
  social:   ["art-1", "art-5", "art-7"],
  wellness: ["art-6", "art-4", "art-7"],
  outdoors: ["art-5", "art-6", "art-3"],
  food:     ["art-5", "art-2", "art-3"],
  games:    ["art-1", "art-2", "art-7"]
};

/* ---- weather ---------------------------------------------------------
   Open-Meteo needs no key and allows browser requests, so the forecast
   can drive the ranking without anyone signing up for anything. Only the
   origin coordinates are sent. */

export const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

/* Used when the forecast cannot be fetched, so the ranking still has
   something to work from. Labelled in the interface as a sample. */
export const SAMPLE_FORECAST = {
  sample: true,
  hours: Object.fromEntries(
    [[6, 13, 5], [7, 14, 5], [8, 15, 5], [9, 17, 10], [10, 18, 10], [11, 19, 15],
     [12, 20, 15], [13, 21, 20], [14, 21, 25], [15, 20, 35], [16, 19, 45],
     [17, 18, 55], [18, 17, 70], [19, 16, 80], [20, 15, 75], [21, 15, 60],
     [22, 14, 40], [23, 14, 30], [0, 13, 20], [1, 13, 15], [2, 12, 10],
     [3, 12, 10], [4, 12, 5], [5, 12, 5]]
      .map(([h, t, r]) => [h, { temp: t, rain: r }])
  )
};

export async function fetchForecast(origin) {
  const url = `${WEATHER_URL}?latitude=${origin.lat.toFixed(4)}&longitude=${origin.lng.toFixed(4)}` +
    `&hourly=temperature_2m,precipitation_probability&timezone=America%2FToronto&forecast_days=2`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`weather ${r.status}`);
  const j = await r.json();
  const hourly = j.hourly || {};
  const times = hourly.time || [];
  const hours = {};
  times.forEach((t, i) => {
    if (!String(t).startsWith(D)) return;
    hours[Number(String(t).slice(11, 13))] = {
      temp: hourly.temperature_2m?.[i] ?? null,
      rain: hourly.precipitation_probability?.[i] ?? 0
    };
  });
  if (!Object.keys(hours).length) throw new Error("no hours for today");
  return { sample: false, hours };
}
