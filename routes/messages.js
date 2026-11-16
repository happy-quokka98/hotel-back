import { Router } from "express";
import Message from "../models/Message.js";

const router = Router();

// Get all messages
router.get("/", async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Post a new message
router.post("/", async (req, res) => {
  try {
    const { sender, sender_name, content } = req.body;
    if (!sender || !sender_name || !content) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const newMessage = await Message.create({ sender, sender_name, content });
    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
