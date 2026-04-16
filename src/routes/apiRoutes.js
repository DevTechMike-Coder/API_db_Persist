import { Router } from "express";
import { createProfile, getProfiles } from "../controllers/classifierLogic.js";
import Profile from "../model/profile.js";

const apiRouter = Router();

apiRouter.post("/profiles", createProfile);
apiRouter.get("/profiles", getProfiles);

apiRouter.get("/profiles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await Profile.findById(id);
    if (!profile) {
      return res.status(404).json({ status: "error", message: "Profile not found" });
    }
    res.status(200).json({ status: "success", data: profile });
  } catch (error) {
    console.log(error);
    res.status(422).json({ status: "error", message: "Invalid type" });
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
