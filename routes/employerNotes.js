const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const EmployerProfessionalNote = require("../models/EmployerProfessionalNote");
const ServiceRequest = require("../models/ServiceRequest");
const Company = require("../models/Company");

const requireBusinessAccount = (req, res, next) => {
  if (req.user?.role !== "employer") {
    return res.status(403).json({ message: "Only a business account can perform this action." });
  }
  next();
};

// =========================
// HELPER: get owner context from current user
// =========================
const getOwner = (user) => {
  if (user.companyId) {
    return { ownerType: "company", ownerId: user.companyId };
  }
  return { ownerType: "user", ownerId: user._id };
};

// =========================
// HELPER: check employer has unlocked this professional
// =========================
const hasUnlockedRelationship = async (professionalId, owner) => {
  if (owner.ownerType === "user") {
    return await ServiceRequest.findOne({
      professional: professionalId,
      status: { $in: ["accepted", "completed"] },
      client: owner.ownerId,
    });
  }

  const requests = await ServiceRequest.find({
    professional: professionalId,
    status: { $in: ["accepted", "completed"] },
  }).populate("client", "companyId");

  return requests.find(
    (r) =>
      String(r.companyId) === String(owner.ownerId) ||
      String(r.client?.companyId) === String(owner.ownerId)
  );
};

