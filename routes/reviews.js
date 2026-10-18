const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const auth = require("../middleware/auth");
const requireRole = require("../middleware/role");
const Review = require("../models/Review");
const OutboundClick = require("../models/OutboundClick");
const User = require("../models/User");
const { normalisePhone } = require("../utils/sendSms");

const router = express.Router();

// Lookups and submissions are keyed on a reference code, so the cap stops
// anyone walking the code space.
const reviewLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});

const REF_PATTERN = /^CB-[A-Z0-9]{6}$/;
const normaliseRef = (value) => String(value || "").trim().toUpperCase();

// "Adebimpe Fasemoyin" -> "Adebimpe F." so reviews read as real people
// without publishing full names.
const publicName = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Client";
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : first;
};

const publicReview = (review) => ({
  _id: review._id,
  rating: review.rating,
  hired: review.hired,
  comment: review.comment,
  clientName: publicName(review.clientName),
  createdAt: review.createdAt,
});

/**
 * Recomputes the denormalised rating on the professional, so directory cards
 * and pages show it without joining reviews on every request.
 */
const refreshRating = async (professionalId) => {
  const [summary] = await Review.aggregate([
    {
      $match: {
        professional: new mongoose.Types.ObjectId(String(professionalId)),
        status: "published",
      },
    },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);

  await User.updateOne(
    { _id: professionalId },
    {
      $set: {
        ratingAverage: summary ? Math.round(summary.average * 10) / 10 : 0,
        ratingCount: summary ? summary.count : 0,
      },
    }
  );
};

// =========================
// LOOK UP A CONTACT TO REVIEW
// GET /api/reviews/contact/:refCode
// Tells the review page who the client is rating. Only the professional's
// public name and trade are returned.
// =========================
router.get("/contact/:refCode", reviewLimiter, async (req, res) => {
  try {
    const refCode = normaliseRef(req.params.refCode);
    if (!REF_PATTERN.test(refCode)) {
      return res.status(404).json({ message: "We couldn't find that reference code" });
    }

    const contact = await OutboundClick.findOne({ refCode }).select("artisan").lean();
    if (!contact) {
      return res.status(404).json({ message: "We couldn't find that reference code" });
    }

    const [professional, existing] = await Promise.all([
      User.findById(contact.artisan).select("name primaryTrade").lean(),
      Review.exists({ contact: contact._id }),
    ]);
    if (!professional) {
      return res.status(404).json({ message: "This professional is no longer on CraftBridge" });
    }

    return res.json({
      refCode,
      professional: {
        _id: professional._id,
        name: professional.name,
        primaryTrade: professional.primaryTrade || "",
      },
      alreadyReviewed: Boolean(existing),
    });
  } catch (err) {
    console.error("REVIEW LOOKUP ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// =========================
// LEAVE A REVIEW
// POST /api/reviews
// The phone number must match the one the client gave when they contacted
// the professional, which is what proves the reviewer is that client.
// =========================
router.post("/", reviewLimiter, async (req, res) => {
  try {
    const { refCode: rawRef, clientPhone, rating, hired, comment } = req.body || {};
    const refCode = normaliseRef(rawRef);
    const score = Number(rating);

    if (!REF_PATTERN.test(refCode)) {
      return res.status(400).json({ message: "Please enter a valid reference code" });
    }
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return res.status(400).json({ message: "Please choose a rating from 1 to 5 stars" });
    }

    const text = String(comment || "").trim().replace(/\s+\n/g, "\n");
    if (text.length > 600) {
      return res.status(400).json({ message: "Please keep your review under 600 characters" });
    }

    const contact = await OutboundClick.findOne({ refCode });
    const phone = normalisePhone(clientPhone);
    if (!contact || !phone || contact.clientPhone !== phone) {
      return res.status(400).json({
        message: "The reference code and phone number don't match our records",
      });
    }

    const duplicate = await Review.exists({
      $or: [
        { contact: contact._id },
        { professional: contact.artisan, clientPhone: phone },
      ],
    });
    if (duplicate) {
      return res.status(409).json({ message: "You have already reviewed this professional" });
    }

    const review = await Review.create({
      professional: contact.artisan,
      contact: contact._id,
      refCode,
      clientName: contact.clientName,
      clientPhone: phone,
      rating: score,
      hired: hired === true,
      comment: text,
    });

    await refreshRating(contact.artisan);

    return res.status(201).json({ review: publicReview(review) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "You have already reviewed this professional" });
    }
    console.error("REVIEW CREATE ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// =========================
// A PROFESSIONAL'S PUBLIC REVIEWS
// GET /api/reviews/professional/:id
// =========================
router.get("/professional/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Professional not found" });
    }

    const [reviews, professional] = await Promise.all([
      Review.find({ professional: req.params.id, status: "published" })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      User.findById(req.params.id).select("ratingAverage ratingCount").lean(),
    ]);

    return res.json({
      average: professional?.ratingAverage || 0,
      count: professional?.ratingCount || 0,
      reviews: reviews.map(publicReview),
    });
  } catch (err) {
    console.error("PROFESSIONAL REVIEWS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// =========================
// ADMIN: ALL REVIEWS
// GET /api/reviews/admin?status=published|hidden
// =========================
router.get("/admin", auth, requireRole("admin"), async (req, res) => {
  try {
    const filter = {};
    if (["published", "hidden"].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const reviews = await Review.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("professional", "name primaryTrade")
      .lean();

    return res.json({ reviews });
  } catch (err) {
    console.error("ADMIN REVIEWS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// =========================
// ADMIN: HIDE OR RESTORE A REVIEW
// PATCH /api/reviews/admin/:id  { status: "hidden" | "published" }
// =========================
router.patch("/admin/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!["published", "hidden"].includes(status)) {
      return res.status(400).json({ message: "Unknown status" });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Review not found" });
    }

    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    await refreshRating(review.professional);

    return res.json({ review });
  } catch (err) {
    console.error("ADMIN REVIEW UPDATE ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
