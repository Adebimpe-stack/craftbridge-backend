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
    const { role: neededRole, location, hires, details, contactName, company, email, phone } =
      req.body;

    if (!String(neededRole || "").trim()) {
      return res.status(400).json({ message: "Tell us which role you need filled" });
    }
    if (!String(contactName || "").trim()) {
      return res.status(400).json({ message: "Your name is required" });
    }
    if (!/^\S+@\S+\.\S+$/.test(String(email || "").trim())) {
      return res.status(400).json({ message: "A valid email address is required" });
    }

    const viewer = await optionalViewer(req);

    const request = await ShortlistRequest.create({
      role: neededRole,
      location,
      hires,
      details,
      contactName,
      company,
      email,
      phone,
      requestedBy: viewer?._id,
    });

    const notifyTo = process.env.SHORTLIST_NOTIFY_EMAIL || process.env.EMAIL_FROM;
    if (notifyTo) {
      // Never let a mail failure lose the request that is already stored.
      sendEmail({
        to: notifyTo,
        subject: `Shortlist request: ${String(neededRole).slice(0, 80)}`,
        html: `
          <h2>New shortlist request</h2>
          <p><strong>Role:</strong> ${escapeHtml(neededRole)}</p>
          <p><strong>Location:</strong> ${escapeHtml(location) || "—"}</p>
          <p><strong>Hires needed:</strong> ${escapeHtml(hires) || "—"}</p>
          <p><strong>Contact:</strong> ${escapeHtml(contactName)} (${escapeHtml(email)})</p>
          <p><strong>Company:</strong> ${escapeHtml(company) || "—"}</p>
          <p><strong>Phone:</strong> ${escapeHtml(phone) || "—"}</p>
          <p><strong>Details:</strong><br/>${escapeHtml(details) || "—"}</p>
        `,
      }).catch(() => {});
    }

    res.status(201).json({
      message:
        "Thank you. We will query our verified network and send your shortlist within 48 hours.",
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
