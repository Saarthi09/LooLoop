const form = document.querySelector("#search-form");
const results = document.querySelector("#results");
const status = document.querySelector("#status");
const title = document.querySelector("#result-title");
const template = document.querySelector("#event-template");
const universityButton = document.querySelector("#university-events");
const mapPanel = document.querySelector("#map-panel");
const eventMapElement = document.querySelector("#event-map");
// Live Server uses port 5500; Express serves the API on port 3000.
const apiBase = ["5500", "5501"].includes(window.location.port)
  ? "http://localhost:3000"
  : "";
const joinedEventIds = new Set();
let distanceOriginLabel = "your location";
let activeOrigin = null;
let eventMap = null;
let mapLayer = null;

function formatDate(event) {
  const value = event.dates?.start?.dateTime || event.dates?.start?.localDate;
  return value
    ? new Intl.DateTimeFormat("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(new Date(value))
    : "Date TBA";
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem("looloop-session") || "null");
  } catch {
    return null;
  }
}

async function loadJoinedEventIds() {
  const session = getSession();
  if (!session?.accessToken) return;

  try {
    const response = await fetch(`${apiBase}/api/circles/mine`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (response.status === 401) {
      localStorage.removeItem("looloop-session");
      return;
    }
    if (!response.ok) return;

    const payload = await response.json();
    payload.circles.forEach((circle) => joinedEventIds.add(circle.event_id));
  } catch {
    // Event discovery should still work if saved circles cannot be loaded.
  }
}

const joinedCirclesReady = loadJoinedEventIds();

function getEventLocation(event) {
  const location = event._embedded?.venues?.[0]?.location;
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);

  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? [latitude, longitude]
    : null;
}

function createEventPopup(event) {
  const popup = document.createElement("div");
  const heading = document.createElement("strong");
  const venue = document.createElement("p");
  const link = document.createElement("a");
  const eventVenue = event._embedded?.venues?.[0];

  heading.textContent = event.name || "Untitled event";
  venue.textContent =
    [eventVenue?.name, eventVenue?.city?.name].filter(Boolean).join(" · ") ||
    "Location TBA";
  link.href = event.url || "#";
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "View details ↗";

  popup.append(heading, venue, link);
  return popup;
}

