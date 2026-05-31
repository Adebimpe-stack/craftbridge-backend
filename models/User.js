const mongoose =
  require("mongoose");

const userSchema =
  new mongoose.Schema(

    {

      name: {
        type: String,
        required: true,
      },

      email: {
        type: String,
        required: true,
        unique: true,
      },

      password: {
        type: String,
        required: true,
      },

      role: {
        type: String,
        enum: [
          "jobseeker",
          "employer",
          "admin",
        ],
        default: "jobseeker",
      },

      companyName: {
        type: String,
      },

      industry: {
  type: String,
},

      phone: {
        type: String,
      },

      location: {
        type: String,
      },

companySize: {
  type: String,
},

description: {
  type: String,
},

cacNumber: {
  type: String,
},

      bio: {
        type: String,
      },

      skills: [
        {
          type: String,
        },
      ],

      resume: {
        type: String,
      },

      profilePicture: {
        type: String,
      },

      website: {
        type: String,
      },

      verificationDocument: {
  type: String,
},
      linkedin: {
        type: String,
      },

      github: {
        type: String,
      },

      experience: {
        type: String,
      },

      education: {
        type: String,
      },

      isVerified: {
        type: Boolean,
        default: false,
      },

      // ==============================
      // EMAIL VERIFICATION
      // ==============================

      emailVerificationToken: {
        type: String,
      },

      // ==============================
      // PASSWORD RESET
      // ==============================

      resetPasswordToken: {
        type: String,
      },

      // ==============================
      // EMPLOYER SYSTEM
      // ==============================

      isCompanyVerified: {
        type: Boolean,
        default: false,
      },

      hasUsedFreeJob: {
        type: Boolean,
        default: false,
      },

      subscriptionActive: {
        type: Boolean,
        default: false,
      },

      subscriptionPlan: {
        type: String,
        default: "",
      },

      subscriptionExpiry: {
        type: Date,
      },

      // ==============================
      // ACCOUNT DATES
      // ==============================

      createdAt: {
        type: Date,
        default: Date.now,
      },

    },

    {
      timestamps: true,
    }

  );

module.exports =
  mongoose.model(
    "User",
    userSchema
  );
