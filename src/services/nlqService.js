import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not defined in .env");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ─── Keyword Pre-Parser ───────────────────────────────────────────────────────
// Resolves simple / single-concept queries instantly without a Gemini call.
// Keeps the API functional even when the Gemini key is missing or rate-limited.

const COUNTRY_MAP = {
  nigeria: "NG", ghana: "GH", kenya: "KE", "south africa": "ZA",
  egypt: "EG", ethiopia: "ET", tanzania: "TZ", uganda: "UG",
  "united states": "US", usa: "US", america: "US",
  "united kingdom": "GB", uk: "GB", england: "GB",
  canada: "CA", australia: "AU", india: "IN", china: "CN",
  germany: "DE", france: "FR", brazil: "BR", mexico: "MX",
  japan: "JP", russia: "RU", italy: "IT", spain: "ES",
  portugal: "PT", netherlands: "NL", sweden: "SE", norway: "NO",
  denmark: "DK", finland: "FI", poland: "PL", ukraine: "UA",
  pakistan: "PK", bangladesh: "BD", indonesia: "ID", philippines: "PH",
  vietnam: "VN", thailand: "TH", malaysia: "MY", singapore: "SG",
  "saudi arabia": "SA", turkey: "TR", iran: "IR", iraq: "IQ",
  argentina: "AR", colombia: "CO", chile: "CL", peru: "PE",
  cameroon: "CM", senegal: "SN", "ivory coast": "CI", zimbabwe: "ZW",
  zambia: "ZM", angola: "AO", mozambique: "MZ", rwanda: "RW",
};

const AGE_GROUP_MAP = {
  child: "child", children: "child", kids: "child", kid: "child",
  teen: "teenager", teens: "teenager", teenager: "teenager", teenagers: "teenager",
  adult: "adult", adults: "adult",
  senior: "senior", seniors: "senior", elderly: "senior",
};

/**
 * Attempts to resolve a query purely from keyword matching.
 * Returns a filter object if matched, or null if the query is too complex.
 */
const keywordPreParse = (text) => {
  const filter = {};
  let remaining = text;

  // Gender
  if (/\b(males?|men|man)\b/.test(remaining)) {
    filter.gender = "male";
    remaining = remaining.replace(/\b(males?|men|man)\b/g, "").trim();
  } else if (/\b(females?|women|woman|girls?)\b/.test(remaining)) {
    filter.gender = "female";
    remaining = remaining.replace(/\b(females?|women|woman|girls?)\b/g, "").trim();
  }

  // Age group
  for (const [keyword, group] of Object.entries(AGE_GROUP_MAP)) {
    const regex = new RegExp(`\\b${keyword}\\b`);
    if (regex.test(remaining)) {
      filter.age_group = group;
      remaining = remaining.replace(regex, "").trim();
      break;
    }
  }

  // Country — try multi-word first, then single-word
  const sortedCountries = Object.keys(COUNTRY_MAP).sort((a, b) => b.length - a.length);
  for (const name of sortedCountries) {
    if (remaining.includes(name)) {
      filter.country_id = COUNTRY_MAP[name];
      remaining = remaining.replace(name, "").trim();
      break;
    }
  }

  // Strip common filler words and check if anything meaningful is left
  const stripped = remaining
    .replace(/\b(from|in|of|the|and|or|people|persons?|profiles?|with|who|are|is)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Meaningful tokens remain but we got nothing — escalate to Gemini
  if (stripped.length > 0 && Object.keys(filter).length === 0) {
    return null;
  }

  return Object.keys(filter).length > 0 ? filter : null;
};

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Translates a natural language query into a MongoDB filter object.
 * Stage 1: keyword pre-parser (no API call).
 * Stage 2: Gemini (complex / ambiguous queries).
 * Returns null if uninterpretable → caller responds with 400.
 */
export const parseNaturalLanguageQuery = async (queryText) => {
  const normalized = queryText.trim().toLowerCase();

  // Stage 1 — keyword pre-parser
  const preResult = keywordPreParse(normalized);
  if (preResult !== null) {
    console.log(`[NLQ] Pre-parser resolved: ${JSON.stringify(preResult)}`);
    return preResult;
  }

  // Stage 2 — Gemini fallback
  if (!process.env.GEMINI_API_KEY) {
    console.warn("[NLQ] Gemini unavailable — GEMINI_API_KEY not set.");
    return null;
  }

  const systemPrompt = `
    You are an expert at translating natural language into MongoDB query filters.
    The database contains "Profile" documents with the following schema:
    - name: String (unique)
    - gender: String ("male", "female", "unknown")
    - gender_probability: Number (0 to 1)
    - age: Number
    - age_group: String ("child", "teenager", "adult", "senior")
    - country_id: String (ISO 2-letter code)
    - country_name: String (Full name)
    - country_probability: Number (0 to 1)
    - created_at: Date

    Age Group Definitions:
    - "child": age <= 12
    - "teenager": 13 <= age <= 19
    - "adult": 20 <= age <= 59
    - "senior": age >= 60

    Your task:
    1. Analyze the user's natural language query.
    2. Extract filters for: gender, gender_probability, age, age_group, country_id.
    3. Return ONLY a valid JSON object. No markdown, no backticks, no explanation.
    4. If uninterpretable, return {"uninterpretable": true}.

    Rulebook:
    - "young" -> { "age": { "$lt": 20 } }
    - Countries -> Resolve to 2-letter ISO code in "country_id".
    - "above X" -> { "field": { "$gt": X } }
    - "below X" -> { "field": { "$lt": X } }

    Examples:
    - "young males" -> { "gender": "male", "age": { "$lt": 20 } }
    - "females above 30" -> { "gender": "female", "age": { "$gt": 30 } }
    - "people from nigeria" -> { "country_id": "NG" }
    - "adult males from kenya" -> { "gender": "male", "age_group": "adult", "country_id": "KE" }

    User Query: "${queryText}"
  `;

  try {
    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    let text = response.text().trim().replace(/```(?:json)?/g, "").trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[NLQ] Gemini returned no parseable JSON.");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.uninterpretable || Object.keys(parsed).length === 0) {
      return null;
    }

    console.log(`[NLQ] Gemini resolved: ${JSON.stringify(parsed)}`);
    return parsed;
  } catch (error) {
    console.error("[NLQ] Gemini error:", error.message);
    return null;
  }
};
