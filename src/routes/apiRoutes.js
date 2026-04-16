import { Router } from "express";
import { createProfile, getProfiles } from "../controllers/classifierLogic.js";
import Profile from "../model/profile.js";

const apiRouter = Router();

apiRouter.post("/profiles", createProfile);
apiRouter.get("/profiles", getProfiles);

apiRouter.get("/profiles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Try finding by ID first
    let profile = await Profile.findById(id);
    
    // If not found by ID, try finding by name (case-insensitive)
    if (!profile) {
      profile = await Profile.findOne({ name: id.toLowerCase() });
    }

    if (!profile) {
      return res.status(404).json({ status: "error", message: "Profile not found" });
    }
    res.status(200).json({ status: "success", data: profile });
  } catch (error) {
    console.error(error);
    res.status(400).json({ status: "error", message: "Invalid request format" });
  }
});

apiRouter.delete("/profiles/:id", async (req, res) => {
  try {
    const result = await Profile.findByIdAndDelete(req.params.id);
    if (!result) {
      return res.status(404).json({ status: "error", message: "Profile not found" });
    }
    res.status(204).send();
  } catch (e) {
    console.log(e);
    res.status(422).json({ status: "error", message: "Invalid type" });
  }
});

export default apiRouter;
