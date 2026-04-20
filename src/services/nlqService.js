import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not defined in .env");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Translates a natural language query into a MongoDB filter object.
 * @param {string} queryText - The user's natural language query.
 * @returns {Promise<Object>} - The MongoDB filter object.
 */
export const parseNaturalLanguageQuery = async (queryText) => {
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

    Your task:
    1. Analyze the user's natural language query.
    2. Extract filters for any of the fields mentioned above.
    3. Return ONLY a valid JSON object represents the MongoDB query (e.g., used in Profile.find(filter)).
    4. Do not include any explanation or markdown formatting in your response. Just the JSON.
    5. Handle ranges (e.g., "older than 20" -> { age: { $gt: 20 } }).
    6. Handle approximate matches for names if necessary, but prioritizes exact fields.
    7. For countries, if a full name is given, try to resolve it to country_id or use country_name.

    Example:
    Query: "women from Nigeria older than 30"
    Response: { "gender": "female", "country_id": "NG", "age": { "$gt": 30 } }

    Example:
    Query: "all adults sorted by name" (Ignore sorting in this filter object, just return filters. Sorting is handled elsewhere.)
    Response: { "age_group": "adult" }

    User Query: "${queryText}"
  `;

  try {
    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    let text = response.text().trim();
    
    // Remove potential markdown code blocks
    if (text.startsWith("```")) {
      text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    }

    return JSON.parse(text);
  } catch (error) {
    console.error("NLQ Parsing Error:", error);
    return {}; // Return empty filter on failure
  }
};
