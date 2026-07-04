const express = require("express");
const router = express.Router();
const axios = require("axios");

const auth = require("./middleware/auth");
const User = require("./models/User");
const Company = require("./models/Company");
const { activateSubscription } = require("./utils/syncSubscription");

// INIT PAYMENT
router.post("/payments/paystack/init", auth, async (req, res) => {
  try {
    const user = req.user;

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: user.email,
        amount: 5000 * 100, // ₦5,000 in kobo
        metadata: {
          userId: user._id.toString(),
          companyId: user.companyId ? user.companyId.toString() : null,
        },
        callback_url: `${process.env.FRONTEND_URL}/payment-success`,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.json({
      authorization_url: response.data.data.authorization_url
    });

  } catch (err) {
    console.log(err.response?.data || err.message);
    res.status(500).json({ message: "Payment init failed" });
  }
});

// VERIFY PAYMENT & ACTIVATE SUBSCRIPTION
router.get("/payments/paystack/verify/:reference", auth, async (req, res) => {
  try {
    const { reference } = req.params;

    // Verify with Paystack
    const paystackRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        }
      }
    );

    const data = paystackRes.data.data;

    if (!data || data.status !== "success") {
      return res.status(400).json({
        message: "Payment was not successful. Please try again or contact support."
      });
    }

    // Activate subscription on the Company record and mirror to User
    const user = await User.findById(req.user.id).select("companyId email");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { plan, expiry } = await activateSubscription(
      user.companyId,
      user._id,
      "premium",
      30
    );

    return res.json({
      message: "Subscription activated successfully! Your plan is now active for 30 days.",
      hasActiveSubscription: true,
      subscriptionPlan: plan,
      subscriptionExpiry: expiry,
    });

  } catch (err) {
    console.log("VERIFY ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "Payment verification failed. Please contact support." });
  }
});

module.exports = router;
