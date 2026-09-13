const questionnaire = document.querySelector("#questionnaire");
const locationMethod = document.querySelector("#location-method");
const automaticLocation = document.querySelector("#automatic-location");
const manualLocation = document.querySelector("#manual-location");
const locationStatus = document.querySelector("#location-status");

locationMethod.addEventListener("change", () => {
  const useAutomaticLocation = locationMethod.value === "automatic";
  automaticLocation.hidden = !useAutomaticLocation;
  manualLocation.hidden = useAutomaticLocation;
});

document.querySelector("#use-location").addEventListener("click", () => {
  if (!navigator.geolocation) {
    locationStatus.textContent = "Location is not supported by this browser.";
    return;
  }

  locationStatus.textContent = "Finding your approximate location…";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      questionnaire.elements.latitude.value = coords.latitude.toFixed(2);
      questionnaire.elements.longitude.value = coords.longitude.toFixed(2);
      locationStatus.textContent = "Approximate location added.";
    },
    () => {
      locationStatus.textContent =
        "Location permission was not granted. Choose manual entry instead.";
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
});

function savePreferences(formData) {
  const preferences = {
    city: formData.get("city"),
    campus: formData.get("campus"),
    studentType: formData.get("studentType"),
    livingSituation: formData.get("livingSituation"),
    availability: formData.get("availability"),
    locationMethod: formData.get("locationMethod"),
    manualLocation: formData.get("manualLocation"),
    latitude: formData.get("latitude")
      ? Number(formData.get("latitude"))
      : null,
    longitude: formData.get("longitude")
      ? Number(formData.get("longitude"))
      : null,
    maxDistance: Number(formData.get("maxDistance")),
    budget: Number(formData.get("budget")),
    socialComfort: formData.get("socialComfort"),
    goal: formData.get("goal"),
    interests: formData
      .get("interests")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };

  localStorage.setItem("looloop-preferences", JSON.stringify(preferences));
}

questionnaire.addEventListener("submit", (event) => {
  event.preventDefault();
  savePreferences(new FormData(questionnaire));
  window.location.href = "events.html?recommended=true";
});

document.querySelector("#skip-questionnaire").addEventListener("click", () => {
  localStorage.removeItem("looloop-preferences");
  window.location.href = "events.html";
});
