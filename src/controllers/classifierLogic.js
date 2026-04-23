import axios from "axios";
import { v7 as uuidv7 } from "uuid";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json" with { type: "json" };
import Profile from "../model/profile.js";
import { parseNaturalLanguageQuery } from "../services/nlqService.js";
import { sendError, sendPaginatedSuccess, sendValidationError } from "../utils/apiResponses.js";

countries.registerLocale(enLocale);

const getAgeGroup = (age) => {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
};

const validateName = (name) => {
  if (!name || typeof name !== 'string' || name.trim() === "") {
    return { valid: false, message: "Missing or empty name" };
  }
  if (!/^[a-zA-Z\s-]+$/.test(name.trim())) {
    return { valid: false, message: "Name must contain only letters" };
  }
  return { valid: true };
};

const calculateConfidence = (genderProb, countryProb) => {
  return genderProb >= 0.7 && countryProb >= 0.3;
};

const buildValidationDetails = (field, message, value) => {
  return [{ field, message, value }];
};

const parsePositiveIntegerParam = (value, field, defaultValue, maxValue = Number.POSITIVE_INFINITY) => {
  if (value === undefined) {
    return { value: defaultValue };
  }

  const normalized = String(value).trim();

  if (!/^\d+$/.test(normalized)) {
    return {
      error: {
        message: `Invalid ${field}`,
        details: buildValidationDetails(field, `${field} must be a positive integer`, value),
      },
    };
  }

  const parsedValue = Number.parseInt(normalized, 10);

  if (parsedValue < 1) {
    return {
      error: {
        message: `Invalid ${field}`,
        details: buildValidationDetails(field, `${field} must be greater than or equal to 1`, value),
      },
    };
  }

  return { value: Math.min(parsedValue, maxValue) };
};

export const createProfile = async (req, res) => {
  const { name } = req.body;
  const validation = validateName(name);

  if (!validation.valid) {
    return sendError(res, 400, {
      message: validation.message,
      error: "Invalid request body",
      code: "INVALID_PROFILE_NAME",
      details: buildValidationDetails("name", validation.message, name),
    });
  }

  try {
    const nameLower = name.trim().toLowerCase();
    const existingProfile = await Profile.findOne({ name: nameLower });
    if (existingProfile) {
      return res.status(409).json({ 
        status: "error", 
        message: "Profile already exists", 
        data: existingProfile 
      });
    }

    const [genderRes, ageRes, nationRes] = await Promise.all([
      axios.get(`https://api.genderize.io?name=${nameLower}`),
      axios.get(`https://api.agify.io?name=${nameLower}`),
      axios.get(`https://api.nationalize.io?name=${nameLower}`),
    ]);

    if (!genderRes.data.gender || genderRes.data.count === 0) {
      return res.status(502).json({
        status: "error",
        message: "Genderize returned an invalid response",
      });
    }
    if (ageRes.data.age === null) {
      return res.status(502).json({
        status: "error",
        message: "Agify returned an invalid response",
      });
    }
    if (!nationRes.data.country || nationRes.data.country.length === 0) {
      return res.status(502).json({
        status: "error",
        message: "Nationalize returned an invalid response",
      });
    }

    const topCountry = nationRes.data.country.reduce((prev, current) => 
      (prev.probability > current.probability) ? prev : current
    );

    const newProfile = new Profile({
      _id: uuidv7(),
      name: nameLower,
      gender: genderRes.data.gender,
      gender_probability: genderRes.data.probability,
      sample_size: genderRes.data.count,
      age: ageRes.data.age,
      age_group: getAgeGroup(ageRes.data.age),
      country_id: topCountry.country_id,
      country_name: countries.getName(topCountry.country_id, "en") || "Unknown",
      country_probability: topCountry.probability,
      is_confident: calculateConfidence(genderRes.data.probability, topCountry.probability),
    });

    const savedProfile = await newProfile.save();
    return res.status(201).json({ 
      status: "success", 
      data: savedProfile 
    });
  } catch (error) {
    console.log(error);
    return res.status(502).json({ 
      status: "error", 
      message: "Upstream or server failure" 
    });
  }
};

