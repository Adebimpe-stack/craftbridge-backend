const express = require("express");
const router = express.Router();
const axios = require("axios");

const auth = require("./middleware/auth");

// INIT PAYMENT
router.post("/payments/paystack/init", auth, async (req, res) => {
  try {
    const user = req.user;

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: user.email,
        amount: 5000 * 100 // amount in kobo
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

module.exports = router;
