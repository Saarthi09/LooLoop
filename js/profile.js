import {
  session, saveSession, updateProfile, dropSession, api, safeNext, fmtWhen, esc, clearAnswers
} from "./api.js?v=28";

const el = {
  sideH: document.getElementById("side-h"),
  sideHint: document.getElementById("side-hint"),
  auth: document.getElementById("auth"),
  authNote: document.getElementById("auth-note"),
  me: document.getElementById("me"),
  meName: document.getElementById("me-name"),
  ig: document.getElementById("ig"),
  igNote: document.getElementById("ig-note"),
  circles: document.getElementById("me-circles"),
  circlesNote: document.getElementById("me-circles-note"),
  logout: document.getElementById("logout")
};

const DEFAULT_NOTE = el.authNote.textContent;

function note(target, text, ok = false) {
  target.textContent = text;
  target.classList.toggle("is-ok", ok);
}

function setBusy(form, busy) {
  form.querySelectorAll("button").forEach((b) => { b.disabled = busy; });
}

function render() {
  const s = session();
  el.auth.hidden = Boolean(s);
  el.me.hidden = !s;
  if (!s) {
    el.sideH.textContent = "Who's going with you?";
    el.sideHint.textContent = "A username and a password is all a profile is. Add an Instagram handle if you want the people in your circles to be able to find you.";
    return;
  }
  el.sideH.textContent = `Hey, ${s.profile.username}.`;
  el.sideHint.textContent = "Your circles, and the handle the people in them can see.";
  el.meName.textContent = s.profile.username;
  el.ig.elements.instagramHandle.value = s.profile.instagramHandle || "";
  loadCircles();
}

/* ---- sign in and sign up --------------------------------------------- */

async function submitAuth(action) {
  const f = new FormData(el.auth);
  note(el.authNote, action === "signup" ? "Creating your profile." : "Signing you in.", true);
  setBusy(el.auth, true);
  try {
    const j = await api(`/api/auth/${action}`, {
      method: "POST",
      body: {
        username: f.get("username"),
        password: f.get("password"),
        instagramHandle: action === "signup" ? f.get("instagramHandle") : undefined
      }
    });
    saveSession(j);
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));
    if (next) {
      window.location.href = next;
      return;
    }
    el.auth.reset();
    note(el.authNote, DEFAULT_NOTE, true);
    render();
  } catch (err) {
    note(el.authNote, err.message);
  } finally {
    setBusy(el.auth, false);
  }
}

el.auth.addEventListener("submit", (ev) => {
  ev.preventDefault();
  submitAuth(ev.submitter?.dataset.action || "login");
});

/* ---- the handle ------------------------------------------------------ */

el.ig.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  note(el.igNote, "Saving.", true);
  setBusy(el.ig, true);
  try {
    const j = await api("/api/auth/profile", {
      method: "PUT",
      auth: true,
      body: { instagramHandle: new FormData(el.ig).get("instagramHandle") }
    });
    updateProfile(j.profile);
    note(el.igNote, j.profile.instagramHandle ? "Saved." : "Handle removed.", true);
  } catch (err) {
    if (err.status === 401) return render();
    note(el.igNote, err.message);
  } finally {
    setBusy(el.ig, false);
  }
});

/* ---- your circles ---------------------------------------------------- */

async function loadCircles() {
  el.circlesNote.textContent = "Loading.";
  el.circles.innerHTML = "";
  try {
    const j = await api("/api/circles/mine", { auth: true });
    const circles = j.circles || [];
    el.circlesNote.textContent = circles.length
      ? ""
      : "None yet. Join one from a card on what's on, or from the circles page.";
    el.circles.innerHTML = circles.map((c) => `
      <div class="circle-row">
        <div>
          <p class="circle-row-name">${esc(c.event_name)}</p>
          <p class="circle-row-when">${esc(fmtWhen(c.event_date))}</p>
        </div>
        <a class="link" href="circles.html?circle=${encodeURIComponent(c.id)}">who's going</a>
      </div>`).join("");
  } catch (err) {
    if (err.status === 401) return render();
    el.circlesNote.textContent = err.message;
  }
}

/* Logging out is a clean slate: the session goes, the remembered answers
   go, and the first question is shown fresh. */
el.logout.addEventListener("click", () => {
  dropSession();
  clearAnswers();
  window.location.href = "./#start";
});

/* ---- boot ------------------------------------------------------------ */

render();

/* A stored token may have been revoked since it was saved; check once. */
if (session()) {
  api("/api/auth/profile", { auth: true })
    .then((j) => { updateProfile(j.profile); render(); })
    .catch((err) => { if (err.status === 401) render(); });
}
