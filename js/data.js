export const USE_API = false;
export const API_URL = "/api/events";

const D = "2026-09-13";
const Z = "-04:00";
const at = (t) => `${D}T${t}:00${Z}`;

const RAW_EVENTS = [
  {
    id: "evt_001",
    title: "Board game night, they pair you up",
    venue: "Snakes & Lattes Annex",
    startsAt: at("19:00"), endsAt: at("22:00"),
    travelMinutes: 14, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["games", "social"],
    circumstances: ["solo-friendly", "free", "step-free", "beginner-welcome"],
    goingCount: 7, matchScore: 0.82,
    source: { name: "Instagram", url: "https://instagram.com/snakesandlattes" },
    imageUrl: null,
    description: "Drop-in from seven. Tell the host you came alone and they will sit you at a table that is short a player."
  },
  {
    id: "evt_002",
    title: "Kensington market run club, easy 5k",
    venue: "Bellevue Square Park",
    startsAt: at("18:45"), endsAt: at("20:00"),
    travelMinutes: 9, travelMode: "walk",
    price: 0, currency: "CAD",
    tags: ["outdoors", "fitness"],
    circumstances: ["solo-friendly", "free", "beginner-welcome"],
    goingCount: 22, matchScore: 0.79,
    source: { name: "Instagram", url: "https://instagram.com/kensingtonrunclub" },
    imageUrl: null,
    description: "Two pace groups, the back one walks the hills. Bag drop at the gazebo."
  },
  {
    id: "evt_003",
    title: "Open mic upstairs, sign up at eight",
    venue: "The Cameron House",
    startsAt: at("20:30"), endsAt: at("23:00"),
    travelMinutes: 6, travelMode: "walk",
    price: 0, currency: "CAD",
    tags: ["music"],
    circumstances: ["solo-friendly", "free"],
    goingCount: 31, matchScore: 0.74,
    source: { name: "Eventbrite", url: "https://eventbrite.ca/e/cameron-open-mic" },
    imageUrl: null,
    description: "Back room, pass the hat. You can just watch, nobody will make you play."
  },
  {
    id: "evt_004",
    title: "Life drawing, no experience needed",
    venue: "Artscape Youngplace",
    startsAt: at("19:00"), endsAt: at("21:30"),
    travelMinutes: 12, travelMode: "transit",
    price: 15, currency: "CAD",
    tags: ["art"],
    circumstances: ["beginner-welcome", "quiet", "step-free", "no-alcohol"],
    goingCount: 12, matchScore: 0.71,
    source: { name: "Eventbrite", url: "https://eventbrite.ca/e/youngplace-life-drawing" },
    imageUrl: null,
    description: "Paper and charcoal provided. Short poses first, one long pose after the break."
  },
  {
    id: "evt_005",
    title: "Pickup volleyball, nets already up",
    venue: "Trinity Bellwoods Park",
    startsAt: at("17:30"), endsAt: at("19:30"),
    travelMinutes: 11, travelMode: "bike",
    price: 0, currency: "CAD",
    tags: ["outdoors", "fitness", "social"],
    circumstances: ["solo-friendly", "free", "beginner-welcome"],
    goingCount: 18, matchScore: 0.64,
    source: { name: "Meetup", url: "https://meetup.com/toronto-pickup-volleyball" },
    imageUrl: null,
    description: "Two courts on the south side. Rotate in, losers sit."
  },
  {
    id: "evt_006",
    title: "Early jazz set, trio",
    venue: "The Rex Hotel",
    startsAt: at("18:45"), endsAt: at("21:00"),
    travelMinutes: 7, travelMode: "walk",
    price: 10, currency: "CAD",
    tags: ["music"],
    circumstances: ["solo-friendly", "step-free"],
    goingCount: 26, matchScore: 0.68,
    source: { name: "Venue site", url: "https://therex.ca/calendar" },
    imageUrl: null,
    description: "Cover at the door, cash or tap. Seats at the bar if you get there before the set."
  },
  {
    id: "evt_007",
    title: "Silent book club, bring whatever you're reading",
    venue: "Glad Day Bookshop",
    startsAt: at("19:00"), endsAt: at("20:30"),
    travelMinutes: 18, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["books", "social"],
    circumstances: ["solo-friendly", "free", "quiet", "step-free", "no-alcohol"],
    goingCount: 9, matchScore: 0.77,
    source: { name: "Instagram", url: "https://instagram.com/gladdaybookshop" },
    imageUrl: null,
    description: "An hour of reading in the same room, then anyone who wants to talk about it stays."
  },
  {
    id: "evt_008",
    title: "Chess tables, all levels",
    venue: "Christie Pits Park",
    startsAt: at("17:00"), endsAt: at("19:00"),
    travelMinutes: 16, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["games"],
    circumstances: ["solo-friendly", "free", "no-alcohol"],
    goingCount: 6, matchScore: 0.58,
    source: { name: "Meetup", url: "https://meetup.com/christie-pits-chess" },
    imageUrl: null,
    description: "Boards on the concrete tables by the bandshell. Someone always has a spare clock."
  },
  {
    id: "evt_009",
    title: "Intro bouldering, shoes included",
    venue: "Basecamp Climbing Bathurst",
    startsAt: at("21:30"), endsAt: at("23:00"),
    travelMinutes: 26, travelMode: "transit",
    price: 25, currency: "CAD",
    tags: ["fitness", "outdoors"],
    circumstances: ["beginner-welcome", "solo-friendly", "no-alcohol"],
    goingCount: 14, matchScore: 0.66,
    source: { name: "Venue site", url: "https://basecampclimbing.ca/intro" },
    imageUrl: null,
    description: "Forty minutes of teaching, then the walls are yours until close."
  },
  {
    id: "evt_010",
    title: "Trivia, teams of four or fewer",
    venue: "Sneaky Dee's",
    startsAt: at("20:00"), endsAt: at("22:30"),
    travelMinutes: 8, travelMode: "walk",
    price: 0, currency: "CAD",
    tags: ["games", "social"],
    circumstances: ["solo-friendly", "free"],
    goingCount: 41, matchScore: 0.7,
    source: { name: "Instagram", url: "https://instagram.com/sneakydees" },
    imageUrl: null,
    description: "Show up alone and the host will stick you on a short team. Kitchen runs late."
  },
  {
    id: "evt_011",
    title: "Swing dance drop-in, lesson first",
    venue: "Dovercourt House",
    startsAt: at("19:30"), endsAt: at("23:00"),
    travelMinutes: 21, travelMode: "transit",
    price: 12, currency: "CAD",
    tags: ["music", "social", "fitness"],
    circumstances: ["solo-friendly", "beginner-welcome", "no-alcohol"],
    goingCount: 55, matchScore: 0.73,
    source: { name: "Venue site", url: "https://dovercourthouse.ca/swing" },
    imageUrl: null,
    description: "Beginner lesson at half seven, no partner needed, the floor opens at half eight."
  },
  {
    id: "evt_012",
    title: "Night photo walk along the ravine",
    venue: "Evergreen Brick Works",
    startsAt: at("18:30"), endsAt: at("20:30"),
    travelMinutes: 34, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["outdoors", "art"],
    circumstances: ["solo-friendly", "free", "quiet", "beginner-welcome"],
    goingCount: 11, matchScore: 0.62,
    source: { name: "Meetup", url: "https://meetup.com/toronto-night-photo" },
    imageUrl: null,
    description: "Phone cameras are fine. Meet by the welcome centre, we loop the quarry and come back."
  },
  {
    id: "evt_013",
    title: "Ping pong social, singles ladder",
    venue: "SPIN Toronto",
    startsAt: at("21:15"), endsAt: at("23:00"),
    travelMinutes: 13, travelMode: "walk",
    price: 5, currency: "CAD",
    tags: ["games", "social", "fitness"],
    circumstances: ["solo-friendly", "beginner-welcome", "step-free"],
    goingCount: 19, matchScore: 0.69,
    source: { name: "Instagram", url: "https://instagram.com/spintoronto" },
    imageUrl: null,
    description: "Five dollars gets you on the ladder. Paddles at the front desk."
  },
  {
    id: "evt_014",
    title: "Beginner salsa, no partner needed",
    venue: "Lula Lounge",
    startsAt: at("19:30"), endsAt: at("22:00"),
    travelMinutes: 29, travelMode: "transit",
    price: 18, currency: "CAD",
    tags: ["music", "social"],
    circumstances: ["solo-friendly", "beginner-welcome", "step-free"],
    goingCount: 37, matchScore: 0.61,
    source: { name: "Venue site", url: "https://lula.ca/events" },
    imageUrl: null,
    description: "Class rotates partners the whole hour, so coming alone is normal here."
  },
  {
    id: "evt_015",
    title: "Sunset paddle, boats provided",
    venue: "Cherry Beach Paddle Club",
    startsAt: at("18:50"), endsAt: at("20:30"),
    travelMinutes: 47, travelMode: "transit",
    price: 20, currency: "CAD",
    tags: ["outdoors", "fitness"],
    circumstances: ["beginner-welcome", "no-alcohol"],
    goingCount: 8, matchScore: 0.44,
    source: { name: "Venue site", url: "https://cherrybeachpaddle.ca" },
    imageUrl: null,
    description: "Tandem canoes, they will match you with someone if you turn up alone."
  },
  {
    id: "evt_016",
    title: "Korean home cooking, one dish",
    venue: "Ryu Kitchen Studio, Bloor West",
    startsAt: at("18:00"), endsAt: at("20:00"),
    travelMinutes: 31, travelMode: "transit",
    price: 45, currency: "CAD",
    tags: ["food"],
    circumstances: ["beginner-welcome", "no-alcohol", "step-free"],
    goingCount: 10, matchScore: 0.4,
    source: { name: "Eventbrite", url: "https://eventbrite.ca/e/ryu-kitchen-banchan" },
    imageUrl: null,
    description: "You make banchan and eat what you made. Aprons and containers included."
  },
  {
    id: "evt_017",
    title: "Late show, two local bands",
    venue: "The Horseshoe Tavern",
    startsAt: at("21:30"), endsAt: at("23:00"),
    travelMinutes: 5, travelMode: "walk",
    price: 22, currency: "CAD",
    tags: ["music"],
    circumstances: ["solo-friendly"],
    goingCount: 64, matchScore: 0.53,
    source: { name: "Venue site", url: "https://horseshoetavern.com" },
    imageUrl: null,
    description: "Doors at nine, first band closer to half ten."
  },
  {
    id: "evt_018",
    title: "Dog park meetup, bring or borrow",
    venue: "Stanley Park South",
    startsAt: at("17:15"), endsAt: at("18:30"),
    travelMinutes: 12, travelMode: "walk",
    price: 0, currency: "CAD",
    tags: ["outdoors", "social"],
    circumstances: ["free", "solo-friendly", "kid-friendly", "step-free"],
    goingCount: 15, matchScore: 0.38,
    source: { name: "Facebook", url: "https://facebook.com/groups/stanleyparkdogs" },
    imageUrl: null,
    description: "Regulars gather by the west gate before dark."
  },
  {
    id: "evt_019",
    title: "Repair café, bring the broken thing",
    venue: "Wychwood Barns",
    startsAt: at("17:00"), endsAt: at("20:00"),
    travelMinutes: 24, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["making", "social"],
    circumstances: ["free", "step-free", "kid-friendly", "no-alcohol"],
    goingCount: 13, matchScore: 0.47,
    source: { name: "Facebook", url: "https://facebook.com/wychwoodrepaircafe" },
    imageUrl: null,
    description: "Volunteers fix lamps, bikes and small electronics while you wait."
  },
  {
    id: "evt_020",
    title: "Pub quiz for people who hate pub quizzes",
    venue: "The Only Cafe, Danforth",
    startsAt: at("20:00"), endsAt: at("22:00"),
    travelMinutes: 52, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["games", "social"],
    circumstances: ["free", "solo-friendly"],
    goingCount: 24, matchScore: 0.55,
    source: { name: "Instagram", url: "https://instagram.com/theonlycafe" },
    imageUrl: null,
    description: "No sports round, no capital cities. Mostly music and bad film."
  },
  {
    id: "evt_021",
    title: "Ultimate frisbee, mixed, drop in",
    venue: "Riverdale Park East",
    startsAt: at("18:15"), endsAt: at("20:00"),
    travelMinutes: 28, travelMode: "bike",
    price: 5, currency: "CAD",
    tags: ["outdoors", "fitness"],
    circumstances: ["beginner-welcome", "solo-friendly"],
    goingCount: 20, matchScore: 0.5,
    source: { name: "Meetup", url: "https://meetup.com/toronto-drop-in-ultimate" },
    imageUrl: null,
    description: "Bring a light and a dark shirt. They stop when the light goes."
  },
  {
    id: "evt_022",
    title: "Screenprinting open studio",
    venue: "Open Studio, Distillery District",
    startsAt: at("19:00"), endsAt: at("22:00"),
    travelMinutes: 49, travelMode: "transit",
    price: 30, currency: "CAD",
    tags: ["art", "making"],
    circumstances: ["beginner-welcome", "step-free", "no-alcohol"],
    goingCount: 7, matchScore: 0.52,
    source: { name: "Venue site", url: "https://openstudio.ca/open-studio-nights" },
    imageUrl: null,
    description: "Pull one shirt or ten. Ink and squeegees are shared, bring your own garment."
  },
  {
    id: "evt_023",
    title: "Astronomy night, telescopes out if clear",
    venue: "High Park, Hillside Gardens",
    startsAt: at("21:20"), endsAt: at("23:00"),
    travelMinutes: 42, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["outdoors", "science"],
    circumstances: ["free", "quiet", "kid-friendly", "solo-friendly"],
    goingCount: 17, matchScore: 0.49,
    source: { name: "Facebook", url: "https://facebook.com/groups/rascto" },
    imageUrl: null,
    description: "Members set up four or five scopes. Cancelled without notice if it clouds over."
  },
  {
    id: "evt_024",
    title: "Beginner bachata, first class free",
    venue: "Steps Dance Studio, Ossington",
    startsAt: at("21:15"), endsAt: at("22:30"),
    travelMinutes: 19, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["music", "social", "fitness"],
    circumstances: ["free", "beginner-welcome", "solo-friendly", "no-alcohol"],
    goingCount: 28, matchScore: 0.57,
    source: { name: "Instagram", url: "https://instagram.com/stepsdanceto" },
    imageUrl: null,
    description: "Late class, mostly people coming off shift."
  },
  {
    id: "evt_025",
    title: "Storytelling night, five readers",
    venue: "Burdock Music Hall",
    startsAt: at("19:45"), endsAt: at("22:00"),
    travelMinutes: 23, travelMode: "transit",
    price: 14, currency: "CAD",
    tags: ["books", "music"],
    circumstances: ["solo-friendly", "step-free"],
    goingCount: 34, matchScore: 0.6,
    source: { name: "Venue site", url: "https://burdockto.com/music-hall" },
    imageUrl: null,
    description: "True stories, ten minutes each, no notes allowed."
  },
  {
    id: "evt_026",
    title: "Sauna and cold plunge social",
    venue: "Othership Adelaide",
    startsAt: at("21:30"), endsAt: at("23:00"),
    travelMinutes: 10, travelMode: "walk",
    price: 55, currency: "CAD",
    tags: ["fitness", "social"],
    circumstances: ["no-alcohol", "solo-friendly"],
    goingCount: 25, matchScore: 0.35,
    source: { name: "Venue site", url: "https://othership.us/toronto" },
    imageUrl: null,
    description: "Guided session, phones stay in the locker."
  },
  {
    id: "evt_027",
    title: "Community garden work night",
    venue: "Alexandra Park Community Garden",
    startsAt: at("17:45"), endsAt: at("19:15"),
    travelMinutes: 4, travelMode: "walk",
    price: 0, currency: "CAD",
    tags: ["outdoors", "making"],
    circumstances: ["free", "solo-friendly", "kid-friendly", "no-alcohol"],
    goingCount: 9, matchScore: 0.51,
    source: { name: "Facebook", url: "https://facebook.com/groups/alexandraparkgarden" },
    imageUrl: null,
    description: "Weeding and bed turnover. Tools are in the shed, gloves are not, bring your own."
  },
  {
    id: "evt_028",
    title: "Board game swap and play",
    venue: "401 Games, Yonge Street",
    startsAt: at("18:00"), endsAt: at("21:00"),
    travelMinutes: 17, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["games"],
    circumstances: ["free", "solo-friendly", "step-free", "beginner-welcome"],
    goingCount: 16, matchScore: 0.63,
    source: { name: "Instagram", url: "https://instagram.com/401games" },
    imageUrl: null,
    description: "Bring a game you are done with, leave with one you are not."
  },
  {
    id: "evt_029",
    title: "Beach volleyball under lights",
    venue: "Ashbridges Bay",
    startsAt: at("19:00"), endsAt: at("21:30"),
    travelMinutes: 50, travelMode: "transit",
    price: 8, currency: "CAD",
    tags: ["outdoors", "fitness"],
    circumstances: ["beginner-welcome", "solo-friendly"],
    goingCount: 21, matchScore: 0.33,
    source: { name: "Meetup", url: "https://meetup.com/ashbridges-beach-volleyball" },
    imageUrl: null,
    description: "Six lit courts, drop-ins fill the gaps at seven."
  },
  {
    id: "evt_030",
    title: "Choir for people who can't sing",
    venue: "Church of the Holy Trinity",
    startsAt: at("19:00"), endsAt: at("20:30"),
    travelMinutes: 15, travelMode: "walk",
    price: 0, currency: "CAD",
    tags: ["music"],
    circumstances: ["free", "beginner-welcome", "solo-friendly", "step-free", "no-alcohol"],
    goingCount: 30, matchScore: 0.72,
    source: { name: "Facebook", url: "https://facebook.com/groups/holytrinitychoir" },
    imageUrl: null,
    description: "No audition, no reading music. They teach by ear in four parts."
  },
  {
    id: "evt_031",
    title: "Skate session, beginners at the shallow end",
    venue: "Vanderhoof Skate Park",
    startsAt: at("17:30"), endsAt: at("19:30"),
    travelMinutes: 44, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["outdoors", "fitness"],
    circumstances: ["free", "beginner-welcome", "solo-friendly"],
    goingCount: 12, matchScore: 0.3,
    source: { name: "Instagram", url: "https://instagram.com/vanderhoofskate" },
    imageUrl: null,
    description: "Loaner boards from the shop trailer until they run out."
  },
  {
    id: "evt_032",
    title: "Documentary screening, director in the room",
    venue: "Revue Cinema, Roncesvalles",
    startsAt: at("19:15"), endsAt: at("21:45"),
    travelMinutes: 48, travelMode: "transit",
    price: 16, currency: "CAD",
    tags: ["film"],
    circumstances: ["solo-friendly", "step-free", "quiet"],
    goingCount: 45, matchScore: 0.56,
    source: { name: "Venue site", url: "https://revuecinema.ca" },
    imageUrl: null,
    description: "Ninety minutes, then twenty of questions."
  },
  {
    id: "evt_033",
    title: "Language exchange, six tables",
    venue: "Hot Docs Ted Rogers Cinema cafe",
    startsAt: at("18:00"), endsAt: at("20:00"),
    travelMinutes: 22, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["social", "language"],
    circumstances: ["free", "solo-friendly", "step-free", "beginner-welcome"],
    goingCount: 38, matchScore: 0.65,
    source: { name: "Meetup", url: "https://meetup.com/toronto-language-exchange" },
    imageUrl: null,
    description: "Twenty minutes per table, then everyone moves one seat over."
  },
  {
    id: "evt_034",
    title: "Improv jam, watch or play",
    venue: "Bad Dog Theatre, Bloor",
    startsAt: at("21:20"), endsAt: at("23:00"),
    travelMinutes: 27, travelMode: "transit",
    price: 10, currency: "CAD",
    tags: ["comedy", "social"],
    circumstances: ["solo-friendly", "beginner-welcome"],
    goingCount: 29, matchScore: 0.54,
    source: { name: "Venue site", url: "https://baddogtheatre.com" },
    imageUrl: null,
    description: "Names in a hat at nine, teams drawn at random."
  },
  {
    id: "evt_035",
    title: "Cycling club social ride, no drops",
    venue: "Sweet Pete's, Bloor and Bathurst",
    startsAt: at("18:00"), endsAt: at("20:00"),
    travelMinutes: 20, travelMode: "bike",
    price: 0, currency: "CAD",
    tags: ["outdoors", "fitness"],
    circumstances: ["free", "beginner-welcome", "solo-friendly"],
    goingCount: 23, matchScore: 0.48,
    source: { name: "Instagram", url: "https://instagram.com/sweetpetesbike" },
    imageUrl: null,
    description: "Thirty flat kilometres at a talking pace. Lights required, they will lend you one."
  },
  {
    id: "evt_036",
    title: "Pottery wheel taster, two hours",
    venue: "Clay Design Studio, Parkdale",
    startsAt: at("18:30"), endsAt: at("20:30"),
    travelMinutes: 46, travelMode: "transit",
    price: 65, currency: "CAD",
    tags: ["art", "making"],
    circumstances: ["beginner-welcome", "no-alcohol", "step-free"],
    goingCount: 8, matchScore: 0.29,
    source: { name: "Eventbrite", url: "https://eventbrite.ca/e/clay-design-taster" },
    imageUrl: null,
    description: "Two pieces fired and ready for pickup in three weeks."
  },
  {
    id: "evt_037",
    title: "Poetry open floor, sign up inside",
    venue: "Pauper's Pub, Bloor",
    startsAt: at("21:10"), endsAt: at("23:00"),
    travelMinutes: 25, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["books", "music"],
    circumstances: ["free", "solo-friendly"],
    goingCount: 14, matchScore: 0.59,
    source: { name: "Facebook", url: "https://facebook.com/groups/paupersopenfloor" },
    imageUrl: null,
    description: "Three minutes each, upstairs room, nobody claps until the end."
  },
  {
    id: "evt_038",
    title: "Table tennis at the community centre",
    venue: "Scadding Court Community Centre",
    startsAt: at("17:00"), endsAt: at("19:00"),
    travelMinutes: 7, travelMode: "walk",
    price: 2, currency: "CAD",
    tags: ["games", "fitness"],
    circumstances: ["step-free", "kid-friendly", "no-alcohol", "solo-friendly"],
    goingCount: 11, matchScore: 0.45,
    source: { name: "Venue site", url: "https://scaddingcourt.org" },
    imageUrl: null,
    description: "Four tables in the gym. Two dollars at the desk, paddles provided."
  },
  {
    id: "evt_039",
    title: "Night market, food stalls until late",
    venue: "Stackt Market, Bathurst",
    startsAt: at("17:30"), endsAt: at("22:00"),
    travelMinutes: 13, travelMode: "walk",
    price: 0, currency: "CAD",
    tags: ["food", "social", "outdoors"],
    circumstances: ["free", "kid-friendly", "step-free", "solo-friendly"],
    goingCount: 72, matchScore: 0.67,
    source: { name: "Instagram", url: "https://instagram.com/stacktmarket" },
    imageUrl: null,
    description: "Twenty vendors in the container yard, live set on the small stage at eight."
  },
  {
    id: "evt_040",
    title: "Late run, harbourfront loop, 8k",
    venue: "HTO Park",
    startsAt: at("21:45"), endsAt: at("22:45"),
    travelMinutes: 18, travelMode: "walk",
    price: 0, currency: "CAD",
    tags: ["outdoors", "fitness"],
    circumstances: ["free", "solo-friendly"],
    goingCount: 10, matchScore: 0.42,
    source: { name: "Meetup", url: "https://meetup.com/toronto-late-runners" },
    imageUrl: null,
    description: "Steady six minute kilometres along the water, back at the same spot."
  },
  {
    id: "evt_041",
    title: "Sunrise swim, lanes are quiet before seven",
    venue: "Sunnyside Gus Ryder Pool",
    startsAt: at("06:30"), endsAt: at("07:45"),
    travelMinutes: 35, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["fitness", "outdoors"],
    circumstances: ["free", "solo-friendly", "no-alcohol", "step-free"],
    goingCount: 6, matchScore: 0.31,
    source: { name: "Venue site", url: "https://toronto.ca/sunnyside-pool" },
    imageUrl: null,
    description: "Two lanes roped off for steady swimmers, two for anyone else."
  },
  {
    id: "evt_042",
    title: "Learn to row, boats and coach provided",
    venue: "Harbourfront Canoe and Kayak Centre",
    startsAt: at("07:00"), endsAt: at("09:00"),
    travelMinutes: 17, travelMode: "transit",
    price: 35, currency: "CAD",
    tags: ["outdoors", "fitness"],
    circumstances: ["beginner-welcome", "no-alcohol", "solo-friendly"],
    goingCount: 9, matchScore: 0.34,
    source: { name: "Venue site", url: "https://paddletoronto.com" },
    imageUrl: null,
    description: "Flat water before the ferries start. They put singles in doubles."
  },
  {
    id: "evt_043",
    title: "Sunday long run, 12k at a talking pace",
    venue: "Sunnyside Boardwalk",
    startsAt: at("07:30"), endsAt: at("09:00"),
    travelMinutes: 36, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["outdoors", "fitness"],
    circumstances: ["free", "solo-friendly", "beginner-welcome"],
    goingCount: 27, matchScore: 0.42,
    source: { name: "Instagram", url: "https://instagram.com/westendrunners" },
    imageUrl: null,
    description: "Out and back along the lake. Water at the halfway point."
  },
  {
    id: "evt_044",
    title: "Coffee and code, bring whatever you're stuck on",
    venue: "Balzac's Distillery District",
    startsAt: at("08:00"), endsAt: at("11:00"),
    travelMinutes: 25, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["making", "social"],
    circumstances: ["free", "solo-friendly", "quiet", "no-alcohol", "step-free"],
    goingCount: 14, matchScore: 0.46,
    source: { name: "Meetup", url: "https://meetup.com/toronto-coffee-and-code" },
    imageUrl: null,
    description: "Nobody presents anything. People sit, work, and ask for help out loud."
  },
  {
    id: "evt_045",
    title: "Yoga on the grass, pay what you can",
    venue: "Grange Park",
    startsAt: at("08:30"), endsAt: at("09:30"),
    travelMinutes: 7, travelMode: "walk",
    price: 0, currency: "CAD",
    tags: ["fitness", "outdoors"],
    circumstances: ["free", "beginner-welcome", "solo-friendly", "no-alcohol", "quiet"],
    goingCount: 31, matchScore: 0.55,
    source: { name: "Instagram", url: "https://instagram.com/grangeparkyoga" },
    imageUrl: null,
    description: "Spare mats by the tree. Cancelled if it rains, they post by eight."
  },
  {
    id: "evt_046",
    title: "Farmers market, stalls until the bread runs out",
    venue: "Wychwood Barns",
    startsAt: at("09:00"), endsAt: at("13:00"),
    travelMinutes: 31, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["food", "social", "outdoors"],
    circumstances: ["free", "kid-friendly", "step-free", "solo-friendly"],
    goingCount: 88, matchScore: 0.5,
    source: { name: "Venue site", url: "https://thestop.org/farmers-market" },
    imageUrl: null,
    description: "Thirty growers under the shed roof. Cash is faster than the card readers."
  },
  {
    id: "evt_047",
    title: "Beginner tennis, rackets to borrow",
    venue: "Ramsden Park",
    startsAt: at("09:30"), endsAt: at("11:00"),
    travelMinutes: 26, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["fitness", "outdoors"],
    circumstances: ["free", "beginner-welcome", "solo-friendly", "no-alcohol"],
    goingCount: 12, matchScore: 0.44,
    source: { name: "Meetup", url: "https://meetup.com/toronto-beginner-tennis" },
    imageUrl: null,
    description: "Four public courts, first come. Someone always has a spare racket."
  },
  {
    id: "evt_048",
    title: "Sketch crawl, one gallery then the street",
    venue: "Art Gallery of Ontario",
    startsAt: at("10:00"), endsAt: at("13:00"),
    travelMinutes: 9, travelMode: "walk",
    price: 0, currency: "CAD",
    tags: ["art", "social"],
    circumstances: ["free", "beginner-welcome", "solo-friendly", "quiet", "step-free"],
    goingCount: 18, matchScore: 0.61,
    source: { name: "Instagram", url: "https://instagram.com/tosketchcrawl" },
    imageUrl: null,
    description: "Free on Sunday mornings. Bring a pad, they have spare pencils."
  },
  {
    id: "evt_049",
    title: "Bike repair clinic, fix it yourself with help",
    venue: "Bike Sauce",
    startsAt: at("10:30"), endsAt: at("14:00"),
    travelMinutes: 27, travelMode: "bike",
    price: 0, currency: "CAD",
    tags: ["making", "outdoors"],
    circumstances: ["free", "beginner-welcome", "solo-friendly", "no-alcohol"],
    goingCount: 21, matchScore: 0.48,
    source: { name: "Venue site", url: "https://bikesauce.org" },
    imageUrl: null,
    description: "Stands, tools and a volunteer who will show you rather than do it."
  },
  {
    id: "evt_050",
    title: "Storytime and singing, under fives",
    venue: "Lillian H. Smith Library",
    startsAt: at("11:00"), endsAt: at("11:45"),
    travelMinutes: 15, travelMode: "walk",
    price: 0, currency: "CAD",
    tags: ["books", "social"],
    circumstances: ["free", "kid-friendly", "step-free", "no-alcohol", "quiet"],
    goingCount: 24, matchScore: 0.3,
    source: { name: "Venue site", url: "https://torontopubliclibrary.ca" },
    imageUrl: null,
    description: "Twenty minutes of books, then songs. Buggy parking inside the door."
  },
  {
    id: "evt_051",
    title: "Dim sum crawl, four rooms on Spadina",
    venue: "Chinatown, Spadina Avenue",
    startsAt: at("11:30"), endsAt: at("14:00"),
    travelMinutes: 7, travelMode: "walk",
    price: 30, currency: "CAD",
    tags: ["food", "social"],
    circumstances: ["solo-friendly", "step-free", "beginner-welcome"],
    goingCount: 16, matchScore: 0.57,
    source: { name: "Meetup", url: "https://meetup.com/toronto-dim-sum" },
    imageUrl: null,
    description: "Everyone throws in thirty dollars and the organiser orders."
  },
  {
    id: "evt_052",
    title: "Pickup basketball, full court",
    venue: "Dufferin Grove Park",
    startsAt: at("12:00"), endsAt: at("15:00"),
    travelMinutes: 26, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["fitness", "outdoors"],
    circumstances: ["free", "solo-friendly"],
    goingCount: 19, matchScore: 0.41,
    source: { name: "Facebook", url: "https://facebook.com/groups/dufferingrovehoops" },
    imageUrl: null,
    description: "Winners hold the court. Call your own fouls."
  },
  {
    id: "evt_053",
    title: "Shoreline cleanup, gloves and bags given out",
    venue: "Tommy Thompson Park",
    startsAt: at("12:30"), endsAt: at("15:30"),
    travelMinutes: 35, travelMode: "bike",
    price: 0, currency: "CAD",
    tags: ["outdoors", "social"],
    circumstances: ["free", "solo-friendly", "kid-friendly", "no-alcohol"],
    goingCount: 42, matchScore: 0.39,
    source: { name: "Eventbrite", url: "https://eventbrite.ca/e/leslie-spit-cleanup" },
    imageUrl: null,
    description: "Meet at the gate. Long walk in, so wear something you can move in."
  },
  {
    id: "evt_054",
    title: "Free gallery tour, forty minutes",
    venue: "Museum of Contemporary Art",
    startsAt: at("13:00"), endsAt: at("13:45"),
    travelMinutes: 28, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["art"],
    circumstances: ["free", "step-free", "quiet", "solo-friendly", "beginner-welcome"],
    goingCount: 11, matchScore: 0.52,
    source: { name: "Venue site", url: "https://moca.ca" },
    imageUrl: null,
    description: "Volunteer guide takes one floor. No booking, just turn up at the desk."
  },
  {
    id: "evt_055",
    title: "Roast and board games, long table at the back",
    venue: "The Wren, Danforth",
    startsAt: at("13:30"), endsAt: at("17:00"),
    travelMinutes: 50, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["games", "food", "social"],
    circumstances: ["solo-friendly", "step-free"],
    goingCount: 23, matchScore: 0.47,
    source: { name: "Instagram", url: "https://instagram.com/thewrento" },
    imageUrl: null,
    description: "Shelf of games by the window. You buy food if you want it, nobody checks."
  },
  {
    id: "evt_056",
    title: "Clay drop in, one pot on the wheel",
    venue: "Gardiner Museum",
    startsAt: at("14:00"), endsAt: at("16:00"),
    travelMinutes: 21, travelMode: "transit",
    price: 40, currency: "CAD",
    tags: ["art", "making"],
    circumstances: ["beginner-welcome", "step-free", "no-alcohol", "solo-friendly"],
    goingCount: 15, matchScore: 0.43,
    source: { name: "Venue site", url: "https://gardinermuseum.on.ca" },
    imageUrl: null,
    description: "Twelve wheels, two instructors. They fire it and you collect it later."
  },
  {
    id: "evt_057",
    title: "Clothing swap, bring five take five",
    venue: "The Great Hall, Queen West",
    startsAt: at("14:30"), endsAt: at("17:30"),
    travelMinutes: 16, travelMode: "walk",
    price: 0, currency: "CAD",
    tags: ["making", "social"],
    circumstances: ["free", "solo-friendly", "step-free", "no-alcohol"],
    goingCount: 64, matchScore: 0.53,
    source: { name: "Eventbrite", url: "https://eventbrite.ca/e/west-end-clothing-swap" },
    imageUrl: null,
    description: "Sorted by size on long rails. Whatever is left goes to a shelter."
  },
  {
    id: "evt_058",
    title: "Matinee, a print of something from 1974",
    venue: "Paradise Theatre, Bloor",
    startsAt: at("15:00"), endsAt: at("17:15"),
    travelMinutes: 25, travelMode: "transit",
    price: 13, currency: "CAD",
    tags: ["film"],
    circumstances: ["solo-friendly", "step-free", "quiet"],
    goingCount: 37, matchScore: 0.49,
    source: { name: "Venue site", url: "https://paradiseonbloor.com" },
    imageUrl: null,
    description: "Introduced by whoever programmed it, which takes about five minutes."
  },
  {
    id: "evt_059",
    title: "Kite flying, spares if the wind takes yours",
    venue: "Woodbine Beach",
    startsAt: at("15:30"), endsAt: at("18:00"),
    travelMinutes: 49, travelMode: "transit",
    price: 0, currency: "CAD",
    tags: ["outdoors", "social"],
    circumstances: ["free", "kid-friendly", "solo-friendly", "no-alcohol"],
    goingCount: 26, matchScore: 0.36,
    source: { name: "Facebook", url: "https://facebook.com/groups/torontokites" },
    imageUrl: null,
    description: "East end of the sand where the wind comes straight off the water."
  },
  {
    id: "evt_060",
    title: "Midnight ride, lights on, slow pace",
    venue: "Nathan Phillips Square",
    startsAt: at("23:30"), endsAt: at("23:59"),
    travelMinutes: 9, travelMode: "bike",
    price: 0, currency: "CAD",
    tags: ["outdoors", "social", "fitness"],
    circumstances: ["free", "solo-friendly", "beginner-welcome"],
    goingCount: 33, matchScore: 0.45,
    source: { name: "Instagram", url: "https://instagram.com/tomidnightride" },
    imageUrl: null,
    description: "Meet under the arches. Twenty easy kilometres through empty streets."
  }
];

