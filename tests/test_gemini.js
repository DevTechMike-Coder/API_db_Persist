import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

async function testModel(modelName) {
  console.log(`\n🔍 testing model: ${modelName}`);
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent("Return exactly this JSON: { \"status\": \"ok\" }");
    const response = await result.response;
    console.log(`✅ Success with ${modelName}:`, response.text());
    return true;
  } catch (err) {
    console.error(`❌ Failed with ${modelName}:`, err.message);
    return false;
  }
}

async function runDiagnostics() {
  const models = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-pro"];
  for (const m of models) {
    const ok = await testModel(m);
    if (ok) break;
  }
  
  // Test the actual logic if one model worked
  console.log("\n--- Testing Actual NLQ Prompt Logic ---");
  const query = "young males from Nigeria";
  const systemPrompt = `
    Return ONLY a JSON object for MongoDB filter.
    Schema: gender, country_id, age_group
    Query: "${query}"
  `;
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(systemPrompt);
    console.log("Response for 'young males from Nigeria':", (await result.response).text());
  } catch (e) {
    console.log("Could not run logic test.");
  }
}

runDiagnostics();
