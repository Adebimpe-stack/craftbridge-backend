const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const User = require("../models/User");

// VERIFY PAYSTACK SIGNATURE
const verifySignature = (req) => {
  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
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

    const event = req.body;

    if (event.event === "charge.success") {
      const email = event.data.customer.email
        .toLowerCase()
        .trim();

      const user = await User.findOne({ email });

      if (!user) return res.status(404).send("User not found");

      // 🔥 30-DAY SUBSCRIPTION ACTIVATION
      user.subscription.plan = "paid";
      user.subscription.isActive = true;
      user.subscription.startDate = new Date();
      user.subscription.expiresAt = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      );

      await user.save();

      console.log(`Subscription activated for ${email}`);
    }

    res.sendStatus(200);

  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

module.exports = router;
