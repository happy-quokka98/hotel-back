import { Router } from "express";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const sysInfo = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      serverTime: new Date()
    };
    res.json(sysInfo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
