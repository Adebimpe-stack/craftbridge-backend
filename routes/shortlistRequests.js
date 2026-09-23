const express = require("express");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

const ShortlistRequest = require("../models/ShortlistRequest");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const auth = require("../middleware/auth");
const role = require("../middleware/role");

const router = express.Router();

// The form is public, so it needs its own throttle.
const requestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many shortlist requests from this IP. Please try again later.",
  },
});

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Visitors may or may not be signed in; a session just adds attribution.
const optionalViewer = async (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;

  try {
    const decoded = jwt.verify(header.replace("Bearer ", ""), process.env.JWT_SECRET);
    const id = decoded.user?.id || decoded.id;
    return id ? await User.findById(id).select("_id") : null;
  } catch (err) {
    return null;
  }
};

// =========================
// POST /api/shortlist-requests
// Public: "Request Full Shortlist Access"
// =========================
router.post("/", requestLimiter, async (req, res) => {
  try {
    const {
      role: neededRole,
      sector,
      recipientType,
      location,
      hires,
      details,
      contactName,
      company,
      email,
      phone,
      source,
    } = req.body;

    if (!String(neededRole || "").trim()) {
      return res.status(400).json({ message: "Tell us which role you need filled" });
    }
    if (!String(contactName || "").trim()) {
      return res.status(400).json({ message: "Your name is required" });
    }

    // The localized landing pages ask for a phone number instead of an email,
    // so either channel is enough to reach the client back.
    const hasEmail = /^\S+@\S+\.\S+$/.test(String(email || "").trim());
    const hasPhone = String(phone || "").replace(/\D/g, "").length >= 8;
    if (!hasEmail && !hasPhone) {
      return res.status(400).json({
        message: "A valid email address or phone number is required",
      });
    }

    const viewer = await optionalViewer(req);

    const request = await ShortlistRequest.create({
      role: neededRole,
      sector,
      recipientType: recipientType === "business" ? "business" : "professional",
      location,
      hires,
      details,
      contactName,
      company,
      email: hasEmail ? email : undefined,
      phone,
      source: source === "local_page" ? "local_page" : "catalog",
      requestedBy: viewer?._id,
    });

    const notifyTo = process.env.SHORTLIST_NOTIFY_EMAIL || process.env.EMAIL_FROM;
    if (notifyTo) {
      // Never let a mail failure lose the request that is already stored.
      sendEmail({
        to: notifyTo,
        subject: `${
          source === "local_page" ? "Local lead" : "Shortlist request"
        }: ${String(neededRole).slice(0, 80)}`,
        html: `
          <h2>New shortlist request</h2>
          <p><strong>Role:</strong> ${escapeHtml(neededRole)}</p>
          <p><strong>Sector:</strong> ${escapeHtml(sector) || "—"}</p>
          <p><strong>Looking for:</strong> ${recipientType === "business" ? "Service business" : "Technician / professional"}</p>
          <p><strong>Location:</strong> ${escapeHtml(location) || "—"}</p>
          <p><strong>Hires needed:</strong> ${escapeHtml(hires) || "—"}</p>
          <p><strong>Contact:</strong> ${escapeHtml(contactName)} (${escapeHtml(email) || "no email"})</p>
          <p><strong>Company:</strong> ${escapeHtml(company) || "—"}</p>
          <p><strong>Phone:</strong> ${escapeHtml(phone) || "—"}</p>
          <p><strong>Details:</strong><br/>${escapeHtml(details) || "—"}</p>
        `,
      }).catch(() => {});
    }

    res.status(201).json({
      message:
        "Thank you. Our team will review your requirements and come back to you with matched, vetted providers.",
      requestId: request._id,
    });
  } catch (err) {
    console.error("SHORTLIST REQUEST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// GET /api/shortlist-requests  (admin)
// =========================
router.get("/", auth, role("admin"), async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const requests = await ShortlistRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({ requests });
  } catch (err) {
    console.error("SHORTLIST LIST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// PATCH /api/shortlist-requests/:id  (admin)
// =========================
router.patch("/:id", auth, role("admin"), async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["new", "in_progress", "delivered", "closed"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const request = await ShortlistRequest.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!request) return res.status(404).json({ message: "Request not found" });

    res.json({ request });
  } catch (err) {
    console.error("SHORTLIST UPDATE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
