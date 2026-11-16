import { Router } from "express";
import Activity from "../models/Activity.js";

const router = Router();

// Get all activity logs
router.get("/", async (req, res) => {
  try {
    const logs = await Activity.find().sort({ createdAt: -1 }).limit(50);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Post a new activity log
router.post("/", async (req, res) => {
  try {
    const { user, username, action, details } = req.body;
    if (!user || !username || !action) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const newLog = await Activity.create({ user, username, action, details });
    res.status(201).json(newLog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
