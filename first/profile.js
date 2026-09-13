const authForm = document.querySelector("#auth-form");
const authFormPanel = document.querySelector("#auth-form-panel");
const profilePanel = document.querySelector("#profile-panel");
const profileUsername = document.querySelector("#profile-username");
const authStatus = document.querySelector("#auth-status");
const instagramForm = document.querySelector("#instagram-form");
const profileInstagram = document.querySelector("#profile-instagram");
const instagramStatus = document.querySelector("#instagram-status");

function saveSession(payload) {
  localStorage.setItem(
    "looloop-session",
    JSON.stringify({
      accessToken: payload.accessToken,
      expiresAt: payload.expiresAt,
      profile: payload.profile,
    }),
  );
  showProfile(payload.profile);
}

function showProfile(profile) {
  authFormPanel.hidden = true;
  profilePanel.hidden = false;
  profileUsername.textContent = profile.username;
  profileInstagram.value = profile.instagramHandle || "";
}

async function submitCredentials(action) {
  const formData = new FormData(authForm);
  authStatus.textContent =
    action === "signup" ? "Creating profile…" : "Logging in…";

  try {
    const response = await fetch(`/api/auth/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password"),
        instagramHandle:
          action === "signup" ? formData.get("instagramHandle") : undefined,
      }),
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error || "Authentication failed.");
    saveSession(payload);
  } catch (error) {
    authStatus.textContent = error.message;
  }
}

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitCredentials(event.submitter?.dataset.action || "login");
});

instagramForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const session = JSON.parse(
    localStorage.getItem("looloop-session") || "null",
  );
  if (!session?.accessToken) return;

  instagramStatus.textContent = "Saving…";
  try {
    const formData = new FormData(instagramForm);
    const response = await fetch("/api/auth/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        instagramHandle: formData.get("instagramHandle"),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not save Instagram handle.");
    }

    session.profile = payload.profile;
    localStorage.setItem("looloop-session", JSON.stringify(session));
    instagramStatus.textContent = payload.profile.instagramHandle
      ? "Instagram saved."
      : "Instagram removed.";
  } catch (error) {
    instagramStatus.textContent = error.message;
  }
});

document.querySelector("#logout").addEventListener("click", () => {
  localStorage.removeItem("looloop-session");
  profilePanel.hidden = true;
  authFormPanel.hidden = false;
  authForm.reset();
  authStatus.textContent = "You are logged out.";
});

const savedSession = JSON.parse(
  localStorage.getItem("looloop-session") || "null",
);
if (savedSession?.profile) showProfile(savedSession.profile);
