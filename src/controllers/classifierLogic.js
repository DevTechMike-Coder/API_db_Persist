import axios from "axios";
import { v7 as uuidv7 } from "uuid";
import Profile from "../model/profile.js";

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
  // A simple heuristic: both probabilities should be decent
  return genderProb >= 0.7 && countryProb >= 0.3;
};

export const createProfile = async (req, res) => {
  const { name } = req.body;
  const validation = validateName(name);

  if (!validation.valid) {
    return res.status(400).json({ status: "error", message: validation.message });
  }

  try {
    const nameLower = name.trim().toLowerCase();
    const existingProfile = await Profile.findOne({ name: nameLower });
    if (existingProfile) {
      return res.status(200).json({ 
        status: "success", 
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
      country_probability: topCountry.probability,
      is_confident: calculateConfidence(genderRes.data.probability, topCountry.probability),
      created_at: new Date().toISOString()
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
  const { name, gender, country_id, age_group } = req.query;

  // If name is provided, treat it as a "Find or Create" request
  if (name !== undefined) {
    const validation = validateName(name);
    if (!validation.valid) {
      return res.status(400).json({ status: "error", message: validation.message });
    }

    try {
      const nameLower = name.trim().toLowerCase();
      let profile = await Profile.findOne({ name: nameLower });
      
      if (profile) {
        return res.status(200).json({ status: "success", data: profile });
      }

      // If not found, we redirect the logic to creation (internal call or refactored)
      // For now, let's just implement the classification here or call createProfile
      // But express controllers aren't easily called from each other with res.
      // So we'll just implement the logic.
      
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
        country_probability: topCountry.probability,
        is_confident: calculateConfidence(genderRes.data.probability, topCountry.probability),
        created_at: new Date().toISOString()
      });

      await profile.save();
      return res.status(200).json({ status: "success", data: profile });
    } catch (error) {
      console.error(error);
      return res.status(502).json({ status: "error", message: "External API failure" });
    }
  }

  const filter = {};
  if (gender) filter.gender = gender.toLowerCase();
  if (country_id) filter.country_id = country_id.toUpperCase();
  if (age_group) filter.age_group = age_group.toLowerCase();

  try {
    const profiles = await Profile.find(filter);
    res.status(200).json({
      status: "success",
      count: profiles.length,
      data: profiles
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "error", message: "Internal server failure" });
  }
};