/* Venue coordinates, so travel time can be recomputed when the user moves.
   The API is expected to carry lat and lng on every event; the seed set
   attaches them from this table. */
const VENUE_COORDS = {
  "Snakes & Lattes Annex": [43.6644, -79.4106],
  "Bellevue Square Park": [43.6540, -79.4022],
  "The Cameron House": [43.6486, -79.3976],
  "Artscape Youngplace": [43.6472, -79.4216],
  "Trinity Bellwoods Park": [43.6474, -79.4133],
  "The Rex Hotel": [43.6503, -79.3888],
  "Glad Day Bookshop": [43.6659, -79.3806],
  "Christie Pits Park": [43.6644, -79.4204],
  "Basecamp Climbing Bathurst": [43.6647, -79.4113],
  "Sneaky Dee's": [43.6570, -79.4045],
  "Dovercourt House": [43.6620, -79.4288],
  "Evergreen Brick Works": [43.6846, -79.3653],
  "SPIN Toronto": [43.6449, -79.3955],
  "Lula Lounge": [43.6497, -79.4358],
  "Cherry Beach Paddle Club": [43.6377, -79.3446],
  "Ryu Kitchen Studio, Bloor West": [43.6519, -79.4749],
  "The Horseshoe Tavern": [43.6487, -79.3950],
  "Stanley Park South": [43.6437, -79.4058],
  "Wychwood Barns": [43.6801, -79.4222],
  "The Only Cafe, Danforth": [43.6810, -79.3375],
  "Riverdale Park East": [43.6690, -79.3556],
  "Open Studio, Distillery District": [43.6503, -79.3592],
  "High Park, Hillside Gardens": [43.6465, -79.4637],
  "Steps Dance Studio, Ossington": [43.6520, -79.4200],
  "Burdock Music Hall": [43.6602, -79.4383],
  "Othership Adelaide": [43.6472, -79.3930],
  "Alexandra Park Community Garden": [43.6503, -79.4014],
  "401 Games, Yonge Street": [43.6620, -79.3844],
  "Ashbridges Bay": [43.6620, -79.3110],
  "Church of the Holy Trinity": [43.6544, -79.3830],
  "Vanderhoof Skate Park": [43.7100, -79.3480],
  "Revue Cinema, Roncesvalles": [43.6497, -79.4497],
  "Hot Docs Ted Rogers Cinema cafe": [43.6650, -79.4110],
  "Bad Dog Theatre, Bloor": [43.6659, -79.4159],
  "Sweet Pete's, Bloor and Bathurst": [43.6647, -79.4113],
  "Clay Design Studio, Parkdale": [43.6398, -79.4372],
  "Pauper's Pub, Bloor": [43.6653, -79.4123],
  "Scadding Court Community Centre": [43.6524, -79.4028],
  "Stackt Market, Bathurst": [43.6432, -79.4033],
  "HTO Park": [43.6380, -79.3880],
  "Sunnyside Gus Ryder Pool": [43.6383, -79.4525],
  "Harbourfront Canoe and Kayak Centre": [43.6383, -79.3866],
  "Sunnyside Boardwalk": [43.6377, -79.4560],
  "Balzac's Distillery District": [43.6503, -79.3596],
  "Grange Park": [43.6520, -79.3925],
  "Ramsden Park": [43.6760, -79.3900],
  "Art Gallery of Ontario": [43.6536, -79.3925],
  "Bike Sauce": [43.6612, -79.3452],
  "Lillian H. Smith Library": [43.6580, -79.3982],
  "Chinatown, Spadina Avenue": [43.6529, -79.3980],
  "Dufferin Grove Park": [43.6570, -79.4318],
  "Tommy Thompson Park": [43.6260, -79.3300],
  "Museum of Contemporary Art": [43.6540, -79.4390],
  "The Wren, Danforth": [43.6870, -79.3180],
  "Gardiner Museum": [43.6677, -79.3936],
  "The Great Hall, Queen West": [43.6470, -79.4100],
  "Paradise Theatre, Bloor": [43.6633, -79.4260],
  "Woodbine Beach": [43.6630, -79.3080],
  "Nathan Phillips Square": [43.6525, -79.3839]
};

export const SEED_EVENTS = RAW_EVENTS.map((e) => {
  const c = VENUE_COORDS[e.venue] || [null, null];
  return { ...e, lat: c[0], lng: c[1] };
});

export const SEED_USER = {
  origin: { lat: 43.6487, lng: -79.3959, label: "Queen & Spadina" },
  maxTravelMinutes: 45,
  freeWindows: [
    { startsAt: at("18:30"), endsAt: at("21:00") }
  ],
  interests: ["games", "outdoors", "music"],
  circumstances: ["solo-friendly", "free"]
};

export async function loadEvents() {
  if (!USE_API) return SEED_EVENTS;
  const r = await fetch(API_URL);
  if (!r.ok) throw new Error(`events ${r.status}`);
  return r.json();
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
  return label.length > 38 ? `${label.slice(0, 37).trimEnd()}\u2026` : label;
}
