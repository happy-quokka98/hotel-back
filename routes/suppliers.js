import { Router } from "express";
import { Supplier } from "../models/Supplier.js";
import { User } from "../models/User.js";
import { Feedback } from "../models/Feedback.js";
import { requireRoles } from "../middleware/roleMiddleware.js";

const router = Router();
const allowed = ['PurchasingOfficer', 'GM', 'FinanceController', 'Storekeeper', 'DeptHead', 'ApartmentUser'];

router.get("/", requireRoles(allowed), async (req, res) => {
  try {
    const suppliers = await Supplier.find({ active: true }).sort('name');
    const supplierIds = suppliers.map(s => s._id);
    const feedbacks = await Feedback.find({ supplier: { $in: supplierIds } });
    
    // Map feedbacks per supplier
    const result = suppliers.map(s => {
      const sFeedbacks = feedbacks.filter(f => String(f.supplier) === String(s._id));
      const count = sFeedbacks.length;
      let delivery_avg = 0, quality_avg = 0, product_avg = 0, overall_avg = 0;
      if (count > 0) {
        delivery_avg = sFeedbacks.reduce((acc, f) => acc + f.delivery_rating, 0) / count;
        quality_avg = sFeedbacks.reduce((acc, f) => acc + f.quality_rating, 0) / count;
        product_avg = sFeedbacks.reduce((acc, f) => acc + f.product_rating, 0) / count;
        overall_avg = (delivery_avg + quality_avg + product_avg) / 3;
      }
      return {
        ...s.toObject(),
        feedback_count: count,
        ratings: {
          delivery: Number(delivery_avg.toFixed(1)),
          quality: Number(quality_avg.toFixed(1)),
          product: Number(product_avg.toFixed(1)),
          overall: Number(overall_avg.toFixed(1)),
        }
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", requireRoles(allowed), async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    const user = await User.findOne({ supplier: supplier._id, active: true });
    
    const sFeedbacks = await Feedback.find({ supplier: supplier._id }).sort({ createdAt: -1 });
    const count = sFeedbacks.length;
    let delivery_avg = 0, quality_avg = 0, product_avg = 0, overall_avg = 0;
    if (count > 0) {
      delivery_avg = sFeedbacks.reduce((acc, f) => acc + f.delivery_rating, 0) / count;
      quality_avg = sFeedbacks.reduce((acc, f) => acc + f.quality_rating, 0) / count;
      product_avg = sFeedbacks.reduce((acc, f) => acc + f.product_rating, 0) / count;
      overall_avg = (delivery_avg + quality_avg + product_avg) / 3;
    }
    
    res.json({
      ...supplier.toObject(),
      username: user ? user.username : "",
      password: user ? user.password : "",
      feedback_count: count,
      ratings: {
        delivery: Number(delivery_avg.toFixed(1)),
        quality: Number(quality_avg.toFixed(1)),
        product: Number(product_avg.toFixed(1)),
        overall: Number(overall_avg.toFixed(1)),
      },
      feedbacks: sFeedbacks,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id/blacklist", requireRoles(allowed), async (req, res) => {
  try {
    const { is_blacklisted, blacklist_reason } = req.body;
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      {
        is_blacklisted: !!is_blacklisted,
        blacklist_reason: is_blacklisted ? (blacklist_reason || "მიზეზი არ არის მითითებული") : "",
        blacklisted_at: is_blacklisted ? new Date() : null,
      },
      { new: true }
    );
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    res.json(supplier);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/feedback", requireRoles(allowed), async (req, res) => {
  try {
    const { delivery_rating, quality_rating, product_rating, comment, created_by, author_name } = req.body;
    const feedback = new Feedback({
      supplier: req.params.id,
      created_by,
      author_name: author_name || "მომხმარებელი",
      delivery_rating: Number(delivery_rating) || 5,
      quality_rating: Number(quality_rating) || 5,
      product_rating: Number(product_rating) || 5,
      comment,
    });
    await feedback.save();
    res.status(201).json(feedback);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/:id/feedback", requireRoles(allowed), async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ supplier: req.params.id }).sort({ createdAt: -1 });
    res.json(feedbacks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", requireRoles(['PurchasingOfficer', 'GM']), async (req, res) => {
  try {
    const supplier = new Supplier({
      ...req.body,
      preferred: req.body.preferred ? true : false,
    });
    await supplier.save();
    
    if (req.body.username && req.body.password) {
      const user = new User({
        username: req.body.username,
        password: req.body.password,
        full_name: req.body.contact_person || req.body.name,
        role: "Supplier",
        supplier: supplier._id,
        active: true,
      });
      await user.save();
    }
    
    res.status(201).json({ id: supplier._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", requireRoles(['PurchasingOfficer', 'GM']), async (req, res) => {
  try {
    const data = {
      ...req.body,
      preferred: req.body.preferred ? true : false,
    };
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });

    if (req.body.username && req.body.password) {
      let user = await User.findOne({ supplier: req.params.id });
      if (user) {
        user.username = req.body.username;
        user.password = req.body.password;
        user.full_name = req.body.contact_person || req.body.name;
        user.active = true;
        await user.save();
      } else {
        user = new User({
          username: req.body.username,
          password: req.body.password,
          full_name: req.body.contact_person || req.body.name,
          role: "Supplier",
          supplier: req.params.id,
          active: true,
        });
        await user.save();
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", requireRoles(['PurchasingOfficer', 'GM']), async (req, res) => {
  try {
    await Supplier.findByIdAndUpdate(req.params.id, { active: false });
    await User.findOneAndUpdate({ supplier: req.params.id }, { active: false });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
