import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash-latest";
let geminiModel;

// ─── Keyword Pre-Parser ───────────────────────────────────────────────────────
// Handles all documented NLQ examples natively — no Gemini call needed.
// Covers: gender, multi-gender, age groups, age ranges ("above/below N"),
// "young" shorthand, country names → ISO codes.

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
  morocco: "MA", algeria: "DZ", tunisia: "TN", libya: "LY",
  sudan: "SD", somalia: "SO", mali: "ML", niger: "NE",
  "new zealand": "NZ", ireland: "IE", switzerland: "CH", austria: "AT",
  belgium: "BE", "czech republic": "CZ", hungary: "HU", romania: "RO",
  greece: "GR", serbia: "RS", croatia: "HR",
};

const AGE_GROUP_KEYWORDS = {
  child: "child", children: "child", kids: "child", kid: "child",
  teen: "teenager", teens: "teenager", teenager: "teenager", teenagers: "teenager",
  adult: "adult", adults: "adult",
  senior: "senior", seniors: "senior", elderly: "senior",
};

// Filler words to strip before deciding if remaining tokens are unrecognised
const FILLER = /\b(from|in|of|the|and|or|people|persons?|profiles?|with|who|are|is|a|an|some|all|both|male|males|female|females|man|men|woman|women|above|below|over|under|young|old|older|younger|than)\b/g;
const SORTED_COUNTRIES = Object.keys(COUNTRY_MAP).sort((a, b) => b.length - a.length);
const COMMON_QUERY_WORDS = new Set([
  "male", "males", "female", "females", "man", "men", "woman", "women",
  "boy", "boys", "girl", "girls", "young", "old", "older", "younger",
  "child", "children", "kid", "kids", "teen", "teens", "teenager", "teenagers",
  "adult", "adults", "senior", "seniors", "elderly", "people", "person",
  "profile", "profiles", "from", "in", "of", "and", "or", "both",
  "above", "below", "over", "under", "than",
]);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeQueryText = (queryText) => {
  return String(queryText ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const mergeAgeFilter = (existingAgeFilter, update) => {
  return { ...(existingAgeFilter || {}), ...update };
};

export const isObviouslyUninterpretableQuery = (text) => {
  if (!text) {
    return true;
  }

  if (SORTED_COUNTRIES.some((countryName) => text.includes(countryName))) {
    return false;
  }

  const tokens = text.match(/[a-z]+/g) || [];
  if (tokens.length === 0) {
    return true;
  }

  if (tokens.some((token) => COMMON_QUERY_WORDS.has(token) || AGE_GROUP_KEYWORDS[token])) {
    return false;
  }

  const compactText = tokens.join("");
  const vowelCount = (compactText.match(/[aeiou]/g) || []).length;

  if (tokens.length === 1 && compactText.length >= 6 && vowelCount <= 1) {
    return true;
  }

  return compactText.length >= 8 && vowelCount / compactText.length < 0.2;
};

const getGeminiModel = () => {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  if (!geminiModel) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: DEFAULT_GEMINI_MODEL });
  }

  return geminiModel;
};

const generateContentWithGemini = async (prompt) => {
  const model = getGeminiModel();

  if (!model) {
    return null;
  }

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text().trim();
};

/**
 * Attempts to resolve a query purely from keyword matching.
 * Returns a filter object on success, null to escalate to Gemini.
 */
