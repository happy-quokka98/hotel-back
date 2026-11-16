import { Router } from "express";
import { Item } from "../models/Item.js";

import { requireRoles } from "../middleware/roleMiddleware.js";

const router = Router();
const allowed = ['Storekeeper', 'PurchasingOfficer'];
const LOW_STOCK_THRESHOLD = 50;

router.get("/", requireRoles(allowed), async (req, res) => {
  try {
    const filter = { active: true, current_qty: { $lt: LOW_STOCK_THRESHOLD } };
    const count = await Item.countDocuments(filter);
    
    const items = await Item.find(filter)
      .select('code name category current_qty reorder_point unit_of_measure location_bin unit_cost')
      .populate('category', 'name')
      .sort({ current_qty: 1 })
      .limit(100)
      .lean();
    
    res.json({
      threshold: LOW_STOCK_THRESHOLD,
      count,
      items: items.map(i => ({
        ...i,
        id: i._id,
        category_name: i.category?.name
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