function renderMap(items) {
  const events = items.map((item) => item.event || item);
  const mappedEvents = events
    .map((event) => ({ event, location: getEventLocation(event) }))
    .filter((item) => item.location);

  mapPanel.hidden = !mappedEvents.length && !activeOrigin;
  if (mapPanel.hidden || typeof L === "undefined") return;

  if (!eventMap) {
    eventMap = L.map(eventMapElement, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(eventMap);
  }

  if (mapLayer) {
    mapLayer.remove();
  }
  mapLayer = L.layerGroup().addTo(eventMap);

  const bounds = [];
  if (activeOrigin) {
    const originCoordinates = [activeOrigin.latitude, activeOrigin.longitude];
    const maximumDistance = Number(savedPreferences?.maxDistance) || 5;

    L.circle(originCoordinates, {
      radius: maximumDistance * 1000,
      color: "#18233f",
      fillColor: "#6c63ff",
      fillOpacity: 0.08,
      weight: 2,
    }).addTo(mapLayer);

    L.circleMarker(originCoordinates, {
      radius: 9,
      color: "#ffffff",
      fillColor: "#18233f",
      fillOpacity: 1,
      weight: 3,
    })
      .bindPopup(`<strong>You</strong><br>${distanceOriginLabel}`)
      .addTo(mapLayer);
    bounds.push(originCoordinates);
  }

  mappedEvents.forEach(({ event, location }) => {
    L.circleMarker(location, {
      radius: 8,
      color: "#ffffff",
      fillColor: "#6c63ff",
      fillOpacity: 1,
      weight: 3,
    })
      .bindPopup(createEventPopup(event))
      .addTo(mapLayer);
    bounds.push(location);
  });

  window.setTimeout(() => {
    eventMap.invalidateSize();
    if (bounds.length === 1) {
      eventMap.setView(bounds[0], 13);
    } else {
      eventMap.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
    }
  }, 0);
}

async function joinCircle(event, button, message) {
  const session = getSession();
  if (!session?.accessToken) {
    window.location.href = "profile.html";
    return;
  }

  button.disabled = true;
  button.textContent = "Joining…";
  message.textContent = "";

  try {
    const response = await fetch(`${apiBase}/api/circles/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        eventId: event.id,
        eventName: event.name,
        eventUrl: event.url,
        eventDate:
          event.dates?.start?.dateTime || event.dates?.start?.localDate,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem("looloop-session");
        window.location.href = "profile.html";
        return;
      }
      throw new Error(payload.error || "Could not join this circle.");
    }

    joinedEventIds.add(String(event.id));
    button.textContent = "Joined ✓";
    message.innerHTML = '<a href="circles.html">View your circles →</a>';
  } catch (error) {
    button.disabled = false;
    button.textContent = "Join circle";
    message.textContent = error.message;
  }
}

function render(items) {
  renderMap(items);
  results.replaceChildren();
  if (!items.length) {
    results.innerHTML =
      '<p class="empty">No events found. Try a broader interest.</p>';
    return;
  }
  items.forEach((item) => {
    const event = item.event || item;
    const card = template.content.cloneNode(true);
    const image =
      event.images?.find((item) => item.ratio === "16_9") || event.images?.[0];
    card.querySelector("img").src =
      image?.url || "https://placehold.co/640x360/29223e/fffaf0?text=LooLoop";
    card.querySelector("img").alt = event.name || "Event image";
    card.querySelector(".date").textContent = formatDate(event);
    card.querySelector("h3").textContent = event.name || "Untitled event";
    const venue = event._embedded?.venues?.[0];
    card.querySelector(".venue").textContent =
      [venue?.name, venue?.city?.name].filter(Boolean).join(" · ") ||
      "Location TBA";
    card.querySelector(".distance").textContent =
      event.distanceKm != null
        ? `${event.distanceKm} km from ${distanceOriginLabel}`
        : "";
    card.querySelector(".source").textContent = event.source || "Ticketmaster";
    const matchBadge = card.querySelector(".match-badge");
    const reasons = card.querySelector(".match-reasons");
    if (item.matchScore != null) {
      matchBadge.hidden = false;
      matchBadge.textContent = `${item.matchScore}% match`;
      item.reasons.forEach((reason) => {
        const listItem = document.createElement("li");
        listItem.textContent = reason;
        reasons.append(listItem);
      });
    }
    card.querySelector(".event-actions a").href = event.url || "#";
    const joinButton = card.querySelector(".join-circle-button");
    const joinStatus = card.querySelector(".join-status");
    if (joinedEventIds.has(String(event.id))) {
      joinButton.disabled = true;
      joinButton.textContent = "Joined ✓";
      joinStatus.innerHTML = '<a href="circles.html">View your circles →</a>';
    } else {
      joinButton.addEventListener("click", () => {
        joinCircle(event, joinButton, joinStatus);
      });
    }
    results.append(card);
  });
}

async function loadRecommendations(preferences) {
  results.innerHTML =
    '<p class="empty">Building your personalized newcomer guide…</p>';
  status.textContent = "Analyzing your preferences…";

  try {
    const response = await fetch(`${apiBase}/api/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not build recommendations.");
    }

    activeOrigin = payload.origin || null;
    distanceOriginLabel =
      preferences.locationMethod === "automatic"
        ? "your location"
        : "your entered location";
    await joinedCirclesReady;
    render(payload.recommendations);
    title.textContent = "Your newcomer picks";
    status.textContent = `${payload.recommendations.length} personalized events`;
    document.querySelector("#recommendation-summary").textContent =
      payload.summary;
  } catch (error) {
    results.innerHTML = `<p class="empty error">${error.message}</p>`;
    status.textContent = "Recommendations unavailable";
  }
}
async function search() {
  const data = new FormData(form);
  results.innerHTML = '<p class="empty">Looking for your next loop…</p>';
  status.textContent = "Searching…";
  try {
    const params = new URLSearchParams({
      city: data.get("city"),
      keyword: data.get("keyword"),
      size: "12",
      radius: String(savedPreferences?.maxDistance || 5),
      unit: "km",
    });
    const hasSavedCoordinates =
      savedPreferences?.latitude != null &&
      savedPreferences?.longitude != null;
    if (hasSavedCoordinates) {
      params.set("originLatitude", savedPreferences.latitude);
      params.set("originLongitude", savedPreferences.longitude);
      distanceOriginLabel = "your location";
    } else {
      const enteredOrigin =
        savedPreferences?.manualLocation || savedPreferences?.city;
      params.set("originPlace", enteredOrigin || data.get("city"));
      distanceOriginLabel = enteredOrigin
        ? "your entered location"
        : data.get("city");
    }
    const response = await fetch(`${apiBase}/api/discover?${params}`);
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error || "Could not find events.");
    if (!payload.locationResolved) {
      throw new Error("That location could not be found. Try a city or postal code.");
    }
    activeOrigin = payload.origin || null;
    await joinedCirclesReady;
    render(payload.events);
    title.textContent = `Happening in ${data.get("city")}`;
    status.textContent = `${payload.events.length} upcoming events`;
  } catch (error) {
    results.innerHTML = `<p class="empty error">${error.message}</p>`;
    status.textContent = "Search unavailable";
  }
}

async function showUniversityEvents() {
  results.innerHTML =
    '<p class="empty">Loading University of Waterloo events…</p>';
  status.textContent = "Searching campus events…";

  try {
    const response = await fetch(`${apiBase}/api/uwaterloo-events?size=12`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not find university events.");
    }

    if (
      savedPreferences?.latitude != null &&
      savedPreferences?.longitude != null
    ) {
      activeOrigin = {
        latitude: Number(savedPreferences.latitude),
        longitude: Number(savedPreferences.longitude),
      };
    }
    await joinedCirclesReady;
    render(payload.events);
    title.textContent = "University of Waterloo events";
    status.textContent = `${payload.events.length} upcoming campus events`;
  } catch (error) {
    results.innerHTML = `<p class="empty error">${error.message}</p>`;
    status.textContent = "University events unavailable";
  }
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  search();
});

universityButton.addEventListener("click", showUniversityEvents);
document.querySelectorAll("[data-interest]").forEach((button) =>
  button.addEventListener("click", () => {
    document.querySelector("#keyword").value = button.dataset.interest;
    search();
  }),
);

const savedPreferences = JSON.parse(
  localStorage.getItem("looloop-preferences") || "null",
);
if (
  savedPreferences &&
  new URLSearchParams(window.location.search).has("recommended")
) {
  document.querySelector("#city").value = savedPreferences.city;
  document.querySelector("#keyword").value =
    savedPreferences.interests.join(", ");
  loadRecommendations(savedPreferences);
} else {
  status.textContent = "Search to see upcoming events.";
  results.innerHTML =
    '<p class="empty">Choose an interest and city to start exploring.</p>';
}
