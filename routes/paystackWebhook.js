const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const User = require("../models/User");
const Company = require("../models/Company");
const {
  activateSubscription,
  deactivateSubscription,
} = require("../utils/syncSubscription");
const { getPaidPlan, resolveAccountType, PAID_PLANS } = require("../config/plans");

// VERIFY PAYSTACK SIGNATURE
const verifySignature = (req) => {
  const payload = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body));

  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(payload)
    .digest("hex");

  return hash === req.headers["x-paystack-signature"];
};

// Metadata is the reliable identifier when the payment was started from the
// app; hosted payment pages only give us the payer's email, so that stays as
// the fallback.
const resolvePayer = async (data) => {
  const metadata = data.metadata || {};

  if (metadata.userId) {
    const user = await User.findById(metadata.userId).catch(() => null);
    if (user) return { user, companyId: metadata.companyId || user.companyId };
  }

  const email = data.customer?.email?.toLowerCase().trim();
  if (!email) return null;

  const user = await User.findOne({ email });
  return user ? { user, companyId: user.companyId } : null;
};

// The plan comes from metadata when present, otherwise from the amount paid,
// so a hosted payment page still activates the right plan.
const resolvePlan = async (data, user, companyId) => {
  const metadata = data.metadata || {};

  if (metadata.plan) {
    const byId = Object.values(PAID_PLANS).find((p) => p.id === metadata.plan);
    if (byId) return byId;
  }

  const naira = (data.amount || 0) / 100;
  const byAmount = Object.values(PAID_PLANS).find((p) => p.amount === naira);
  if (byAmount) return byAmount;

  const company = companyId
    ? await Company.findById(companyId).select("organizationType")
    : null;
  return getPaidPlan(resolveAccountType(user, company));
};

/* =========================
   PAYSTACK WEBHOOK
========================= */

router.post("/paystack/webhook", async (req, res) => {
  try {
    if (!verifySignature(req)) {
      return res.status(401).send("Unauthorized");
    }

    const event = Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString("utf8"))
      : req.body;

    const data = event.data || {};

    if (event.event === "charge.success") {
      const payer = await resolvePayer(data);

      if (!payer) return res.status(404).send("User not found");

      const plan = await resolvePlan(data, payer.user, payer.companyId);

      // Activate (or renew for another 30 days) on the company and mirror to
      // the user.
      await activateSubscription(
        payer.companyId,
        payer.user._id,
        "premium",
        30
      );

      console.log(
        `Paystack charge.success: activated ${plan.id} for ${payer.user.email}`
      );
    }

    // A failed charge must never grant access; log it for support instead.
    if (event.event === "charge.failed" || event.event === "invoice.payment_failed") {
      console.warn(
        "Paystack payment failed:",
        data.customer?.email,
        data.gateway_response || data.status
      );
    }

    // Paystack disables a subscription when it is cancelled or its renewals
    // stop, so revoke access instead of waiting for the expiry date.
    if (event.event === "subscription.disable") {
      const payer = await resolvePayer(data);
      if (payer) {
        await deactivateSubscription(payer.companyId, payer.user._id);
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("Paystack webhook error:", err);
    res.sendStatus(500);
  }
});

module.exports = router;
