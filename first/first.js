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
function render(events) {
  results.replaceChildren();
  if (!events.length) {
    results.innerHTML =
      '<p class="empty">No events found. Try a broader interest.</p>';
    return;
  }
  events.forEach((event) => {
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
    card.querySelector("a").href = event.url || "#";
    results.append(card);
  });
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