// =========================
// TIMELINE
// GET /api/employer-notes/timeline/:professionalId
// =========================
router.get("/timeline/:professionalId", auth, async (req, res) => {
  try {
    const owner = getOwner(req.user);
    const professionalId = req.params.professionalId;

    let serviceQuery = {
      professional: professionalId,
    };

    if (owner.ownerType === "company") {
      const company = await Company.findById(owner.ownerId).select("teamMembers owner");
      const memberIds = new Set();
      if (company) {
        if (company.owner) memberIds.add(String(company.owner));
        (company.teamMembers || []).forEach((id) => memberIds.add(String(id)));
      }
      serviceQuery = {
        professional: professionalId,
        $or: [
          { companyId: owner.ownerId },
          { client: { $in: Array.from(memberIds) } },
        ],
      };
    } else {
      serviceQuery.client = owner.ownerId;
    }

    const [requests, relationship] = await Promise.all([
      ServiceRequest.find(serviceQuery).sort({ createdAt: -1 }),
      EmployerProfessionalNote.findOne({
        ...owner,
        professional: professionalId,
      }),
    ]);

    const events = [];

    requests.forEach((req) => {
      events.push({
        type: "request_sent",
        title: "Service request sent",
        date: req.createdAt,
        serviceType: req.serviceType,
      });

      if (req.status === "accepted" || req.status === "completed") {
        events.push({
          type: "request_accepted",
          title: "Service request accepted",
          date: req.acceptedAt || req.updatedAt,
          serviceType: req.serviceType,
        });

        events.push({
          type: "access_granted",
          title: "Access granted",
          subtitle: "Contact details and resume are now available.",
          date: req.acceptedAt || req.updatedAt,
          serviceType: req.serviceType,
        });
      }

      if (req.status === "completed" && req.completedAt) {
        events.push({
          type: "request_completed",
          title: "Service request completed",
          date: req.completedAt,
          serviceType: req.serviceType,
        });
      }
    });

    if (relationship?.note?.trim()) {
      events.push({
        type: "note_updated",
        title: "Private note updated",
        date: relationship.updatedAt,
      });
    }

    events.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ events });
  } catch (err) {
    console.error("GET EMPLOYER TIMELINE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// GET RELATIONSHIP (note, tags, rating, saved)
// GET /api/employer-notes/:professionalId
// =========================
router.get("/:professionalId", auth, async (req, res) => {
  try {
    const owner = getOwner(req.user);

    const relationship = await EmployerProfessionalNote.findOne({
      ...owner,
      professional: req.params.professionalId,
    });

    res.json({ note: relationship || null });
  } catch (err) {
    console.error("GET EMPLOYER NOTE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// CREATE / UPDATE RELATIONSHIP
// POST /api/employer-notes/:professionalId
// =========================
router.post("/:professionalId", auth, async (req, res) => {
  try {
    const { note, tags, rating } = req.body;
    const owner = getOwner(req.user);

    const update = {};

    if (note !== undefined) {
      update.note = note.trim();
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return res.status(400).json({ message: "Tags must be an array." });
      }
      update.tags = tags.map((t) => String(t).trim()).filter(Boolean);
    }

    if (rating !== undefined) {
      const numericRating = Number(rating);
      if (
        !Number.isInteger(numericRating) ||
        numericRating < 1 ||
        numericRating > 5
      ) {
        return res.status(400).json({ message: "Rating must be 1–5." });
      }
      update.rating = numericRating;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "Nothing to update." });
    }

    const unlocked = await hasUnlockedRelationship(
      req.params.professionalId,
      owner
    );

    if (!unlocked) {
      return res.status(403).json({
        message: "You can only update notes for professionals you have unlocked.",
      });
    }

    const relationship = await EmployerProfessionalNote.findOneAndUpdate(
      { ...owner, professional: req.params.professionalId },
      update,
      { returnDocument: "after", upsert: true, runValidators: true }
    );

    res.json({ message: "Saved.", note: relationship });
  } catch (err) {
    console.error("SAVE EMPLOYER NOTE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// SAVE / UNSAVE PROFESSIONAL
// POST /api/employer-notes/save/:professionalId
// DELETE /api/employer-notes/save/:professionalId
// =========================
router.post("/save/:professionalId", auth, requireBusinessAccount, async (req, res) => {
  try {
    const owner = getOwner(req.user);

    const relationship = await EmployerProfessionalNote.findOneAndUpdate(
      { ...owner, professional: req.params.professionalId },
      { isSaved: true },
      { returnDocument: "after", upsert: true, runValidators: true }
    );

    res.json({ message: "Professional saved.", note: relationship });
  } catch (err) {
    console.error("SAVE PROFESSIONAL ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/save/:professionalId", auth, requireBusinessAccount, async (req, res) => {
  try {
    const owner = getOwner(req.user);

    const relationship = await EmployerProfessionalNote.findOneAndUpdate(
      { ...owner, professional: req.params.professionalId },
      { isSaved: false },
      { returnDocument: "after", runValidators: true }
    );

    if (!relationship) {
      return res.status(404).json({ message: "Saved professional not found." });
    }

    res.json({ message: "Removed from saved.", note: relationship });
  } catch (err) {
    console.error("UNSAVE PROFESSIONAL ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// LIST SAVED PROFESSIONALS
// GET /api/employer-notes/saved/list
// =========================
router.get("/saved/list", auth, async (req, res) => {
  try {
    const owner = getOwner(req.user);

    const saved = await EmployerProfessionalNote.find({
      ...owner,
      isSaved: true,
    })
      .populate("professional", "name profilePicture primaryTrade location city state")
      .sort({ updatedAt: -1 });

    res.json({ saved });
  } catch (err) {
    console.error("LIST SAVED PROFESSIONALS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// UPDATE RATING ONLY
// PUT /api/employer-notes/rating/:professionalId
// =========================
router.put("/rating/:professionalId", auth, async (req, res) => {
  try {
    const { rating } = req.body;
    const owner = getOwner(req.user);

    const numericRating = Number(rating);
    if (
      !Number.isInteger(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({ message: "Rating must be 1–5." });
    }

    const unlocked = await hasUnlockedRelationship(
      req.params.professionalId,
      owner
    );

    if (!unlocked) {
      return res.status(403).json({
        message: "You can only rate professionals you have unlocked.",
      });
    }

    const relationship = await EmployerProfessionalNote.findOneAndUpdate(
      { ...owner, professional: req.params.professionalId },
      { rating: numericRating },
      { returnDocument: "after", upsert: true, runValidators: true }
    );

    res.json({ message: "Rating saved.", note: relationship });
  } catch (err) {
    console.error("SAVE RATING ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
