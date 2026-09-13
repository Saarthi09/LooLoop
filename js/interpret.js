/* ---- interpret.js ------------------------------------------------------
   Turns however a person talks into the same filters the chip questions
   used to set. Pure functions: no DOM, no network, no key. The page can
   run this on every interim transcript without paying for anything.

   The rule the whole file is built around: being vague must never empty
   the results. Three things make that true.
     1. A phrase becomes weighted interests, not on/off tags, so "chill"
        can mean mostly wellness, a bit of art, a bit of food.
     2. Anything the lexicon cannot place stays as keywords and is scored
        against each listing's own title and description, so a word we
        have never seen still finds its event.
     3. An answer with no signal at all widens instead of filtering: the
        reading is marked broad, the interest term loses most of its
        weight in the ranking, and time, weather and travel decide.
*/

/* ---- taxonomy this file writes into ---------------------------------- */

export const INTEREST_IDS = [
  "music", "sports", "tech", "ai-ml", "career", "startups", "arts",
  "academic", "research", "social", "wellness", "outdoors", "food", "games"
];

const CIRC_IDS = [
  "free", "free-food", "student-price", "drop-in", "solo-friendly",
  "beginner-welcome", "no-alcohol", "quiet", "step-free", "transit-reachable"
];

/* ---- words in, words out ---------------------------------------------- */

