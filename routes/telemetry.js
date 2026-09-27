const express = require("express");
const rateLimit = require("express-rate-limit");

const OutboundClick = require("../models/OutboundClick");
const User = require("../models/User");

const router = express.Router();

// Hirers are anonymous, so the endpoint is public and throttled per IP. The
// cap is high enough that a real visitor comparing several artisans is never
// blocked.
const clickLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many clicks recorded from this IP." },
});

const TYPES = ["whatsapp_click", "phone_call_click"];

// =========================
// LOG AN OUTBOUND CONTACT CLICK
// POST /api/telemetry/outbound-click
// Fire-and-forget from the WhatsApp / Call Direct buttons. Always answers
// 204 once the click is accepted so a logging failure never delays the
// visitor's jump to WhatsApp.
// =========================
router.post("/outbound-click", clickLimiter, async (req, res) => {
  try {
    const { artisanId, type, artisanTrade, targetLocationPage } = req.body || {};

    if (!TYPES.includes(type)) {
      return res.status(400).json({ message: "Unknown click type" });
    }

    const artisan = await User.findById(artisanId).select("name primaryTrade");
    if (!artisan) {
      return res.status(404).json({ message: "Professional not found" });
    }

    await OutboundClick.create({
      artisan: artisan._id,
      artisanName: artisan.name || "",
      artisanTrade: (artisanTrade || artisan.primaryTrade || "").trim(),
      targetLocationPage: String(targetLocationPage || "").slice(0, 300),
      type,
      referrer: String(req.headers.referer || "").slice(0, 300),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
      ip: req.ip || req.connection?.remoteAddress || "",
    });

    return res.status(204).end();
  } catch (err) {
    console.error("OUTBOUND CLICK ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
