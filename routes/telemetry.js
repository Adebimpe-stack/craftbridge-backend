const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");

const auth = require("../middleware/auth");
const OutboundClick = require("../models/OutboundClick");
const User = require("../models/User");
const { normalisePhone } = require("../utils/sendSms");
const {
  whatsappLink,
  callLink,
  contactSource,
  contactMessage,
} = require("../utils/localSeo");

const router = express.Router();

// Every request reveals an artisan's number, so the cap is low enough to stop
// scraping but still lets a real client contact several artisans.
const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many contact requests. Please try again in a few minutes." },
});

const TYPES = ["whatsapp_click", "phone_call_click"];

// No 0/O or 1/I, so a code read out over the phone can't be misheard.
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newRefCode = () =>
  `CB-${Array.from({ length: 6 }, () => REF_ALPHABET[crypto.randomInt(REF_ALPHABET.length)]).join("")}`;

// =========================
// CONTACT AN ARTISAN
// POST /api/telemetry/contact
// The client leaves a name and phone number; we record who contacted whom
// and hand back the WhatsApp or tel: link with a reference code.
// =========================
router.post("/contact", contactLimiter, async (req, res) => {
  try {
    const { artisanId, type, artisanTrade, targetLocationPage, clientName, clientPhone } =
      req.body || {};

    if (!TYPES.includes(type)) {
      return res.status(400).json({ message: "Unknown contact type" });
    }

    const name = String(clientName || "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ message: "Please enter your name" });
    }

    const phone = normalisePhone(clientPhone);
    if (!phone || phone.replace(/\D/g, "").length < 8) {
      return res.status(400).json({ message: "Please enter a valid phone number" });
    }

    if (!/^[a-f\d]{24}$/i.test(String(artisanId || ""))) {
      return res.status(404).json({ message: "Professional not found" });
    }

    const artisan = await User.findById(artisanId).select(
      "name primaryTrade phone socialLinks workerVerificationStatus isVerified"
    );
    const reachable =
      artisan &&
      (artisan.workerVerificationStatus === "verified" || artisan.isVerified === true);
    if (!reachable) {
      return res.status(404).json({ message: "Professional not found" });
    }

    const refCode = newRefCode();
    const source = contactSource(artisan);
    const url =
      type === "whatsapp_click"
        ? whatsappLink(source, contactMessage(name, refCode))
        : callLink(source);
    if (!url) {
      return res.status(404).json({ message: "This professional has no contact number yet" });
    }

    await OutboundClick.create({
      artisan: artisan._id,
      artisanName: artisan.name || "",
      artisanTrade: (artisanTrade || artisan.primaryTrade || "").trim(),
      targetLocationPage: String(targetLocationPage || "").slice(0, 300),
      type,
      clientName: name,
      clientPhone: phone,
      refCode,
      referrer: String(req.headers.referer || "").slice(0, 300),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
      ip: req.ip || req.connection?.remoteAddress || "",
    });

    return res.status(201).json({ url, refCode });
  } catch (err) {
    console.error("CONTACT REQUEST ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// =========================
// MY ENQUIRIES (artisan)
// GET /api/telemetry/my-enquiries
// The clients who opened WhatsApp or a call to this artisan, so the artisan
// can check the number contacting them matches who we recorded.
// =========================
router.get("/my-enquiries", auth, async (req, res) => {
  try {
    const enquiries = await OutboundClick.find({ artisan: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("type clientName clientPhone refCode targetLocationPage createdAt")
      .lean();

    res.json({ enquiries });
  } catch (err) {
    console.error("MY ENQUIRIES ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
