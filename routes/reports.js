const router = require("express").Router();
const mongoose = require("mongoose");
const { body, validationResult } = require("express-validator");

const auth = require("../middleware/auth");
const Report = require("../models/Report");
const Company = require("../models/Company");
const User = require("../models/User");
const Job = require("../models/Job");
const sendEmail = require("../utils/sendEmail");

router.post(
  "/",
  auth,
  [
    body("targetType").isIn(["Job", "Company", "User"]).withMessage("Invalid target type."),
    body("targetId").isMongoId().withMessage("Invalid target ID."),
    body("reason").notEmpty().withMessage("A reason for the report is required."),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { targetType, targetId, reason, comments } = req.body;
      const TargetModel = mongoose.model(targetType);
      const target = await TargetModel.findById(targetId);

      if (!target) {
        return res.status(404).json({ message: `${targetType} not found.` });
      }

      const report = await Report.create({
        reporter: req.user.id,
        targetType,
        targetId,
        reason,
        comments,
      });

      if (targetType === "Company") {
        target.reportsReceived = (target.reportsReceived || 0) + 1;
        await target.save();

        const owner = await User.findById(target.owner);
        if (owner) {
          await sendEmail({
            to: owner.email,
            subject: `A report has been filed against your company "${target.name}"`,
            html: `<p>Hello ${owner.name},</p><p>A report has been submitted regarding your company. Our moderation team will review it shortly.</p>`,
          });
        }
      }

      if (targetType === "User") {
        target.reportsReceived = (target.reportsReceived || 0) + 1;
        await target.save();

        await sendEmail({
          to: target.email,
          subject: "A report has been filed against your profile",
          html: `<p>Hello ${target.name},</p><p>A report has been submitted regarding your profile. Our moderation team will review it shortly.</p>`,
        });
      }

      if (targetType === "Job") {
        const company = await Company.findById(target.companyId);
        if (company) {
          company.reportsReceived = (company.reportsReceived || 0) + 1;
          await company.save();

          const owner = await User.findById(company.owner);
          if (owner) {
            await sendEmail({
              to: owner.email,
              subject: `A report has been filed against your job posting "${target.title}"`,
              html: `<p>Hello ${owner.name},</p><p>A report has been submitted regarding one of your job postings. Our moderation team will review it shortly.</p>`,
            });
          }
        }
      }

      res.status(201).json({
        message: "Report submitted successfully.",
        report,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

module.exports = router;