export const getProfiles = async (req, res) => {
  let { 
    name, gender, country_id, age_group, 
    q, sort_by, sortBy, order = "desc",
    min_gender_probability, min_country_probability,
    gender_probability, country_probability
  } = req.query;
  let page;
  let limit;

  // Standardization: Use sort_by as primary
  const finalSortBy = sort_by || sortBy || "created_at";
  const finalOrder = order?.toLowerCase() || "desc";

  // Find-or-Create Logic (if name is provided)
  if (name !== undefined) {
    const validation = validateName(name);
    if (!validation.valid) {
      return sendValidationError(
        res,
        validation.message,
        buildValidationDetails("name", validation.message, name),
      );
    }

    try {
      const nameLower = name.trim().toLowerCase();
      let profile = await Profile.findOne({ name: nameLower });
      
      if (profile) {
        return res.status(200).json({ status: "success", data: profile });
      }

      const [genderRes, ageRes, nationRes] = await Promise.all([
        axios.get(`https://api.genderize.io?name=${nameLower}`),
        axios.get(`https://api.agify.io?name=${nameLower}`),
        axios.get(`https://api.nationalize.io?name=${nameLower}`),
      ]);

      if (!genderRes.data.gender || genderRes.data.count === 0) {
        return res.status(200).json({
          status: "success",
          data: { name: nameLower, is_confident: false, message: "Insufficient data" }
        });
      }

      const topCountry = nationRes.data.country.reduce((prev, current) => 
        (prev.probability > current.probability) ? prev : current
      ) || { country_id: "Unknown", probability: 0 };

      profile = new Profile({
        _id: uuidv7(),
        name: nameLower,
        gender: genderRes.data.gender,
        gender_probability: genderRes.data.probability,
        sample_size: genderRes.data.count,
        age: ageRes.data.age || 0,
        age_group: getAgeGroup(ageRes.data.age || 0),
        country_id: topCountry.country_id,
        country_name: countries.getName(topCountry.country_id, "en") || "Unknown",
        country_probability: topCountry.probability,
        is_confident: calculateConfidence(genderRes.data.probability, topCountry.probability),
      });

      await profile.save();
      return res.status(200).json({ status: "success", data: profile });
    } catch (error) {
      console.error(error);
      return res.status(502).json({ status: "error", message: "External API failure" });
    }
  }

  // Validation & Sanitization
  const parsedPage = parsePositiveIntegerParam(req.query.page, "page", 1);
  if (parsedPage.error) {
    return sendValidationError(res, parsedPage.error.message, parsedPage.error.details);
  }

  const parsedLimit = parsePositiveIntegerParam(req.query.limit, "limit", 10, 50);
  if (parsedLimit.error) {
    return sendValidationError(res, parsedLimit.error.message, parsedLimit.error.details);
  }

  page = parsedPage.value;
  limit = parsedLimit.value;

  const allowedSortFields = ["name", "gender", "age", "country_name", "created_at", "gender_probability", "country_probability", "id", "_id"];
  if (!allowedSortFields.includes(finalSortBy)) {
    return sendValidationError(res, `Invalid sort_by field: ${finalSortBy}`, buildValidationDetails(
      "sort_by",
      `sort_by must be one of: ${allowedSortFields.join(", ")}`,
      finalSortBy,
    ));
  }

  if (!["asc", "desc"].includes(finalOrder)) {
    return sendValidationError(res, "Order must be 'asc' or 'desc'", buildValidationDetails(
      "order",
      "order must be either 'asc' or 'desc'",
      order,
    ));
  }

  let filter = {};

  // Step 1: Apply NLQ if 'q' is present
  if (q) {
    try {
      const nlqFilter = await parseNaturalLanguageQuery(q);
      if (nlqFilter === null) {
        return sendValidationError(
          res,
          "Uninterpretable query",
          buildValidationDetails("q", "Unable to interpret the natural language query", q),
        );
      }
      filter = { ...nlqFilter };
      console.log(`Parsed NLQ Filter: ${JSON.stringify(filter)}`);
    } catch (err) {
      console.error("NLQ parse logic error:", err);
      return sendError(res, 400, {
        message: "Failed to parse natural language query",
        error: "Internal NLQ error",
        code: "NLQ_PARSE_ERROR",
        details: buildValidationDetails("q", "Natural language query parsing failed", q),
      });
    }
  }

  // Step 2: Combine with manual filters (Manual filters override OR complement NLQ)
  if (gender) filter.gender = gender.toLowerCase();
  if (country_id) filter.country_id = country_id.toUpperCase();
  if (age_group) filter.age_group = age_group.toLowerCase();

  // Step 3: Probability Thresholds (Support both min_ and direct names)
  const gProb = min_gender_probability || gender_probability;
  const cProb = min_country_probability || country_probability;

  if (gProb && !isNaN(parseFloat(gProb))) {
    filter.gender_probability = { $gte: parseFloat(gProb) };
  }
  if (cProb && !isNaN(parseFloat(cProb))) {
    filter.country_probability = { $gte: parseFloat(cProb) };
  }

  try {
    const skip = (page - 1) * limit;
    const sortField = finalSortBy === "id" ? "_id" : finalSortBy;
    const sortOrderValue = finalOrder === "asc" ? 1 : -1;

    const [profiles, total] = await Promise.all([
      Profile.find(filter)
        .sort({ [sortField]: sortOrderValue })
        .skip(skip)
        .limit(limit),
      Profile.countDocuments(filter)
    ]);

    return sendPaginatedSuccess(res, {
      data: profiles,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, {
      message: "Internal server failure",
      error: "Internal server failure",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
};
