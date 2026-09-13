import { session, api, profileUrl, fmtWhen, esc, webUrl, instagramUrl } from "./api.js?v=16";

/* Single state object, mutated by handlers, then render(). */
const state = {
  circles: [],
  mine: new Set(),          // circle ids the signed-in person has joined
  error: null,
  busy: null,               // circle id with a join in flight
  note: null,               // { id, text } shown under one card
  selected: null,           // circle id open in the rail
  detail: null,             // { circle, members } once loaded
  detailNote: ""
};

const el = {
  h: document.getElementById("circles-h"),
  sub: document.getElementById("circles-sub"),
  list: document.getElementById("circles"),
  empty: document.getElementById("circles-empty"),
  navProfile: document.getElementById("nav-profile"),
  detailName: document.getElementById("detail-name"),
  detailWhen: document.getElementById("detail-when"),
  members: document.getElementById("members"),
  membersNote: document.getElementById("members-note"),
  detailLink: document.getElementById("detail-link")
};

const toProfile = () => { window.location.href = profileUrl(); };

/* ---- data ------------------------------------------------------------ */

async function load() {
  try {
    const [open, mine] = await Promise.all([
      api("/api/circles"),
      session() ? api("/api/circles/mine", { auth: true }).catch(() => ({ circles: [] })) : { circles: [] }
    ]);
    state.circles = open.circles || [];
    state.mine = new Set((mine.circles || []).map((c) => c.id));
    state.error = null;
  } catch (err) {
    state.error = err.message;
  }
  render();

  const wanted = new URLSearchParams(window.location.search).get("circle");
  if (wanted && state.mine.has(wanted)) openCircle(wanted);
}

async function join(circle) {
  if (!session()) return toProfile();
  state.busy = circle.id;
  state.note = null;
  render();
  try {
    await api("/api/circles/join", {
      method: "POST",
      auth: true,
      body: {
        eventId: circle.event_id,
        eventName: circle.event_name,
        eventUrl: circle.event_url,
        eventDate: circle.event_date
      }
    });
    state.mine.add(circle.id);
    state.note = { id: circle.id, text: "You're in." };
    state.busy = null;
    openCircle(circle.id);
    return;
  } catch (err) {
    if (err.status === 401) return toProfile();
    state.note = { id: circle.id, text: err.message };
  }
  state.busy = null;
  render();
}

async function openCircle(id) {
  state.selected = id;
  state.detail = null;
  state.detailNote = "Loading.";
  render();
  try {
    const j = await api(`/api/circles/${encodeURIComponent(id)}`, { auth: true });
    state.detail = { circle: j.circle, members: j.members || [] };
    /* The card shows the same number the list beside it shows. */
    const card = state.circles.find((x) => x.id === id);
    if (card) card.member_count = state.detail.members.length;
    state.detailNote = state.detail.members.length ? "" : "Nobody yet.";
  } catch (err) {
    if (err.status === 401) return toProfile();
    state.detailNote = err.message;
  }
  render();
}

/* ---- render ---------------------------------------------------------- */

function cardHTML(c) {
  const signedIn = Boolean(session());
  const inCircle = state.mine.has(c.id);
  const busy = state.busy === c.id;
  const n = c.member_count || 0;
  const note = state.note && state.note.id === c.id ? state.note.text : "";
  const link = webUrl(c.event_url);
  const action = inCircle
    ? `<button type="button" class="btn btn-join is-in" data-open="${esc(c.id)}">See who's going</button>`
    : signedIn
      ? `<button type="button" class="btn btn-join" data-join="${esc(c.id)}"${busy ? " disabled" : ""}>${busy ? "Joining" : "Join circle"}</button>`
      : `<a class="btn btn-join" href="${esc(profileUrl())}">Log in to join</a>`;

  return `<article class="card circle-card${c.id === state.selected ? " is-sel" : ""}" data-circle="${esc(c.id)}">
    <div class="card-body">
      <p class="card-when"><strong>${esc(fmtWhen(c.event_date))}</strong></p>
      <h3 class="card-title">${esc(c.event_name)}</h3>
      <p class="card-venue">${n === 1 ? "1 person going" : `${n} people going`}${inCircle ? ", including you" : ""}</p>
      <div class="card-actions">
        ${link ? `<a class="link" href="${esc(link)}" target="_blank" rel="noreferrer">Event details</a>` : "<span></span>"}
        ${action}
      </div>
      ${note ? `<p class="card-circle-note">${esc(note)}</p>` : ""}
    </div>
  </article>`;
}

function renderDetail() {
  if (!state.selected) {
    el.detailName.textContent = session() ? "Pick a circle you're in" : "Sign in to see who's going";
    el.detailWhen.textContent = "";
    el.members.innerHTML = "";
    el.membersNote.textContent = "";
    el.detailLink.hidden = true;
    return;
  }
  const c = state.detail?.circle || state.circles.find((x) => x.id === state.selected);
  el.detailName.textContent = c ? c.event_name : "Circle";
  el.detailWhen.textContent = c ? fmtWhen(c.event_date) : "";
  el.members.innerHTML = (state.detail?.members || []).map((m) => `
    <li>
      <span>${esc(m.username)}</span>
      ${m.instagram_handle
        ? `<a class="link link-deep" href="${esc(instagramUrl(m.instagram_handle))}" target="_blank" rel="noreferrer">@${esc(m.instagram_handle)}</a>`
        : `<span class="members-quiet">no handle</span>`}
    </li>`).join("");
  el.membersNote.textContent = state.detailNote;
  const link = webUrl(c?.event_url);
  el.detailLink.hidden = !link;
  if (link) el.detailLink.href = link;
}

function render() {
  el.navProfile.textContent = session()?.profile?.username || "Log in";
  if (state.error) {
    el.h.textContent = "Circles are unavailable";
    el.sub.textContent = state.error;
    el.list.innerHTML = "";
    el.empty.hidden = true;
    renderDetail();
    return;
  }
  const n = state.circles.length;
  el.h.textContent = n === 1 ? "One open circle" : `${n} open circles`;
  el.sub.textContent = session()
    ? "Join one to see who else is going."
    : "Sign in to join one and see who else is going.";
  el.list.innerHTML = state.circles.map(cardHTML).join("");
  el.empty.hidden = n > 0;
  renderDetail();
}

/* ---- wiring ---------------------------------------------------------- */

el.list.addEventListener("click", (ev) => {
  const joinBtn = ev.target.closest("[data-join]");
  if (joinBtn) {
    const c = state.circles.find((x) => x.id === joinBtn.dataset.join);
    if (c) join(c);
    return;
  }
  const openBtn = ev.target.closest("[data-open]");
  if (openBtn) return openCircle(openBtn.dataset.open);
  if (ev.target.closest("a")) return;
  const card = ev.target.closest("[data-circle]");
  if (card && state.mine.has(card.dataset.circle)) openCircle(card.dataset.circle);
});

load();
