const form = document.querySelector("#search-form");
const results = document.querySelector("#results");
const status = document.querySelector("#status");
const title = document.querySelector("#result-title");
const template = document.querySelector("#event-template");
const universityButton = document.querySelector("#university-events");
// Live Server uses port 5500; Express serves the API on port 3000.
const apiBase = ["5500", "5501"].includes(window.location.port)
  ? "http://localhost:3000"
  : "";
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
function render(items) {
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
    card.querySelector("a").href = event.url || "#";
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
  const params = new URLSearchParams({
    city: data.get("city"),
    keyword: data.get("keyword"),
    size: "12",
  });
  results.innerHTML = '<p class="empty">Looking for your next loop…</p>';
  status.textContent = "Searching…";
  try {
    const response = await fetch(`${apiBase}/api/discover?${params}`);
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error || "Could not find events.");
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
