const circlesGrid = document.querySelector("#circles-grid");
const circlesStatus = document.querySelector("#circles-status");
const circleDetail = document.querySelector("#circle-detail");
const circleTitle = document.querySelector("#circle-title");
const circleDate = document.querySelector("#circle-date");
const memberList = document.querySelector("#member-list");
const circleEventLink = document.querySelector("#circle-event-link");

function getSession() {
  try {
    return JSON.parse(localStorage.getItem("looloop-session") || "null");
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return "Date TBA";
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

async function fetchWithSession(url) {
  const session = getSession();
  if (!session?.accessToken) {
    window.location.href = "profile.html";
    return null;
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  const payload = await response.json();
  if (response.status === 401) {
    localStorage.removeItem("looloop-session");
    window.location.href = "profile.html";
    return null;
  }
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

async function joinExistingCircle(circle, button) {
  const session = getSession();
  if (!session?.accessToken) {
    window.location.href = "profile.html";
    return;
  }

  button.disabled = true;
  button.textContent = "Joining…";

  try {
    const response = await fetch("/api/circles/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        eventId: circle.event_id,
        eventName: circle.event_name,
        eventUrl: circle.event_url,
        eventDate: circle.event_date,
      }),
    });
    const payload = await response.json();
    if (response.status === 401) {
      localStorage.removeItem("looloop-session");
      window.location.href = "profile.html";
      return;
    }
    if (!response.ok) {
      throw new Error(payload.error || "Could not join this circle.");
    }

    button.textContent = "Joined ✓";
    await loadCircles();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Try again";
    circlesStatus.textContent = error.message;
  }
}

async function showCircle(circleId) {
  circleDetail.hidden = false;
  circleTitle.textContent = "Loading circle…";
  circleDate.textContent = "";
  memberList.replaceChildren();

  try {
    const payload = await fetchWithSession(`/api/circles/${circleId}`);
    if (!payload) return;

    circleTitle.textContent = payload.circle.event_name;
    circleDate.textContent = formatDate(payload.circle.event_date);
    circleEventLink.href = payload.circle.event_url || "#";
    circleEventLink.hidden = !payload.circle.event_url;
    payload.members.forEach((member) => {
      const item = document.createElement("li");
      if (member.instagram_handle) {
        const link = document.createElement("a");
        link.href = `https://www.instagram.com/${encodeURIComponent(
          member.instagram_handle,
        )}/`;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = `@${member.instagram_handle} ↗`;
        item.append(member.username, document.createElement("br"), link);
      } else {
        item.textContent = member.username;
      }
      memberList.append(item);
    });
    circleDetail.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    circleTitle.textContent = "Could not load circle";
    circleDate.textContent = error.message;
  }
}

async function loadCircles() {
  try {
    const session = getSession();
    const publicResponse = await fetch("/api/circles");
    const payload = await publicResponse.json();
    if (!publicResponse.ok) {
      throw new Error(payload.error || "Could not load circles.");
    }

    let joinedCircleIds = new Set();
    if (session?.accessToken) {
      const mineResponse = await fetch("/api/circles/mine", {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (mineResponse.ok) {
        const minePayload = await mineResponse.json();
        joinedCircleIds = new Set(
          minePayload.circles.map((circle) => circle.id),
        );
      } else if (mineResponse.status === 401) {
        localStorage.removeItem("looloop-session");
      }
    }

    circlesGrid.replaceChildren();
    circlesStatus.textContent = `${payload.circles.length} open`;
    if (!payload.circles.length) {
      circlesGrid.innerHTML =
        '<p class="empty">No circles yet. The first student to join an event will create one.</p>';
      return;
    }

    payload.circles.forEach((circle) => {
      const card = document.createElement("article");
      card.className = "circle-card";
      const label = document.createElement("p");
      label.className = "circle-tags";
      label.textContent = "EVENT CIRCLE";
      const name = document.createElement("h3");
      name.textContent = circle.event_name;
      const date = document.createElement("p");
      date.className = "circle-members";
      date.textContent = formatDate(circle.event_date);
      const members = document.createElement("p");
      members.className = "circle-members";
      members.textContent = `${circle.member_count} ${
        circle.member_count === 1 ? "student" : "students"
      } joined`;
      const button = document.createElement("button");
      button.className = "circle-view-button";
      button.type = "button";
      if (joinedCircleIds.has(circle.id)) {
        button.textContent = "View members →";
        button.addEventListener("click", () => showCircle(circle.id));
      } else {
        button.textContent = session?.accessToken
          ? "Join circle →"
          : "Log in to join →";
        button.addEventListener("click", () =>
          joinExistingCircle(circle, button),
        );
      }
      card.append(label, name, date, members, button);
      circlesGrid.append(card);
    });
  } catch (error) {
    circlesStatus.textContent = "Circles unavailable";
    circlesGrid.innerHTML = `<p class="empty error">${error.message}</p>`;
  }
}

loadCircles();
