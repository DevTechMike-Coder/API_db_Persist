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

    Age Group Definitions:
    - "child": age <= 12
    - "teenager": 13 <= age <= 19
    - "adult": 20 <= age <= 59
    - "senior": age >= 60

    Your task:
    1. Analyze the user's natural language query.
    2. Extract filters for any of the fields mentioned above.
    3. Return ONLY a valid JSON object representing the MongoDB query.
    4. If the query is ambiguous or uninterpretable, return {"uninterpretable": true}.
    5. Handle terms like "young" as { "age_group": "teenager" } or { "age": { "$lt": 20 } } (prefer discrete groups if possible).
    6. Handle terms like "females above 30" as { "gender": "female", "age": { "$gt": 30 } }.
    7. For countries like "Nigeria", return { "country_id": "NG" }.

    Example:
    Query: "young males"
    Response: { "gender": "male", "age_group": "teenager" }

    Example:
    Query: "women from Nigeria older than 30"
    Response: { "gender": "female", "country_id": "NG", "age": { "$gt": 30 } }

    User Query: "${queryText}"
  `;

  try {
    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    let text = response.text().trim();
    
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    const parsed = JSON.parse(text);
    if (parsed.uninterpretable) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.error("NLQ Parsing Error:", error);
    return null;
  }
};
