const express = require("express");
const router = express.Router();
const axios = require("axios");

const auth = require("./middleware/auth");
const User = require("./models/User");
const Company = require("./models/Company");


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

    // Activate subscription on the Company record
    const user = await User.findById(req.user.id).select("companyId email");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.companyId) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30); // 30-day subscription

      await Company.findByIdAndUpdate(user.companyId, {
        subscriptionActive: true,
        subscriptionPlan: "premium",
        subscriptionExpiry: expiry,
      });
    }

    // Also flag on the User for fast middleware access
    await User.findByIdAndUpdate(req.user.id, {
      subscriptionActive: true,
    });

    return res.json({
      message: "Subscription activated successfully! Your plan is now active for 30 days.",
      subscriptionActive: true,
    });

  } catch (err) {
    console.log("VERIFY ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "Payment verification failed. Please contact support." });
  }
});

module.exports = router;
