import assert from "node:assert/strict";
import test from "node:test";
import {
  isObviouslyUninterpretableQuery,
  parseNaturalLanguageQuery,
} from "../src/services/nlqService.js";

test("parseNaturalLanguageQuery resolves the documented phrases without Gemini", async () => {
  const cases = [
    ["young males", { gender: "male", age: { $lt: 20 } }],
    ["females above 30", { gender: "female", age: { $gt: 30 } }],
    ["people from nigeria", { country_id: "NG" }],
    ["adult males from kenya", { gender: "male", age_group: "adult", country_id: "KE" }],
    [
      "Male and female teenagers above 17",
      { gender: { $in: ["male", "female"] }, age_group: "teenager", age: { $gt: 17 } },
    ],
  ];

  for (const [query, expected] of cases) {
    const result = await parseNaturalLanguageQuery(query, {
      generateContentFn: async () => {
        throw new Error("Gemini fallback should not be used for documented phrases");
      },
    });

    assert.deepEqual(result, expected);
  }
});

test("parseNaturalLanguageQuery rejects obvious nonsense locally", async () => {
  let geminiWasCalled = false;

  const result = await parseNaturalLanguageQuery("asdfghjkl", {
    generateContentFn: async () => {
      geminiWasCalled = true;
      return '{"country_id":"NG"}';
    },
  });

  assert.equal(isObviouslyUninterpretableQuery("asdfghjkl"), true);
  assert.equal(geminiWasCalled, false);
  assert.equal(result, null);
});