export const keywordPreParse = (text) => {
  const filter = {};
  let remaining = text;

  // ── 1. Gender (single or multi) ──────────────────────────────────────────
  const hasMale   = /\b(males?|men|man|boys?)\b/.test(remaining);
  const hasFemale = /\b(females?|women|woman|girls?)\b/.test(remaining);

  if (hasMale && hasFemale) {
    filter.gender = { $in: ["male", "female"] };
  } else if (hasMale) {
    filter.gender = "male";
  } else if (hasFemale) {
    filter.gender = "female";
  }

  if (hasMale)   remaining = remaining.replace(/\b(males?|men|man|boys?)\b/g, " ");
  if (hasFemale) remaining = remaining.replace(/\b(females?|women|woman|girls?)\b/g, " ");
  remaining = remaining.trim();

  // ── 2. "young" shorthand → age < 20 ─────────────────────────────────────
  if (/\byoung\b/.test(remaining)) {
    filter.age = mergeAgeFilter(filter.age, { $lt: 20 });
    remaining = remaining.replace(/\byoung\b/g, "").trim();
  }

  // ── 3. Age group keywords ─────────────────────────────────────────────────
  for (const [keyword, group] of Object.entries(AGE_GROUP_KEYWORDS)) {
    const re = new RegExp(`\\b${keyword}\\b`);
    if (re.test(remaining)) {
      filter.age_group = group;
      remaining = remaining.replace(re, "").trim();
      break;
    }
  }

  // ── 4. Numeric age range: "above/over N" or "below/under N" ──────────────
  const aboveMatch = remaining.match(/\b(?:above|over|older than|greater than)\s+(\d+)\b/);
  const belowMatch = remaining.match(/\b(?:below|under|younger than|less than)\s+(\d+)\b/);

  if (aboveMatch) {
    filter.age = mergeAgeFilter(filter.age, { $gt: Number.parseInt(aboveMatch[1], 10) });
    remaining = remaining.replace(aboveMatch[0], "").trim();
  }
  if (belowMatch) {
    filter.age = mergeAgeFilter(filter.age, { $lt: Number.parseInt(belowMatch[1], 10) });
    remaining = remaining.replace(belowMatch[0], "").trim();
  }

  // ── 5. Country — longest match first ─────────────────────────────────────
  for (const name of SORTED_COUNTRIES) {
    const countryRegex = new RegExp(`\\b${escapeRegex(name)}\\b`);
    if (countryRegex.test(remaining)) {
      filter.country_id = COUNTRY_MAP[name];
      remaining = remaining.replace(countryRegex, "").trim();
      break;
    }
  }

  // ── 6. Decide: escalate to Gemini if meaningful tokens remain unresolved ──
  const unresolved = remaining
    .replace(FILLER, "")
    .replace(/\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Nothing was matched at all and there are unresolved tokens → Gemini
  if (Object.keys(filter).length === 0 && unresolved.length > 0) {
    return null;
  }

  // Something was matched → return what we have (Gemini can handle edge cases)
  return Object.keys(filter).length > 0 ? filter : null;
};

// ─── Gemini field allowlist ───────────────────────────────────────────────────
// Reject Gemini responses that contain fields outside the known schema.
// This prevents hallucinated filters from being applied.
const ALLOWED_FILTER_KEYS = new Set([
  "gender", "gender_probability", "age", "age_group",
  "country_id", "country_name", "country_probability",
  "name", "is_confident", "created_at",
]);

const isValidFilter = (obj) => {
  if (!obj || typeof obj !== "object") return false;
  return Object.keys(obj).every((k) => ALLOWED_FILTER_KEYS.has(k));
};

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Translates a natural language query into a MongoDB filter object.
 * Stage 1: keyword pre-parser (no API call — handles all documented examples).
 * Stage 2: Gemini (complex / ambiguous queries not covered by pre-parser).
 * Returns null → caller sends 400 Uninterpretable query.
 */
export const parseNaturalLanguageQuery = async (queryText, options = {}) => {
  const normalized = normalizeQueryText(queryText);

  if (!normalized) {
    return null;
  }

  // Stage 1 — keyword pre-parser
  const preResult = keywordPreParse(normalized);
  if (preResult !== null) {
    console.log(`[NLQ] Pre-parser resolved: ${JSON.stringify(preResult)}`);
    return preResult;
  }

  if (isObviouslyUninterpretableQuery(normalized)) {
    return null;
  }

  // Stage 2 — Gemini fallback
  const generateContent = options.generateContentFn || generateContentWithGemini;
  if (!process.env.GEMINI_API_KEY && !options.generateContentFn) {
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
    4. If the query is completely uninterpretable (random characters, nonsense), return {"uninterpretable": true}.

    Rulebook:
    - "young" -> { "age": { "$lt": 20 } }
    - Countries -> Resolve to 2-letter ISO code in "country_id".
    - "above X" / "over X" -> { "age": { "$gt": X } }
    - "below X" / "under X" -> { "age": { "$lt": X } }
    - Multiple genders -> { "gender": { "$in": ["male", "female"] } }

    Examples:
    - "young males" -> { "gender": "male", "age": { "$lt": 20 } }
    - "females above 30" -> { "gender": "female", "age": { "$gt": 30 } }
    - "people from nigeria" -> { "country_id": "NG" }
    - "adult males from kenya" -> { "gender": "male", "age_group": "adult", "country_id": "KE" }
    - "Male and female teenagers above 17" -> { "gender": { "$in": ["male", "female"] }, "age_group": "teenager", "age": { "$gt": 17 } }

    User Query: "${queryText}"
  `;

  try {
    const rawText = await generateContent(systemPrompt);
    if (!rawText) {
      return null;
    }

    const text = rawText.replace(/```(?:json)?/g, "").trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[NLQ] Gemini returned no parseable JSON.");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.uninterpretable || Object.keys(parsed).length === 0) {
      return null;
    }

    // Reject hallucinated fields not in our schema
    if (!isValidFilter(parsed)) {
      console.warn("[NLQ] Gemini returned unknown fields:", Object.keys(parsed));
      return null;
    }

    console.log(`[NLQ] Gemini resolved: ${JSON.stringify(parsed)}`);
    return parsed;
  } catch (error) {
    console.error("[NLQ] Gemini error:", error.message);
    return null;
  }
};
