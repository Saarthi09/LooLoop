# LooLoop

LooLoop helps new university students discover nearby events and meet people
who want to attend the same things.

Students can describe what they want by voice, answer a short questionnaire,
or browse everything. LooLoop combines campus and public event sources, ranks
the results around the student's circumstances, and lets signed-in students
join an event circle.

## Features

- Browser speech-to-text with no uploaded audio or AI transcription delay
- Local interpretation of interests, time, budget, travel distance, and place
- Manual questionnaire and skip-to-results option
- Event data from Ticketmaster, University of Waterloo, and WUSA
- Location-aware travel estimates and event filtering
- Radial event visualization and event cards
- Username/password authentication through Supabase Auth
- Persistent event circles shared between users
- Optional Instagram handles for circle members
- Optional Gemini ranking for the legacy recommendation endpoint

## How voice works

The voice experience runs through the browser:

```text
Microphone
    -> browser SpeechRecognition
    -> transcript
    -> local preference parser
    -> event filters
    -> GET /api/events
```

No recording is sent to the Express server. Chrome or Edge is recommended.
The browser may require microphone permission and an internet connection for
its speech-recognition service. Typed input remains available as a fallback.

Example:

> Free live music tonight within 30 minutes.

This can fill the music interest, free budget, evening time window, and
30-minute travel limit before events are fetched.

## Tech stack

- Frontend: HTML, CSS, and vanilla JavaScript
- Backend: Node.js and Express
- Authentication and circles: Supabase
- Event providers: Ticketmaster, University of Waterloo, and WUSA
- Optional recommendation ranking: Gemini

## Project structure

```text
LooLoop/
|-- backend/
|   |-- services/             # Event providers, scoring, and normalization
|   |-- .env.example          # Environment-variable template
|   |-- server.js             # Express API and static-page server
|   `-- supabase-circles.sql  # Circle database setup
|-- css/                      # Application styles
|-- js/
|   |-- app.js                # Main UI and application state
|   |-- voice.js              # Browser speech-to-text
|   |-- interpret.js          # Local transcript-to-filter parser
|   |-- data.js               # Event loading and frontend data helpers
|   |-- circles.js            # Circles page
|   `-- profile.js            # Authentication/profile page
|-- index.html                # Voice, questionnaire, and results experience
|-- circles.html
|-- profile.html
`-- package.json
```

## Requirements

- Node.js 20 or newer
- A Ticketmaster Discovery API key
- A University of Waterloo API key
- A Supabase project for login and persistent circles
- Chrome or Edge for the microphone experience

Gemini is optional. The main voice experience does not use it.

## Installation

From the repository root:

```bash
npm install
```

The root `postinstall` script installs the backend dependencies as well.

Copy the environment template:

```powershell
Copy-Item backend/.env.example backend/.env
```

On macOS or Linux:

```bash
cp backend/.env.example backend/.env
```

Fill in `backend/.env`:

```env
PORT=3000
TICKETMASTER_API_KEY=your-ticketmaster-key
UWATERLOO_API_KEY=your-uwaterloo-key
GEMINI_API_KEY=your-gemini-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-supabase-secret-key

# Optional. Defaults to 60 km.
EVENTS_RADIUS_KM=60
```

`GEMINI_API_KEY` can be left empty when the optional `/api/recommend` AI
ranking is not needed. Never commit `backend/.env`.

## Supabase setup

1. Create a Supabase project.
2. Open the project's SQL Editor.
3. Run [`backend/supabase-circles.sql`](backend/supabase-circles.sql).
4. Copy the project URL and secret server key into `backend/.env`.

Supabase Auth owns user credentials. Passwords are never stored in the public
circle tables. The Express server validates access tokens and performs database
operations using the server-side key.

The circle schema contains:

- `event_circles`: one persistent circle per event
- `event_circle_members`: signed-in members, usernames, optional Instagram
  handles, and join times

## Running the app

Start the production-style local server:

```bash
npm start
```

For automatic backend restarts during development:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Express serves both the
frontend and API, so Live Server is not required.

## Demo flow

1. Open the home page.
2. Select **Talk** and allow microphone access.
3. Say what you want, or type it into the fallback field.
4. Review the filters LooLoop understood.
5. Select **Show me what's on**.
6. Open an event or join its circle.
7. Sign up when prompted, then return to the event and join.
8. Open **Circles** to see existing circles and their members.

The **Use the questions instead** option demonstrates the same filtering flow
without voice input.

## API endpoints

### Events

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/events` | Unified location-aware feed used by the main UI |
| `GET` | `/api/discover` | Ticketmaster/Waterloo discovery search |
| `GET` | `/api/uwaterloo-events` | University of Waterloo events |
| `POST` | `/api/recommend` | Rules-based or optional Gemini recommendations |
| `GET` | `/api/health` | Provider configuration and server health |

Useful `/api/events` query parameters:

```text
date=YYYY-MM-DD
lat=43.4723
lng=-80.5449
radius=60
```

### Authentication

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/signup` | Create an account |
| `POST` | `/api/auth/login` | Log in and receive an access token |
| `GET` | `/api/auth/profile` | Read the authenticated profile |
| `PUT` | `/api/auth/profile` | Update the optional Instagram handle |

Signup/login body:

```json
{
  "username": "newstudent",
  "password": "at-least-8-characters",
  "instagramHandle": "optional.handle"
}
```

### Circles

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/circles/join` | Join or create the circle for an event |
| `GET` | `/api/circles` | List existing circles and member counts |
| `GET` | `/api/circles/mine` | List the authenticated user's circles |
| `GET` | `/api/circles/:circleId` | Read one circle and its members |

Authenticated requests use:

```http
Authorization: Bearer <supabase-access-token>
```

## Event-provider behavior

`GET /api/events` requests all configured providers concurrently. One provider
failing does not fail the entire feed; the response includes a `warnings` array
and identifies the sources that returned data.

Campus calendars are included when the selected origin is within reach of the
University of Waterloo. Public Ticketmaster events are searched around the
provided coordinates and radius.

## Security notes

- API keys belong only in `backend/.env`.
- The Supabase secret key must never be exposed to frontend JavaScript.
- The browser stores only the signed-in session token and public profile data.
- Instagram handles are optional.
- Voice audio is not uploaded by LooLoop.

## Hackathon pitch

> New students do not only need a list of events. They need a fast way to find
> something that fits their real situation and discover who else wants to go.

LooLoop turns a natural request into actionable local plans, then connects each
event to a persistent student circle.
