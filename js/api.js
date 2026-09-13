/* Shared by every page: where the API is, the signed-in session, and the
   fetch helper that carries it. The server keeps accounts in Supabase;
   the browser only holds the access token it was handed at sign-in. */

/* Live Server uses port 5500; python -m http.server uses 8000. Served by
   Express itself, the API is on the same origin. */
export const API_BASE = ["5500", "5501", "8000"].includes(window.location.port)
  ? "http://localhost:3000"
  : "";

const SESSION_KEY = "looloop-session";

/* The stored session, or null once it has expired or was never there. */
export function session() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!s?.accessToken) return null;
    if (s.expiresAt && Number(s.expiresAt) * 1000 < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch (err) {
    return null;
  }
}

export function saveSession({ accessToken, expiresAt, profile }) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken, expiresAt, profile }));
}

export function updateProfile(profile) {
  const s = session();
  if (s) saveSession({ ...s, profile });
}

export function dropSession() {
  localStorage.removeItem(SESSION_KEY);
}

/* The questionnaire answers the main page remembers. Logging out, and the
   Start over button, forget them. */
export const ANSWERS_KEY = "looloop-answers";

export function clearAnswers() {
  try { localStorage.removeItem(ANSWERS_KEY); } catch (err) { /* nothing to clear */ }
}

/* Where to send someone to sign in, and where to bring them back to.
   Only a path on this site is ever followed back. */
export function profileUrl(next = window.location.pathname + window.location.search) {
  return `profile.html?next=${encodeURIComponent(next)}`;
}

export function safeNext(value) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/* JSON in, JSON out. A 401 on a signed-in call drops the stored session,
   so the page can send the person to sign in again rather than keep
   failing quietly with a dead token. */
export async function api(path, { method = "GET", body, auth = false } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const s = session();
    if (!s) throw new ApiError("Sign in first.", 401);
    headers.Authorization = `Bearer ${s.accessToken}`;
  }

  let r;
  try {
    r = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (err) {
    throw new ApiError("The server is not answering. Is it running?", 0);
  }

  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && auth) dropSession();
  if (!r.ok) throw new ApiError(j.error || `Request failed (${r.status}).`, r.status);
  return j;
}

export function fmtWhen(iso) {
  if (!iso) return "Date to be confirmed";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date to be confirmed";
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  }).format(d);
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* Only a web link from a listing is ever put into an href. */
export const webUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : null);

export const instagramUrl = (handle) => `https://www.instagram.com/${encodeURIComponent(handle)}/`;