const CONTRACTIONS = [
  [/[‘’ʼ]/g, "'"], [/[“”]/g, '"'],
  [/\bi'?m\b/g, "i am"], [/\bi'?ve\b/g, "i have"], [/\bi'?d\b/g, "i would"],
  [/\bcan'?t\b/g, "can not"], [/\bwon'?t\b/g, "will not"], [/\bshan'?t\b/g, "shall not"],
  [/\bdon'?t\b/g, "do not"], [/\bdoesn'?t\b/g, "does not"], [/\bdidn'?t\b/g, "did not"],
  [/\bain'?t\b/g, "is not"], [/\bisn'?t\b/g, "is not"], [/\baren'?t\b/g, "are not"],
  [/\bwasn'?t\b/g, "was not"], [/\bhaven'?t\b/g, "have not"], [/\bhasn'?t\b/g, "has not"],
  [/\bwouldn'?t\b/g, "would not"], [/\bcouldn'?t\b/g, "could not"], [/\bshouldn'?t\b/g, "should not"],
  [/n['’]t\b/g, " not"],   /* only with the apostrophe: "want" is not "wa not" */
  [/\bit'?s\b/g, "it is"], [/\bthat'?s\b/g, "that is"], [/\bthere'?s\b/g, "there is"],
  [/\bwhat'?s\b/g, "what is"], [/\bwe'?re\b/g, "we are"], [/\byou'?re\b/g, "you are"],
  [/\bi'?ll\b/g, "i will"], [/\bwanna\b/g, "want to"], [/\bgonna\b/g, "going to"],
  [/\bgotta\b/g, "got to"], [/\bkinda\b/g, "kind of"], [/\bsorta\b/g, "sort of"],
  [/\bidk\b/g, "i do not know"], [/\bdunno\b/g, "i do not know"], [/\bno idea\b/g, "i do not know"],
  [/\blowkey\b/g, "low key"], [/\bcuz\b|\bcos\b|\bcoz\b/g, "because"],
  [/\bsmth\b|\bsth\b/g, "something"], [/\bppl\b/g, "people"], [/\bbc\b/g, "because"],
  [/\btmrw\b|\btmr\b/g, "tomorrow"], [/\bsomethin\b/g, "something"], [/\bnothin\b/g, "nothing"]
];

/* Speech recognition writes these in and they mean nothing. */
const FILLER = /\b(um+|uh+|erm|hmm+|like i said|you know|i mean|basically|literally|honestly|just|really|kind of|sort of|maybe|perhaps|please|okay|ok|so yeah|yeah|yep|hey|hi|hello|find me|show me|find|search for|look for|list|give me|i want to see|what is on)\b/g;

export function normalize(s) {
  let t = ` ${String(s || "").toLowerCase()} `;
  for (const [re, to] of CONTRACTIONS) t = t.replace(re, to);
  /* commas and semicolons survive: they are where one thought ends and
     the next begins, which is how a refusal is kept to its own clause. */
  t = t.replace(/[^a-z0-9$:.,;'\- ]+/g, " ");
  t = t.replace(FILLER, " ");
  return t.replace(/\s+/g, " ").trim();
}

const NUMWORD = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  "twenty five": 25, thirty: 30, forty: 40, "forty five": 45, fifty: 50, sixty: 60,
  ninety: 90, noon: 12, midnight: 0, midday: 12
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---- the lexicon -------------------------------------------------------
   Each entry is a way of talking, not a category. `w` is how strongly the
   phrase implies each interest; a phrase is allowed to imply several
   weakly, which is the whole point. `says` is what gets read back so the
   person can hear that they were understood. */

const LEX = [
  /* --- moods, the ones that carry no category at all ------------------ */
  { id: "chill", mood: true, re: /\b(chill|chilled|chilling|relax|relaxed|relaxing|low key|mellow|calm|unwind|wind down|decompress|easy going|laid back|cosy|cozy)\b/,
    w: { wellness: .8, arts: .5, food: .45, academic: .2 }, soft: ["quiet"], says: "something low key" },
  { id: "bored", mood: true, re: /\b(bored|boring|nothing to do|nothing going on|kill time|pass the time|restless)\b/,
    w: { social: .7, games: .65, music: .55, arts: .5, food: .45, sports: .35 }, broad: true, says: "bored, open to most things" },
  { id: "stressed", mood: true, re: /\b(stressed|stress|burnt out|burned out|overwhelmed|anxious|anxiety|exhausted|drained|tired|rough week|rough day|need a break|midterms|finals|deadline)\b/,
    w: { wellness: .9, outdoors: .55, arts: .4, food: .35 }, soft: ["quiet", "drop-in"], says: "a break from the week" },
  { id: "lonely", mood: true, re: /\b(lonely|alone a lot|homesick|no friends|do not know anyone|nobody|new here|new in town|just moved|first year|frosh|exchange student)\b/,
    w: { social: 1, food: .55, games: .5, music: .35 }, soft: ["solo-friendly", "beginner-welcome"], says: "meeting people" },
  { id: "meet", mood: true, re: /\b(meet people|meet someone|make friends|new friends|socialise|socialize|be around people|people watching|with people|other people|people|mingle|networking|network)\b/,
    w: { social: 1, food: .5, games: .45, career: .3 }, soft: ["solo-friendly"], says: "meeting people" },
  { id: "energy", mood: true, re: /\b(energetic|hyped|hype|buzzing|lively|loud|wild|rowdy|big night|go out|night out|party|partying|rave|clubbing)\b/,
    w: { music: .9, social: .85, games: .35 }, says: "a proper night out" },
  { id: "productive", mood: true, re: /\b(productive|get work done|focus|focused|study|studying|learn something|be useful|improve myself|self improvement)\b/,
    w: { academic: .8, career: .55, tech: .4, research: .35 }, circs: ["quiet"], says: "something useful" },
  { id: "inspire", mood: true, re: /\b(inspired|inspiring|creative|creativity|make something|hands on|build something|craft|crafts)\b/,
    w: { arts: .8, tech: .5, startups: .4, academic: .3 }, says: "something creative" },
  { id: "date", mood: true, re: /\b(date|date night|impress|romantic|with my girlfriend|with my boyfriend|with my partner|someone special)\b/,
    w: { arts: .7, food: .65, music: .6, outdoors: .35 }, says: "something worth taking someone to" },
  { id: "family", mood: true, re: /\b(with my family|my parents|my mum|my mom|my dad|visiting me|my sister|my brother|my friend is visiting|showing.*around)\b/,
    w: { food: .6, arts: .55, outdoors: .5, social: .4 }, says: "something to bring people to" },

  /* --- the open shrug: still has to produce a ranking ------------------ */
  { id: "whatever", mood: true, re: /\b(anything|whatever|surprise me|you pick|you choose|you decide|do not care|do not mind|i do not know|not fussed|open to anything|up for anything|whatever is on|something fun|something good|something to do|somewhere to go)\b/,
    w: {}, broad: true, says: "open to anything" },

  /* --- categories, said the way people say them ------------------------ */
  { id: "music", re: /\b(music|concert|gig|band|bands|live music|dj|singing|sing|choir|orchestra|jazz|rock|hip hop|rap|edm|open mic|karaoke|album|festival)\b/,
    w: { music: 1, arts: .45, social: .35 }, says: "music" },
  { id: "sports", re: /\b(sport|sports|game night|match|pickup|pick up game|basketball|soccer|football|hockey|volleyball|badminton|tennis|swim|swimming|run|running|jog|gym|workout|work out|lift|climbing|yoga|active|move my body|sweat|fitness|intramural)\b/,
    w: { sports: 1, wellness: .6, outdoors: .45, social: .3 }, says: "something active" },
  { id: "tech", re: /\b(tech|technology|code|coding|program|programming|software|dev|developer|engineering|hack|hackathon|build a project|computer|cs|robotics|hardware|cyber|security)\b/,
    w: { tech: 1, "ai-ml": .55, startups: .45, academic: .35 }, says: "tech" },
  { id: "ai", re: /\b(ai|a\.i\.|artificial intelligence|machine learning|ml|llm|llms|neural|data science|deep learning|models)\b/,
    w: { "ai-ml": 1, tech: .8, research: .5 }, says: "ai and ml" },
  { id: "career", re: /\b(career|job|jobs|internship|intern|co op|coop|resume|cv|recruiter|recruiting|hiring|employer|interview|linkedin|professional|work experience|job fair)\b/,
    w: { career: 1, startups: .4, social: .3 }, says: "career things" },
  { id: "startup", re: /\b(startup|startups|founder|founders|entrepreneur|entrepreneurship|pitch|venture|vc|business|side project|demo day|velocity)\b/,
    w: { startups: 1, career: .55, tech: .5 }, says: "startups" },
  { id: "arts", re: /\b(art|arts|artsy|gallery|exhibit|exhibition|museum|film|films|movie|movies|cinema|screening|theatre|theater|stage play|dance|poetry|photography|design|drawing|painting|culture|cultural)\b/,
    w: { arts: 1, music: .4, academic: .25 }, says: "arts and film" },
  { id: "academic", re: /\b(talk|talks|academic|lecture|lectures|seminar|workshop|class|classes|panel|speaker|learn|teaching|course|tutorial|info session|discussion)\b/,
    w: { academic: 1, research: .55, career: .3, tech: .25 }, says: "talks and classes" },
  { id: "research", re: /\b(research|thesis|defence|defense|phd|grad school|graduate|research lab|academic paper|conference|symposium|poster session)\b/,
    w: { research: 1, academic: .8, "ai-ml": .3 }, says: "research" },
  { id: "outdoors", re: /\b(outside|outdoors|outdoor|fresh air|nature|park|trail|hike|hiking|go for a walk|nature walk|garden|lake|river|sunshine|sunny|weather is nice|get out of my room|get out of the house)\b/,
    w: { outdoors: 1, wellness: .55, sports: .4, social: .25 }, says: "being outside" },
  { id: "food", re: /\b(food|eat|eats|eating|hungry|starving|dinner|lunch|breakfast|brunch|snack|snacks|pizza|coffee|cafe|bakery|bake|bbq|barbecue|restaurant|market|tasting|potluck|feed me)\b/,
    w: { food: 1, social: .55 }, says: "food" },
  { id: "games", re: /\b(game|games|board game|board games|video game|video games|trivia|quiz|chess|cards|poker|dnd|d and d|arcade|esports|puzzle|escape room|bingo)\b/,
    w: { games: 1, social: .7 }, says: "games" },
  { id: "wellness", re: /\b(wellness|wellbeing|well being|mental health|meditate|meditation|mindfulness|therapy|self care|sleep|breathe|stretch|massage|spa|sauna)\b/,
    w: { wellness: 1, outdoors: .35, social: .2 }, says: "wellness" },
  { id: "volunteer", re: /\b(volunteer|volunteering|give back|charity|community|help out|fundraiser|sustainability|climate|environment)\b/,
    w: { social: .7, outdoors: .5, academic: .35, career: .3 }, says: "community things" },
  { id: "faith", re: /\b(church|mosque|temple|synagogue|prayer|faith|worship|bible|religious|spiritual)\b/,
    w: { social: .6, academic: .3, wellness: .3 }, says: "a faith gathering" },

  /* --- the shape of the room ------------------------------------------- */
  { id: "quiet", mood: true, re: /\b(quiet|not loud|no crowds|not a huge crowd|not a big crowd|not too loud|not too crowded|not too busy|not crowded|not into crowds|not a lot of people|huge crowd|big crowd|crowds|packed|intimate|introvert|introverted|too many people|crowded|overstimulat|peaceful|silent)\b/,
    w: { academic: .3, arts: .3, wellness: .4 }, circs: ["quiet"], says: "quiet" },
  { id: "solo", mood: true, re: /\b(on my own|by myself|alone|solo|going alone|no one to go with|nobody to go with|myself)\b/,
    w: {}, circs: ["solo-friendly"], says: "going on your own" },
  { id: "beginner", mood: true, re: /\b(beginner|beginners|never done|no experience|first time|new to this|do not know how|learn from scratch|total novice|noob)\b/,
    w: {}, circs: ["beginner-welcome"], says: "no experience needed" },
  { id: "sober", mood: true, re: /\b(sober|do not drink|no alcohol|no drinking|no booze|dry|alcohol free|under age|underage|nineteen)\b/,
    w: {}, circs: ["no-alcohol"], says: "nothing built on drinking", saysNo: "drinking is fine" },
  { id: "access", mood: true, re: /\b(wheelchair|step free|no stairs|accessible|accessibility|mobility|crutches|bad knee|cannot stand long)\b/,
    w: {}, circs: ["step-free"], says: "step free" },
  { id: "dropin", mood: true, re: /\b(drop in|walk in|just show up|turn up|no signup|no sign up|no registration|do not want to register|no tickets|last minute|spontaneous|right now)\b/,
    w: {}, circs: ["drop-in"], says: "no signup" },
  { id: "freefood", re: /\b(free food|free pizza|free lunch|free dinner|free snacks|food provided|feed me|they feed you|catered)\b/,
    w: { food: .8, social: .4 }, circs: ["free-food"], says: "free food" },
  { id: "studentprice", mood: true, re: /\b(student price|student rate|student discount|watcard|with my student card|student tickets)\b/,
    w: {}, circs: ["student-price"], says: "student price" },
  { id: "indoors", mood: true, re: /\b(indoors|inside|raining|rainy|wet|cold out|too cold|snowing|do not want to be outside)\b/,
    w: {}, setting: "indoor", says: "indoors" }
];

/* Phrases that look like a refusal but are really an answer. They are
   masked before the negation pass so "no money" does not read as "not
   into money". */
const PROTECTED = [
  /\bno money\b/g, /\bno cash\b/g, /\bno budget\b/g, /\bno signup\b/g, /\bno sign up\b/g,
  /\bno registration\b/g, /\bno experience\b/g, /\bno alcohol\b/g, /\bno drinking\b/g,
  /\bno booze\b/g, /\bno stairs\b/g, /\bno crowds\b/g, /\bno idea\b/g, /\bno plans\b/g,
  /\bno car\b/g, /\bno friends\b/g, /\bnot loud\b/g, /\bnot far\b/g, /\bnothing to do\b/g,
  /\bnothing going on\b/g, /\bno one to go with\b/g, /\bnobody to go with\b/g,
  /\bno tickets\b/g, /\bfree food\b/g, /\bnot a (?:huge|big) crowd\b/g,
  /\bnot too (?:loud|crowded|busy|big|many people)\b/g, /\bnot crowded\b/g,
  /\bnot into crowds\b/g, /\bnot a lot of people\b/g, /\bnot many people\b/g, /\bdo not care\b/g, /\bdo not mind\b/g,
  /\bdo not know anyone\b/g, /\bi do not know\b/g, /\bdo not drink\b/g,
  /\bdo not want to be outside\b/g, /\bnot fussed\b/g, /\bno experience needed\b/g
];

const NEGATOR = /\b(not|no|never|hate|hates|hating|avoid|avoiding|rather not|without|skip|except|anything but|sick of|tired of|bored of|over it|do not like|do not want|cannot stand)\b/;

/* ---- budget ----------------------------------------------------------- */

function readBudget(t) {
  if (/\b(free|costs nothing|zero dollars|no money|no cash|broke|skint|poor|cannot afford|can not afford|no budget|do not want to pay|without paying|nothing at all)\b/.test(t))
    return { budget: "free", says: "free only" };
  if (/\b(money is no|money is not an issue|does not matter what it costs|any price|whatever it costs|splurge|treat myself|price does not matter|i can afford)\b/.test(t))
    return { budget: "any", says: "price is open" };

  const m = /\$\s*(\d+)|(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty)\s*(?:dollars|bucks|quid)|\b(?:under|below|less than|up to|max|maximum|around|about|like)\s+\$?\s*(one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|twenty five|thirty|forty|fifty|\d+)\b/.exec(t);
  if (m) {
    const said = m[1] ?? m[2] ?? m[3];
    const n = Number(NUMWORD[said] ?? said);
    if (Number.isFinite(n)) {
      if (n <= 0) return { budget: "free", says: "free only" };
      if (n < 10) return { budget: "cheap", says: `up to about $${n}` };
      if (n < 25) return { budget: "moderate", says: `up to about $${n}` };
      return { budget: "any", says: `up to about $${n}` };
    }
  }
  if (/\b(cheap|cheapish|a few bucks|couple of bucks|coffee money|not expensive|inexpensive|affordable|on a budget|student budget|tight)\b/.test(t))
    return { budget: "cheap", says: "cheap" };
  if (/\b(can spend a bit|some money|a bit of money|reasonable|mid range|moderate)\b/.test(t))
    return { budget: "moderate", says: "a bit of money" };
  return null;
}

/* ---- time ------------------------------------------------------------- */

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const MONTHS = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sept: 8, sep: 8, october: 9, oct: 9, november: 10, nov: 10,
  december: 11, dec: 11
};
const MONTH_RE = Object.keys(MONTHS).join("|");

/* "18th of september", "september 18", "on the 18th". A day with no month
   is the next one to come; a month with no year is the next one to come. */
function readCalendarDate(t, today) {
  const base = new Date(`${today}T12:00:00`);
  const named = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\b|\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(t);
  if (named) {
    const day = Number(named[1] ?? named[4]);
    const month = MONTHS[named[2] ?? named[3]];
    if (day >= 1 && day <= 31) {
      let year = base.getFullYear();
      let d = new Date(year, month, day, 12);
      if (d < base) d = new Date(year + 1, month, day, 12);
      if (d.getDate() === day) return dayString(d);
    }
  }
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const bare = /\bon the (\d{1,2})(?:st|nd|rd|th)\b/.exec(t);
  if (bare) {
    const day = Number(bare[1]);
    if (day >= 1 && day <= 31) {
      let d = new Date(base.getFullYear(), base.getMonth(), day, 12);
      if (d < base) d = new Date(base.getFullYear(), base.getMonth() + 1, day, 12);
      if (d.getDate() === day) return dayString(d);
    }
  }
  return null;
}

/* Where they want to be, not where they are standing. Speech recognition
   capitalises a place name, which is the surest signal there is; a typed
   lower-case one is taken too, but only after a preposition that can only
   mean a place. */
const NOT_A_PLACE = new RegExp(`^(?:the|a|an|my|our|this|that|here|there|home|town|${MONTH_RE}|${DAYS.join("|")}|morning|afternoon|evening|night|tonight|today|tomorrow|weekend|mood|person|people|general|fact|time|minutes?|hours?)$`, "i");

function readPlace(raw, t) {
  const capital = /\b(?:in|near|around|close to|over in|out in)\s+([A-Z][a-zA-Z.'-]+(?:\s+(?:of|de|los|las|el)?\s*[A-Z][a-zA-Z.'-]+){0,2})/.exec(String(raw || ""));
  if (capital) {
    const name = capital[1].trim();
    if (!NOT_A_PLACE.test(name.split(" ")[0])) return { place: name, sure: true };
  }
  const lower = /\b(?:in|near|around|close to|over in|out in)\s+([a-z][a-z.'-]+(?:\s+[a-z.'-]+){0,2})\b/.exec(t);
  if (lower) {
    const name = lower[1].trim().replace(/\s+(?:on|at|from|for|this|next|tonight|today|tomorrow).*$/, "");
    const head = name.split(" ")[0];
    if (head.length > 2 && !NOT_A_PLACE.test(head) && !STOP.has(head)) return { place: name, sure: false };
  }
  return null;
}

const pad = (n) => String(n).padStart(2, "0");
const dayString = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dayString(d);
};

/* An hour said out loud, turned into a 24h number using the half of the
   day a student actually means: "at 8" in an evening sentence is 20:00. */
function hourFrom(raw, hintPm) {
  let h = Number(raw);
  if (!Number.isFinite(h)) return null;
  if (h > 24) return null;
  if (h === 24) return 24;
  if (hintPm === true && h < 12) h += 12;
  /* "after seven" is not seven in the morning; say "am" and you get it */
  if (hintPm == null && h >= 1 && h <= 10) h += 12;
  return clamp(h, 0, 24);
}

function readTime(t, c) {
  const today = c.today;
  const out = {};
  const said = [];

  /* which day */
  const onDate = readCalendarDate(t, today);
  if (onDate) { out.date = onDate; said.push(new Date(`${onDate}T12:00:00`).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })); }
  else if (/\btomorrow\b/.test(t)) { out.date = shift(today, 1); said.push("tomorrow"); }
  else if (/\bday after tomorrow\b/.test(t)) { out.date = shift(today, 2); said.push("in two days"); }
  else if (/\btonight|this evening|later today|today|right now|now\b/.test(t)) { out.date = today; }
  else if (/\b(this |next )?weekend\b/.test(t)) {
    const d = new Date(`${today}T12:00:00`);
    const add = (6 - d.getDay() + 7) % 7 || 7;
    out.date = shift(today, add); said.push("the weekend");
  } else {
    for (let i = 0; i < DAYS.length; i++) {
      if (new RegExp(`\\b${DAYS[i]}\\b`).test(t)) {
        const d = new Date(`${today}T12:00:00`);
        const add = (i - d.getDay() + 7) % 7 || 7;
        out.date = shift(today, add);
        said.push(DAYS[i]);
        break;
      }
    }
  }

  /* which hours */
  /* "am" and "pm" only count stuck to a number: "i am broke" is not dawn. */
  const pmHint = /\b(tonight|evening|night|after work|after class|after dinner)\b/.test(t) || /\d\s*(?:pm|p\.m\.)/.test(t) ? true
    : /\b(morning|before noon|breakfast|sunrise)\b/.test(t) || /\d\s*(?:am|a\.m\.)/.test(t) ? false : null;

  const range = /\b(?:from|between)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:am|pm)?\s*(?:to|till|til|until|and|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(t);
  const after = /\b(?:after|from|starting at|past|anytime after|once it is)\s+(?:my |the |our )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(t);
  const before = /\b(?:before|by|until|till|til|ends? by|home by|back by)\s+(?:my |the |our |class at )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(t);

  if (range) {
    const a = hourFrom(range[1], range[5] === "pm" ? true : range[5] === "am" ? false : pmHint);
    let b = hourFrom(range[3], range[5] === "pm" ? true : range[5] === "am" ? false : pmHint);
    if (a != null && b != null) {
      if (b <= a) b = Math.min(24, b + 12);
      out.windowStart = a + (Number(range[2] || 0) / 60);
      out.windowEnd = b + (Number(range[4] || 0) / 60);
      said.push(`${clock(out.windowStart)} to ${clock(out.windowEnd)}`);
    }
  } else if (after) {
    const a = hourFrom(after[1], after[3] === "pm" ? true : after[3] === "am" ? false : pmHint);
    if (a != null) {
      out.windowStart = a + (Number(after[2] || 0) / 60);
      out.windowEnd = Math.min(24, Math.max(out.windowStart + 3, c.windowEnd ?? 0));
      said.push(`after ${clock(out.windowStart)}`);
    }
  } else if (before) {
    const b = hourFrom(before[1], before[3] === "pm" ? true : before[3] === "am" ? false : pmHint);
    if (b != null) {
      out.windowEnd = b + (Number(before[2] || 0) / 60);
      out.windowStart = Math.max(0, Math.min(c.windowStart ?? 0, out.windowEnd - 3));
      said.push(`done by ${clock(out.windowEnd)}`);
    }
  }

  /* "six onwards", "from 6pm", "7 til late" */
  const onwards = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:onwards?|or later|and later|or after|and after|till late|til late|until late|and on)\b/.exec(t);
  if (out.windowStart == null && onwards) {
    const a = hourFrom(onwards[1], onwards[3] === "pm" ? true : onwards[3] === "am" ? false : pmHint);
    if (a != null) {
      out.windowStart = a + (Number(onwards[2] || 0) / 60);
      out.windowEnd = 23.5;
      said.push(`${clock(out.windowStart)} onwards`);
    }
  }

  /* a lone clock time with no preposition is where the evening starts */
  if (out.windowStart == null) {
    const lone = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(t);
    if (lone) {
      const a = hourFrom(lone[1], lone[3] === "pm" ? true : false);
      if (a != null) {
        out.windowStart = a + (Number(lone[2] || 0) / 60);
        out.windowEnd = Math.min(23.5, out.windowStart + 4);
        said.push(`from ${clock(out.windowStart)}`);
      }
    }
  }

  if (out.windowStart == null) {
    if (/\b(right now|straight away|immediately|in the next hour|soon as possible|asap|next hour)\b/.test(t)) {
      out.windowStart = c.now; out.windowEnd = Math.min(24, c.now + 2.5); said.push("starting now");
    /* "night" alone is usually a noun: a games night, a date night, a quiz
       night. Only the phrasings that can only mean a time count here. */
    } else if (/\b(tonight|this evening|after dinner|tomorrow night|at night|later tonight)\b/.test(t)) { out.windowStart = 18; out.windowEnd = 23; said.push("in the evening"); }
    else if (/\blate|after ten|late night|nightcap\b/.test(t)) { out.windowStart = 21; out.windowEnd = 24; said.push("late"); }
    else if (/\bafter work|after class|after school|once i finish|end of the day\b/.test(t)) { out.windowStart = 17; out.windowEnd = 22; said.push("after work"); }
    else if (/\bafternoon\b/.test(t)) { out.windowStart = 12; out.windowEnd = 17; said.push("this afternoon"); }
    else if (/\blunch|lunchtime|midday|noon\b/.test(t)) { out.windowStart = 11.5; out.windowEnd = 14; said.push("around lunch"); }
    else if (/\bmorning|early|before class|breakfast|sunrise\b/.test(t)) { out.windowStart = 7; out.windowEnd = 12; said.push("in the morning"); }
    else if (/\ball day|any time|anytime|whenever|flexible|free all day|no plans\b/.test(t)) { out.windowStart = 8; out.windowEnd = 23.5; said.push("any time"); }
  }

  /* "for an hour", "a couple of hours" trims the far end */
  const dur = /\b(?:for|got|have|only got|only have|about)\s+(?:like\s+|about\s+|around\s+|maybe\s+)?(an hour|half an hour|a couple of hours|a few hours|\d+)\s*(hours?|hrs?|minutes?|mins?)?\b/.exec(t);
  if (dur && out.windowStart == null) { out.windowStart = c.now; said.push("starting now"); }
  if (dur && out.windowStart != null) {
    const word = dur[1];
    const hours = word === "an hour" ? 1 : word === "half an hour" ? .5
      : word === "a couple of hours" ? 2 : word === "a few hours" ? 3
        : /min/.test(dur[2] || "") ? Number(word) / 60 : Number(word);
    if (Number.isFinite(hours) && hours > 0 && hours < 12) {
      out.windowEnd = Math.min(24, out.windowStart + hours);
      said.push(`about ${word.replace(/^a /, "")}`);
    }
  }

  if (!said.length && out.date == null) return null;
  return { ...out, says: said.join(", ") };
}

export function clock(h) {
  const hh = Math.floor(h) % 24, mm = Math.round((h - Math.floor(h)) * 60);
  const ampm = hh >= 12 ? "pm" : "am";
  const twelve = hh % 12 === 0 ? 12 : hh % 12;
  return mm ? `${twelve}:${pad(mm)}${ampm}` : `${twelve}${ampm}`;
}

/* ---- how far, and how ------------------------------------------------- */

function readRange(t) {
  const out = {}; const said = [];

  if (/\b(walking distance|on foot|walk there|round the corner|next door|very close|really close|nearby|near me|close by|on campus|near campus|around campus|close to campus|in residence|do not want to travel|do not want to go far|not far|stay local|around here)\b/.test(t)) {
    out.range = "r15"; out.maxTravel = 15; said.push("close by");
  } else if (/\b(anywhere|do not mind travelling|do not mind traveling|happy to travel|far is fine|will go anywhere|out of town|road trip)\b/.test(t)) {
    out.range = "r90"; out.maxTravel = 90; said.push("anywhere");
  } else {
    const m = /\b(?:within|under|less than|no more than|about|max|maximum)?\s*(\d{1,3}|fifteen|twenty|thirty|forty five|forty|sixty|ninety)\s*(?:minute|minutes|min|mins)\b/.exec(t);
    if (m && /\b(away|travel|trip|ride|drive|walk|bus|from here|of here|radius|within|max)\b/.test(t)) {
      const n = Number(NUMWORD[m[1]] ?? m[1]);
      if (Number.isFinite(n)) {
        const pick = [15, 30, 45, 60, 90].reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
        out.range = `r${pick}`; out.maxTravel = pick; said.push(`within ${pick} minutes`);
      }
    } else if (/\bhour\b/.test(t) && /\b(within|under|less than|no more than|up to)\b/.test(t)) {
      out.range = "r60"; out.maxTravel = 60; said.push("within an hour");
    }
  }

  if (/\b(i have a car|i can drive|driving|by car|my car|park there)\b/.test(t)) { out.mode = "drive"; said.push("driving"); }
  else if (/\b(bus|transit|ion|lrt|grt|no car|do not have a car|public transport)\b/.test(t)) { out.mode = "transit"; out.soft = ["transit-reachable"]; said.push("on the bus"); }
  else if (/\b(bike|biking|cycle|cycling|my bike|scooter)\b/.test(t)) { out.mode = "bike"; said.push("by bike"); }
  else if (/\b(train|go train|via rail)\b/.test(t)) { out.mode = "train"; said.push("by train"); }
  else if (/\b(walk|walking|on foot)\b/.test(t)) { out.mode = "walk"; said.push("walking"); }

  return said.length ? { ...out, says: said.join(", ") } : null;
}

/* ---- keywords the lexicon never claimed -------------------------------- */

const STOP = new Set(`a an the and or but if then than that this these those there here is am are was were be been being do does did doing done have has had having i me my mine we us our you your it its they them their he she his her to of in on at for with from by about into over after before under again further once all any both each few more most other some such only own same so too very can will would should could may might must shall want wanna need go going get got getting give take make made let go really pretty quite something anything nothing someone anyone thing things stuff up down out off now today tonight tomorrow day days night nights time times hour hours minute minutes place places around near far good nice cool fun new old big small great best better feel feeling like likes liked love loves loved know think guess maybe sure yes no not ok okay well also because since while when where what which who how why im its dont cant wont looking look find help please thanks thank hi hello hey yeah yep nah surprise instead hate love prefer rather bit lot lots much many still yet even ever never always sometimes somewhere anywhere everywhere else another next last own free cheap expensive money cash broke budget spend dollars bucks price cost afternoon evening morning weekend weekday campus distance walk walking bus car drive driving minutes hour hours quiet loud crowd crowds people friends alone solo lab class room mind thing body head life week day night mood plans idea sure event events onwards st nd rd th`.split(/\s+/));

function keywordsFrom(residual) {
  const seen = new Set();
  const out = [];
  for (const w of residual.split(/[^a-z0-9]+/)) {
    if (w.length < 3 || STOP.has(w) || seen.has(w)) continue;
    if (/\d/.test(w) || MONTHS[w] !== undefined || DAYS.includes(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= 12) break;
  }
  return out;
}

const stem = (w) => w.replace(/(ies)$/, "y").replace(/(sses|ches|shes|xes)$/, (m) => m.slice(0, -2))
  .replace(/(ing|ed|es|s)$/, "");

/* How much a listing's own words answer what was said. This is what lets
   "anything with dogs in it" work without dogs being in the taxonomy. */
export function textScore(event, keywords) {
  if (!keywords || !keywords.length) return 0;
  const hay = ` ${[event.title, event.description, event.venue, (event.tags || []).join(" ")].join(" ").toLowerCase()} `;
  let hits = 0;
  for (const k of keywords) {
    if (!/^[a-z0-9]+$/.test(k)) continue;
    const s = stem(k);
    if (new RegExp(`\\b${s.length >= 3 ? s : k}\\b`).test(hay)) hits += 1;
    else if (s.length >= 4 && new RegExp(`\\b${s}`).test(hay)) hits += 0.7;
  }
  if (!hits) return 0;
  return clamp(1 - Math.pow(0.45, hits), 0, 1);
}

/* ---- the reading ------------------------------------------------------- */

export function emptyReading() {
  return {
    heard: "", weights: {}, vetoes: {}, circumstances: [], prefers: [], keywords: [], avoid: [],
    place: null, placeSure: false,
    budget: null, date: null, windowStart: null, windowEnd: null,
    range: null, maxTravel: null, mode: null, setting: null,
    said: [], filled: [], broad: false, confidence: 0
  };
}

/* Several weak signals should add up without ever passing 1. */
const noisyOr = (a, b) => 1 - (1 - a) * (1 - b);

const TIME_PRIOR = (h) =>
  h < 11 ? { wellness: .55, sports: .5, food: .5, outdoors: .45 }
    : h < 16 ? { academic: .5, food: .5, social: .45, tech: .4, career: .35 }
      : h < 21 ? { social: .55, music: .5, food: .5, arts: .45, games: .4 }
        : { social: .5, music: .5, games: .45, arts: .4 };

/* transcript in, filters out. ctx: { today, now, windowStart, windowEnd } */
export function interpret(transcript, ctx = {}) {
  const c = { today: dayString(new Date()), now: new Date().getHours(), ...ctx };
  const r = emptyReading();
  r.heard = String(transcript || "").trim();
  const t = normalize(transcript);
  if (!t) {
    r.broad = true;
    for (const [id, v] of Object.entries(TIME_PRIOR(c.windowStart ?? c.now ?? 19))) r.weights[id] = v;
    r.said.push("open to anything");
    return r;
  }

  /* the slots that are never a refusal */
  /* "free food" is a thing on offer, not a ceiling on spending */
  const money = readBudget(t.replace(/\bfree (food|pizza|lunch|dinner|breakfast|snacks|drinks|coffee|popcorn)\b/g, " $1 "));
  if (money) { r.budget = money.budget; r.said.push(money.says); r.filled.push("budget"); }

  const when = readTime(t, c);
  if (when) {
    if (when.date) r.date = when.date;
    if (when.windowStart != null) r.windowStart = when.windowStart;
    if (when.windowEnd != null) r.windowEnd = when.windowEnd;
    if (when.says) r.said.push(when.says);
    r.filled.push("time");
  }

  const where = readPlace(transcript, t);
  if (where) {
    r.place = where.place;
    r.placeSure = where.sure;
    r.said.push(`${where.sure ? "in" : "around"} ${where.place}`);
    r.filled.push("place");
  }

  const far = readRange(t);
  if (far) {
    if (far.range) { r.range = far.range; r.maxTravel = far.maxTravel; }
    if (far.mode) r.mode = far.mode;
    if (far.soft) r.prefers.push(...far.soft);
    r.said.push(far.says);
    r.filled.push("range");
  }

  /* interests, clause by clause, so a refusal only bites its own clause.
     "no money" and "i do not know" are answers, not refusals, so each one
     is swapped for a token before the clause is tested for a negator and
     put back before the clause is read. */
  const kept = [];
  let masked = t;
  for (const re of PROTECTED) masked = masked.replace(re, (m) => { kept.push(m); return ` zzp${kept.length - 1}zz `; });
  const unmask = (v) => v.replace(/zzp(\d+)zz/g, (_, i) => kept[Number(i)] ?? " ");
  const clauses = masked.split(/\s*(?:,|;|\band\b|\bbut\b|\balso\b|\bthough\b|\bexcept\b|\bplus\b)\s*/);

  let residual = t;
  let refused = "";
  for (const clause0 of clauses) {
    const clause = unmask(clause0);
    if (!clause.trim()) continue;
    const no = NEGATOR.test(clause0);
    if (no) { refused += ` ${clause}`; residual = residual.replace(clause, " "); }
    for (const entry of LEX) {
      if (!entry.re.test(clause)) continue;
      residual = residual.replace(entry.re, " ");
      if (no) {
        /* "i hate sports" rules out sport, not everything sport is near */
        for (const [id, v] of Object.entries(entry.w)) {
          if (v < 0.7) continue;
          r.vetoes[id] = Math.max(r.vetoes[id] || 0, v);
        }
        r.said.push(entry.saysNo || `not ${entry.says}`);
        continue;
      }
      for (const [id, v] of Object.entries(entry.w)) r.weights[id] = noisyOr(r.weights[id] || 0, v);
      /* the words of a named subject also go looking through the listings
         themselves, so "ai" finds the ai talk and not only the ai tag */
      if (!entry.mood) {
        const hit = entry.re.exec(clause);
        if (hit && /^[a-z][a-z ]{1,20}$/.test(hit[0])) r.keywords.push(...hit[0].split(" "));
      }
      if (entry.circs) r.circumstances.push(...entry.circs);
      if (entry.soft) r.prefers.push(...entry.soft);
      if (entry.setting) r.setting = entry.setting;
      if (entry.broad) r.broad = true;
      if (entry.says) r.said.push(entry.says);
    }
  }

  /* a vetoed interest must not also be wanted */
  for (const id of Object.keys(r.vetoes)) {
    if (r.weights[id]) r.weights[id] = Math.max(0, r.weights[id] - r.vetoes[id]);
    if (!r.weights[id]) delete r.weights[id];
  }

  /* Only a stated requirement filters. A mood ("chill", "stressed") is a
     preference: it moves things up the order, it never rules them out. */
  r.circumstances = [...new Set(r.circumstances)].filter((c2) => CIRC_IDS.includes(c2));
  r.prefers = [...new Set(r.prefers)].filter((c2) => CIRC_IDS.includes(c2) && !r.circumstances.includes(c2));

  if (r.place) residual = residual.replace(new RegExp(r.place.toLowerCase().replace(/[^a-z ]/g, ""), "g"), " ");
  r.keywords = keywordsFrom(residual);
  r.avoid = keywordsFrom(refused).filter((w) => !r.keywords.includes(w));
  if (Object.keys(r.weights).length || r.keywords.length) r.filled.push("interests");

  /* nothing landed: widen, never empty. The hour of the day is a better
     guess than no guess, and the ranking is told to lean on time, travel
     and weather instead of on this. */
  if (!Object.keys(r.weights).length) {
    r.broad = true;
    const prior = TIME_PRIOR(c.windowStart ?? c.now ?? 19);
    for (const [id, v] of Object.entries(prior)) r.weights[id] = v;
    if (r.keywords.length) r.said.push(`anything about ${r.keywords.slice(0, 2).join(" or ")}`);
    else if (!r.said.length) r.said.push("open to anything");
  }

  const strength = Math.max(0, ...Object.values(r.weights));
  /* "anything outdoors" names a thing; the shrug word does not make it vague */
  if (strength >= 0.8) r.broad = false;
  r.confidence = clamp(
    (r.broad ? 0.25 : 0.45 * strength) + 0.12 * r.filled.length + 0.05 * Math.min(3, r.keywords.length),
    0.1, 0.98
  );
  r.said = [...new Set(r.said)];
  return r;
}

/* Later turns add to earlier ones; a slot said again wins. */
export function mergeReading(prev, next) {
  const out = { ...prev };
  out.heard = [prev.heard, next.heard].filter(Boolean).join(" ");
  out.weights = { ...prev.weights };
  /* a broad opening should not outvote a later specific answer */
  if (prev.broad && !next.broad) out.weights = {};
  for (const [id, v] of Object.entries(next.weights)) out.weights[id] = noisyOr(out.weights[id] || 0, v);
  out.vetoes = { ...prev.vetoes };
  for (const [id, v] of Object.entries(next.vetoes)) {
    out.vetoes[id] = Math.max(out.vetoes[id] || 0, v);
    if (out.weights[id]) { out.weights[id] = Math.max(0, out.weights[id] - v); if (!out.weights[id]) delete out.weights[id]; }
  }
  out.circumstances = [...new Set([...prev.circumstances, ...next.circumstances])];
  out.prefers = [...new Set([...prev.prefers, ...next.prefers])].filter((c) => !out.circumstances.includes(c));
  out.keywords = [...new Set([...prev.keywords, ...next.keywords])].slice(0, 16);
  out.avoid = [...new Set([...prev.avoid, ...next.avoid])].filter((w) => !out.keywords.includes(w));
  for (const k of ["budget", "date", "windowStart", "windowEnd", "range", "maxTravel", "mode", "setting", "place", "placeSure"]) {
    if (next[k] != null) out[k] = next[k];
  }
  out.said = [...new Set([...prev.said, ...next.said])];
  out.filled = [...new Set([...prev.filled, ...next.filled])];
  out.broad = !Object.values(out.weights).some((v) => v >= 0.8) && (prev.broad || next.broad);
  out.confidence = clamp(Math.max(prev.confidence, next.confidence) + 0.08 * next.filled.length, 0.1, 0.98);
  return out;
}

/* ---- what to ask next --------------------------------------------------
   Not six questions. One open one, then only what is still missing and
   worth asking, and never more than two. Everything has a default, so
   "skip" is always a complete answer. */

const FOLLOWUPS = [
  { slot: "time", q: "When are you free?", hint: "Tonight, tomorrow, right now, whenever." },
  { slot: "budget", q: "What can you spend?", hint: "Nothing is a normal answer." },
  { slot: "range", q: "How far will you go?", hint: "Walking distance, a bus ride, anywhere." },
  { slot: "place", q: "Where are you starting from?", hint: "A street, a city, or \u201cuse my location\u201d." }
];

export function nextQuestion(reading, asked = []) {
  if (asked.length >= 2) return null;
  for (const f of FOLLOWUPS) {
    if (reading.filled.includes(f.slot)) continue;
    if (asked.includes(f.slot)) continue;
    return f;
  }
  return null;
}

/* ---- read it back ------------------------------------------------------ */

export function summarize(reading, count) {
  const bits = reading.said.slice(0, 4);
  const what = bits.length ? bits.join(", ") : "whatever is on";
  const n = count == null ? "" : count === 0
    ? " Nothing quite fits, so here is the closest."
    : count === 1 ? " One thing fits." : ` ${count} things fit.`;
  return `${what.charAt(0).toUpperCase()}${what.slice(1)}.${n}`;
}
