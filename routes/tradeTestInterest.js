const express = require("express");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

const TradeTestInterest = require("../models/TradeTestInterest");
const User = require("../models/User");
const auth = require("../middleware/auth");
const role = require("../middleware/role");

const router = express.Router();

const STATUSES = ["new", "shared", "closed"];

const interestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests from this IP. Please try again later." },
});

const optionalViewerId = async (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;

  try {
    const decoded = jwt.verify(header.replace("Bearer ", ""), process.env.JWT_SECRET);
    const id = decoded.user?.id || decoded.id;
    const user = id ? await User.findById(id).select("_id") : null;
    return user?._id || null;
  } catch (err) {
    return null;
  }
};

const clean = (value, max = 120) => String(value || "").trim().slice(0, max);

// =========================
// POST /api/trade-test-interest  (public)
// =========================
router.post("/", interestLimiter, async (req, res) => {
  try {
    const name = clean(req.body.name);
    const phone = clean(req.body.phone, 30);
    const trade = clean(req.body.trade);
    const area = clean(req.body.area);
    const note = clean(req.body.note, 500);

    if (!name) return res.status(400).json({ message: "Your name is required" });
    if (phone.replace(/\D/g, "").length < 8) {
      return res.status(400).json({ message: "A valid phone number is required" });
    }
    if (!trade) return res.status(400).json({ message: "Tell us your trade" });
    if (req.body.consent !== true) {
      return res.status(400).json({
        message: "Please agree to us sharing your details with the trade test office",
      });
    }

    await TradeTestInterest.create({
      name,
      phone,
      trade,
      area,
      note,
      consentAt: new Date(),
      user: await optionalViewerId(req),
    });

    res.status(201).json({
      message:
        "Thank you. We'll pass your details to the Federal Trade Test office, and they or CraftBridge will contact you about dates, requirements and fees.",
    });
  } catch (err) {
    console.error("TRADE TEST INTEREST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// GET /api/trade-test-interest  (admin)
// =========================
router.get("/", auth, role("admin"), async (req, res) => {
  try {
    const filter = STATUSES.includes(req.query.status) ? { status: req.query.status } : {};
    const interests = await TradeTestInterest.find(filter).sort({ createdAt: -1 }).limit(1000);
    res.json({ interests });
  } catch (err) {
    console.error("TRADE TEST INTEREST LIST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// PATCH /api/trade-test-interest/:id  (admin)
// =========================
router.patch("/:id", auth, role("admin"), async (req, res) => {
  try {
    if (!STATUSES.includes(req.body.status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const interest = await TradeTestInterest.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    if (!interest) return res.status(404).json({ message: "Not found" });
    res.json({ interest });
  } catch (err) {
    console.error("TRADE TEST INTEREST UPDATE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
