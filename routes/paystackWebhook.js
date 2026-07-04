const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const User = require("../models/User");
const { activateSubscription } = require("../utils/syncSubscription");

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

    if (event.event === "charge.success") {
      const email = event.data.customer.email
        .toLowerCase()
        .trim();

      const user = await User.findOne({ email });

      if (!user) return res.status(404).send("User not found");

      // Activate subscription on the company and mirror to user
      await activateSubscription(
        user.companyId,
        user._id,
        "premium",
        30
      );

      console.log(`Subscription activated for ${email}`);
    }

    res.sendStatus(200);

  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

module.exports = router;
