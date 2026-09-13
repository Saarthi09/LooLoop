const recommendationSchema = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    recommendations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          eventId: { type: "STRING" },
          score: { type: "INTEGER" },
          reasons: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
        },
        required: ["eventId", "score", "reasons"],
      },
    },
  },
  required: ["summary", "recommendations"],
};

export async function rankEventsWithGemini({ apiKey, preferences, events }) {
  if (!apiKey) throw new Error("Gemini is not configured.");

  const eventChoices = events.map((event) => ({
    id: event.id,
    name: event.name,
    source: event.source,
    date: event.dates?.start?.dateTime || event.dates?.start?.localDate,
    venue: event._embedded?.venues?.[0]?.name,
    city: event._embedded?.venues?.[0]?.city?.name,
    priceMinimum: event.priceRanges?.[0]?.min ?? null,
    categories: event.classifications
      ?.map((item) => item.segment?.name)
      .filter(Boolean),
  }));

  const prompt = `You recommend real events to a new university student.
Rank up to 8 supplied events using the student's interests, budget, availability,
campus preference, social comfort, and goals. Never invent an event or event ID.
Scores must be integers from 0 to 100. Give 2 or 3 short, concrete reasons.

Student preferences:
${JSON.stringify(preferences)}

Available events:
${JSON.stringify(eventChoices)}`;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: recommendationSchema,
          temperature: 0.2,
        },
      }),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "Gemini request failed.");
  }

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response.");

  const result = JSON.parse(text);
  const validEventIds = new Set(events.map((event) => String(event.id)));
  result.recommendations = result.recommendations
    .filter((item) => validEventIds.has(String(item.eventId)))
    .map((item) => ({
      eventId: String(item.eventId),
      score: Math.min(Math.max(Number(item.score) || 0, 0), 100),
      reasons: item.reasons.slice(0, 3),
    }));

  return result;
}
