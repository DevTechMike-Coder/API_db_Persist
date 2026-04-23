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
    2. Extract filters for: gender, gender_probability, age, age_group, country_id.
    3. Return ONLY a valid JSON object representing the MongoDB query.
    4. If uninterpretable, return {"uninterpretable": true}.

    Rulebook:
    - "young" -> { "age": { "$lt": 20 } } (OR { "age_group": { "$in": ["child", "teenager"] } }) - prefer age ranges.
    - Countries -> Resolve to 2-letter ISO code in "country_id".
    - "above X" -> { "field": { "$gt": X } }.
    - "below X" -> { "field": { "$lt": X } }.

    Examples:
    - "young males" -> { "gender": "male", "age": { "$lt": 20 } }
    - "females above 30" -> { "gender": "female", "age": { "$gt": 30 } }
    - "people from nigeria" -> { "country_id": "NG" }
    - "adult males from kenya" -> { "gender": "male", "age_group": "adult", "country_id": "KE" }
    - "Male and female teenagers above 17" -> { "gender": { "$in": ["male", "female"] }, "age_group": "teenager", "age": { "$gt": 17 } }

    User Query: "${queryText}"
  `;

  try {
    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    let text = response.text().trim();
    
    // Extract JSON using regex to handle potential extra text from model
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.uninterpretable || Object.keys(parsed).length === 0) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.error("NLQ Parsing Error:", error);
    return null;
  }
};
