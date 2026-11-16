import { Router } from "express";
import { Item } from "../models/Item.js";
import { StoreRequisition } from "../models/StoreRequisition.js";
import { PurchaseRequisition } from "../models/PurchaseRequisition.js";
import { PurchaseOrder } from "../models/PurchaseOrder.js";
import { StockMovement } from "../models/StockMovement.js";
import { GoodsReceivedNote } from "../models/GoodsReceivedNote.js";
import { Tender } from "../models/Tender.js";
import { Category } from "../models/Category.js";

import { requireRoles } from "../middleware/roleMiddleware.js";

const router = Router();
const allowed = ['Storekeeper', 'PurchasingOfficer', 'FinanceController', 'DeptHead'];

router.get("/", requireRoles(allowed), async (req, res) => {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const today = new Date();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      totalItems,
      valueAgg,
      lowStockItems,
      pendingSRF,
      pendingPR,
      openPO,
      recentMovements,
      grns,
      categories,
      categoryAgg,
      recentMovements7Days,
      activeTenders,
      pendingEvaluation,
      publishedTenders,
      recentTenders
    ] = await Promise.all([
      Item.countDocuments({ active: true }),

      Item.aggregate([
        { $match: { active: true } },
        { $group: { _id: null, total: { $sum: { $multiply: ["$current_qty", "$unit_cost"] } } } }
      ]),

      Item.find({
        active: true,
        $expr: { $lte: ["$current_qty", "$reorder_point"] }
      })
      .select('code name category current_qty reorder_point unit_of_measure location_bin unit_cost')
      .populate('category', 'name')
      .limit(100)
      .lean(),

      StoreRequisition.countDocuments({ status: 'Pending' }),
      PurchaseRequisition.countDocuments({ status: 'Pending' }),
      PurchaseOrder.countDocuments({ status: { $in: ['Draft', 'Approved', 'PartiallyReceived'] } }),

      StockMovement.find()
        .populate('item', 'code name')
        .populate('performed_by', 'full_name')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      GoodsReceivedNote.find({
        'lines.expiry_date': { $gte: today, $lte: thirtyDaysFromNow }
      }).populate('lines.item', 'code name').lean(),

      Category.find().lean(),

      Item.aggregate([
        { $match: { active: true } },
        { $group: {
            _id: "$category",
            value: { $sum: { $multiply: ["$current_qty", "$unit_cost"] } },
            item_count: { $sum: 1 }
        }}
      ]),

      StockMovement.find({
        createdAt: { $gte: sevenDaysAgo }
      }).lean(),

      Tender.countDocuments({ status: { $in: ['Draft', 'Published', 'Closed', 'Evaluation'] } }),
      Tender.countDocuments({ status: 'Evaluation' }),
      Tender.countDocuments({ status: 'Published' }),

      Tender.find()
        .populate('winner_supplier', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
    ]);

    const totalValue = valueAgg[0]?.total || 0;

    // Process expiring items
    const expiringItems = [];
    grns.forEach(g => {
      if (Array.isArray(g.lines)) {
        g.lines.forEach(l => {
          if (l.expiry_date && new Date(l.expiry_date) >= today && new Date(l.expiry_date) <= thirtyDaysFromNow) {
            expiringItems.push({
              ...l,
              item_code: l.item?.code,
              item_name: l.item?.name,
              grn_number: g.grn_number
            });
          }
        });
      }
    });

    // Build category breakdown
    const categoryMap = {};
    categories.forEach(c => {
      categoryMap[String(c._id)] = { name: c.name, value: 0, item_count: 0 };
    });

    categoryAgg.forEach(c => {
      const catId = String(c._id);
      if (categoryMap[catId]) {
        categoryMap[catId].value = c.value || 0;
        categoryMap[catId].item_count = c.item_count || 0;
      }
    });

    const categoryValues = Object.values(categoryMap);
    categoryValues.sort((a, b) => b.value - a.value);

    // Build 7-day movement trends
    const trends = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toLocaleDateString("en-US", { weekday: "short" });

      const startOfDay = new Date(d);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(d);
      endOfDay.setHours(23, 59, 59, 999);

      const dayMovements = recentMovements7Days.filter(m => {
        const mDate = new Date(m.createdAt);
        return mDate >= startOfDay && mDate <= endOfDay;
      });

      const receiptsSum = dayMovements
        .filter(m => m.movement_type === 'Receipt')
        .reduce((sum, m) => sum + (m.qty || 0), 0);

      const issuesSum = dayMovements
        .filter(m => m.movement_type === 'Issue')
        .reduce((sum, m) => sum + Math.abs(m.qty || 0), 0);

      trends.push({
        day: dStr,
        receipts: receiptsSum,
        issues: issuesSum
      });
    }

    const healthyItems = totalItems > 0 ? Math.max(0, totalItems - lowStockItems.length) : 0;
    const stockHealthPct = totalItems > 0 ? Math.round((healthyItems / totalItems) * 100) : 100;

    res.json({
      totalItems,
      totalValue,
      lowStockCount: lowStockItems.length,
      lowStockItems: lowStockItems.map(i => ({ ...i, id: i._id, category_name: i.category?.name })),
      pendingSRF,
      pendingPR,
      openPO,
      recentMovements: recentMovements.map(m => ({
        ...m,
        id: m._id,
        item_code: m.item?.code,
        item_name: m.item?.name,
        performer_name: m.performed_by?.full_name,
        date: m.createdAt
      })),
      expiringItems,
      categoryValues,
      movementTrends: trends,
      stockHealthPct,
      tenderStats: { activeTenders, pendingEvaluation, publishedTenders },
      recentTenders: recentTenders.map(t => ({ ...t, id: t._id, winner_name: t.winner_supplier?.name, date_created: t.createdAt })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
