import assert from "node:assert/strict";
import test from "node:test";
import { getProfiles } from "../src/controllers/classifierLogic.js";
import Profile from "../src/model/profile.js";

const createMockResponse = () => {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
};

const mockProfileQueries = (t, { data = [], total = data.length } = {}) => {
  const originalFind = Profile.find;
  const originalCountDocuments = Profile.countDocuments;
  const state = {};

  Profile.find = (filter) => {
    state.filter = filter;

    return {
      sort(sortArg) {
        state.sortArg = sortArg;
        return this;
      },
      skip(skipArg) {
        state.skipArg = skipArg;
        return this;
      },
      limit(limitArg) {
        state.limitArg = limitArg;
        return Promise.resolve(data);
      },
    };
  };

  Profile.countDocuments = async (filter) => {
    state.countFilter = filter;
    return total;
  };

  t.after(() => {
    Profile.find = originalFind;
    Profile.countDocuments = originalCountDocuments;
  });

  return state;
};

test("getProfiles returns a dedicated pagination envelope for page=1&limit=5", async (t) => {
  const profiles = Array.from({ length: 5 }, (_, index) => ({ id: String(index + 1) }));
  const state = mockProfileQueries(t, { data: profiles, total: 12 });
  const res = createMockResponse();

  await getProfiles({ query: { page: "1", limit: "5" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(state.skipArg, 0);
  assert.equal(state.limitArg, 5);
  assert.equal(res.payload.page, 1);
  assert.equal(res.payload.limit, 5);
  assert.equal(res.payload.total, 12);
  assert.equal(res.payload.pages, 3);
  assert.equal(res.payload.current_page, 1);
  assert.equal(res.payload.total_pages, 3);
  assert.equal(res.payload.pagination.page, 1);
  assert.equal(res.payload.pagination.limit, 5);
  assert.equal(res.payload.pagination.total, 12);
  assert.equal(res.payload.pagination.pages, 3);
  assert.equal(res.payload.pagination.has_previous_page, false);
  assert.equal(res.payload.pagination.has_next_page, true);
  assert.equal(res.payload.pagination.previous_page, null);
  assert.equal(res.payload.pagination.next_page, 2);
  assert.equal(res.payload.data.length, 5);
});

test("getProfiles returns a validation envelope for an uninterpretable q value", async () => {
  const res = createMockResponse();

  await getProfiles({ query: { q: "asdfghjkl" } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.status, "error");
  assert.equal(res.payload.message, "Uninterpretable query");
  assert.equal(res.payload.error, "Invalid query parameters");
  assert.equal(res.payload.code, "INVALID_QUERY_PARAMETERS");
  assert.deepEqual(res.payload.details, [
    {
      field: "q",
      message: "Unable to interpret the natural language query",
      value: "asdfghjkl",
    },
  ]);
});

test("getProfiles rejects non-numeric page values instead of coercing them", async () => {
  const res = createMockResponse();

  await getProfiles({ query: { page: "1abc" } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, "Invalid query parameters");
  assert.equal(res.payload.code, "INVALID_QUERY_PARAMETERS");
  assert.deepEqual(res.payload.details, [
    {
      field: "page",
      message: "page must be a positive integer",
      value: "1abc",
    },
  ]);
});

for (const [query, expectedFilter] of [
  ["young males", { gender: "male", age: { $lt: 20 } }],
  ["females above 30", { gender: "female", age: { $gt: 30 } }],
  ["people from nigeria", { country_id: "NG" }],
  ["adult males from kenya", { gender: "male", age_group: "adult", country_id: "KE" }],
  [
    "Male and female teenagers above 17",
    { gender: { $in: ["male", "female"] }, age_group: "teenager", age: { $gt: 17 } },
  ],
]) {
  test(`getProfiles applies the expected NLQ filter for "${query}"`, async (t) => {
    const state = mockProfileQueries(t, { data: [], total: 0 });
    const res = createMockResponse();

    await getProfiles({ query: { q: query } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(state.filter, expectedFilter);
    assert.deepEqual(state.countFilter, expectedFilter);
  });
}
