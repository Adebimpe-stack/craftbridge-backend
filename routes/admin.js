const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const requireRole = require("../middleware/role");

const User = require("../models/User");
const Job = require("../models/Job");
const Company = require("../models/Company");


// =======================
// GET ALL USERS
// =======================
router.get("/users", auth, requireRole("admin"), async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// GET ALL JOBS
// =======================
router.get("/jobs", auth, requireRole("admin"), async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// GET ALL APPLICATIONS (FLATTENED)
// =======================
router.get("/applications", auth, requireRole("admin"), async (req, res) => {
  try {
    const jobs = await Job.find();

    const applications = [];

    jobs.forEach((job) => {
      job.applicants.forEach((app) => {
        applications.push({
          jobId: job._id,
          jobTitle: job.title,
          userId: app.userId,
          status: app.status,
        });
      });
    });

    res.json(applications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// DELETE JOB (ADMIN CONTROL)
// =======================
router.delete("/jobs/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    await Job.findByIdAndDelete(req.params.id);
    res.json({ message: "Job deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// DELETE USER
// =======================
router.delete("/users/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// PENDING EMPLOYERS
// =======================
router.get(
  "/employers/pending",
  auth,
  requireRole("admin"),
  async (req, res) => {

    try {

      const employers =
        await User.find({

          role: "employer",

          isCompanyVerified: false,

        }).select("-password");

      res.json(employers);

    } catch (err) {

      res.status(500).json({
        message: err.message,
      });

    }

  }
);

// =======================
// VERIFY EMPLOYER
// =======================
router.put(
  "/employers/:id/verify",
  auth,
  requireRole("admin"),
  async (req, res) => {

    try {

      const employer =
        await User.findById(
          req.params.id
        );

      if (!employer) {

        return res.status(404).json({
          message:
            "Employer not found",
        });

      }

      employer.isCompanyVerified =
        true;

      await employer.save();

      res.json({
        message:
          "Employer verified successfully",
      });

    } catch (err) {

      res.status(500).json({
        message: err.message,
      });

    }

  }
);

// =======================
// GRANT SUBSCRIPTION MANUALLY (admin use for confirmed payments)
// =======================
router.post("/grant-subscription", auth, requireRole("admin"), async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: "User not found" });

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    await User.findByIdAndUpdate(user._id, { subscriptionActive: true });

    if (user.companyId) {
      await Company.findByIdAndUpdate(user.companyId, {
        subscriptionActive: true,
        subscriptionPlan: "premium",
        subscriptionExpiry: expiry,
      });
    }

    res.json({ message: `Subscription activated for ${email}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// GET ALL EMPLOYERS (admin view with company data)
// =======================
router.get("/employers", auth, requireRole("admin"), async (req, res) => {
  try {
    const employers = await User.find({ role: "employer" })
      .sort({ createdAt: -1 })
      .select("-password");

    // Enrich each employer with their Company record data
    const enriched = await Promise.all(
      employers.map(async (emp) => {
        const obj = emp.toObject();
        if (emp.companyId) {
          const company = await Company.findById(emp.companyId).select(
            "name verificationStatus verificationDocuments rejectionReason subscriptionActive subscriptionPlan"
          );
          if (company) {
            obj.companyName = obj.companyName || company.name;
            obj.verificationStatus = company.verificationStatus;
            obj.verificationDocuments = company.verificationDocuments || [];
            obj.rejectionReason = company.rejectionReason || "";
            obj.subscriptionActive = company.subscriptionActive;
            obj.subscriptionPlan = company.subscriptionPlan;
          }
        }
        return obj;
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// UPDATE EMPLOYER STATUS (verify / reject / suspend / unsuspend)
// =======================
router.put("/employers/:id/status", auth, requireRole("admin"), async (req, res) => {
  try {
    const { status, reason } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "Employer not found" });
    }

    if (status === "verified") {
      user.isCompanyVerified = true;
      user.verificationStatus = "verified";
      user.accountStatus = "active";
      user.rejectionReason = "";
      user.suspensionReason = "";

      // Mirror onto Company record
      if (user.companyId) {
        await Company.findByIdAndUpdate(user.companyId, {
          verificationStatus: "verified",
          rejectionReason: "",
        });
      }
    } else if (status === "rejected") {
      user.isCompanyVerified = false;
      user.verificationStatus = "rejected";
      user.accountStatus = "active";
      user.rejectionReason = reason || "";

      if (user.companyId) {
        await Company.findByIdAndUpdate(user.companyId, {
          verificationStatus: "rejected",
          rejectionReason: reason || "",
        });
      }
    } else if (status === "suspended") {
      user.accountStatus = "suspended";
      user.suspensionReason = reason || "";
    } else if (status === "unsuspend") {
      user.accountStatus = "active";
      user.suspensionReason = "";
    }

    await user.save();
    res.json({ message: `Employer ${status} successfully` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// SUSPEND USER
// =======================
router.put("/users/:id/suspend", auth, requireRole("admin"), async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.accountStatus = "suspended";
    user.suspensionReason = reason || "";
    await user.save();
    res.json({ message: "User suspended" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// UNSUSPEND USER
// =======================
router.put("/users/:id/unsuspend", auth, requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.accountStatus = "active";
    user.suspensionReason = "";
    await user.save();
    res.json({ message: "User unsuspended" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// DEACTIVATE USER (soft delete)
// =======================
router.put("/users/:id/deactivate", auth, requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.accountStatus = "deactivated";
    await user.save();
    res.json({ message: "User deactivated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// REACTIVATE USER
// =======================
router.put("/users/:id/reactivate", auth, requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.accountStatus = "active";
    user.suspensionReason = "";
    await user.save();
    res.json({ message: "User reactivated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// GET WORKERS PENDING VERIFICATION
// =======================
router.get("/workers/pending", auth, requireRole("admin"), async (req, res) => {
  try {
    const workers = await User.find({
      role: "jobseeker",
      workerVerificationStatus: "pending",
    }).select("-password").sort({ createdAt: -1 });
    res.json(workers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// GET ALL WORKERS (for verification management)
// =======================
router.get("/workers", auth, requireRole("admin"), async (req, res) => {
  try {
    const workers = await User.find({ role: "jobseeker" })
      .select("-password")
      .sort({ createdAt: -1 });
    res.json(workers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// UPDATE WORKER VERIFICATION STATUS
// =======================
router.put("/workers/:id/verify", auth, requireRole("admin"), async (req, res) => {
  try {
    const { status, reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Worker not found" });

    if (status === "verified") {
      user.workerVerificationStatus = "verified";
      user.workerRejectionReason = "";
    } else if (status === "rejected") {
      user.workerVerificationStatus = "rejected";
      user.workerRejectionReason = reason || "";
    } else if (status === "pending") {
      user.workerVerificationStatus = "pending";
    }

    await user.save();
    res.json({ message: `Worker ${status} successfully` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// SUSPEND A JOB (admin)
// =======================
router.put("/jobs/:id/suspend", auth, requireRole("admin"), async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(req.params.id, { status: "suspended" }, { new: true });
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json({ message: "Job suspended" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// =======================
// UNSUSPEND A JOB (admin)
// =======================
router.put("/jobs/:id/unsuspend", auth, requireRole("admin"), async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(req.params.id, { status: "active" }, { new: true });
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json({ message: "Job unsuspended" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
