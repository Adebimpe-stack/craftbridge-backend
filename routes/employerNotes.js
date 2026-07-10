const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const EmployerProfessionalNote = require("../models/EmployerProfessionalNote");
const ServiceRequest = require("../models/ServiceRequest");

// =========================
// TIMELINE
// GET /api/employer-notes/timeline/:professionalId
// =========================
router.get("/timeline/:professionalId", auth, async (req, res) => {
  try {
    const owner = getOwner(req.user);
    const professionalId = req.params.professionalId;

    const serviceQuery = {
      professional: professionalId,
    };

    if (owner.ownerType === "company") {
      serviceQuery.companyId = owner.ownerId;
    } else {
      serviceQuery.client = owner.ownerId;
    }

    const [requests, note] = await Promise.all([
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
          type: "contact_unlocked",
          title: "Contact details unlocked",
          date: req.acceptedAt || req.updatedAt,
          serviceType: req.serviceType,
        });

        events.push({
          type: "resume_unlocked",
          title: "Resume unlocked",
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

    if (note) {
      events.push({
        type: "note_updated",
        title: "Private note updated",
        date: note.updatedAt,
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
  const query = {
    professional: professionalId,
    status: { $in: ["accepted", "completed"] },
  };

  if (owner.ownerType === "company") {
    query.companyId = owner.ownerId;
  } else {
    query.client = owner.ownerId;
  }

  return await ServiceRequest.findOne(query);
};

// =========================
// GET NOTE
// GET /api/employer-notes/:professionalId
// =========================
router.get("/:professionalId", auth, async (req, res) => {
  try {
    const owner = getOwner(req.user);

    const note = await EmployerProfessionalNote.findOne({
      ...owner,
      professional: req.params.professionalId,
    });

    if (!note) {
      return res.json({ note: null });
    }

    res.json({ note });
  } catch (err) {
    console.error("GET EMPLOYER NOTE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// CREATE / UPDATE NOTE
// POST /api/employer-notes/:professionalId
// =========================
router.post("/:professionalId", auth, async (req, res) => {
  try {
    const { note: noteText } = req.body;

    if (!noteText || !noteText.trim()) {
      return res.status(400).json({ message: "Note text is required." });
    }

    const owner = getOwner(req.user);

    const unlocked = await hasUnlockedRelationship(
      req.params.professionalId,
      owner
    );

    if (!unlocked) {
      return res.status(403).json({
        message: "You can only add notes for professionals you have unlocked.",
      });
    }

    const note = await EmployerProfessionalNote.findOneAndUpdate(
      { ...owner, professional: req.params.professionalId },
      { note: noteText.trim() },
      { new: true, upsert: true, runValidators: true }
    );

    res.json({ message: "Note saved.", note });
  } catch (err) {
    console.error("SAVE EMPLOYER NOTE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// UPDATE NOTE
// PUT /api/employer-notes/:professionalId
// =========================
router.put("/:professionalId", auth, async (req, res) => {
  try {
    const { note: noteText } = req.body;

    if (!noteText || !noteText.trim()) {
      return res.status(400).json({ message: "Note text is required." });
    }

    const owner = getOwner(req.user);

    const note = await EmployerProfessionalNote.findOneAndUpdate(
      { ...owner, professional: req.params.professionalId },
      { note: noteText.trim() },
      { new: true, runValidators: true }
    );

    if (!note) {
      return res.status(404).json({ message: "Note not found." });
    }

    res.json({ message: "Note updated.", note });
  } catch (err) {
    console.error("UPDATE EMPLOYER NOTE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =========================
// DELETE NOTE
// DELETE /api/employer-notes/:professionalId
// =========================
router.delete("/:professionalId", auth, async (req, res) => {
  try {
    const owner = getOwner(req.user);

    const note = await EmployerProfessionalNote.findOneAndDelete({
      ...owner,
      professional: req.params.professionalId,
    });

    if (!note) {
      return res.status(404).json({ message: "Note not found." });
    }

    res.json({ message: "Note deleted." });
  } catch (err) {
    console.error("DELETE EMPLOYER NOTE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
