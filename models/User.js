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
        index: true,
        lowercase: true,
        trim: true,
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

headline: {
  type: String,
},

location: {
  type: String,
},

experienceYears: {
  type: Number,
  default: 0,
},

skills: {
  type: [String],
  default: [],
},

certifications: {
  type: [String],
  default: [],
},

bio: {
  type: String,
},

availability: {
  type: String,
  enum: [
    "available",
    "open_to_work",
    "not_available",
  ],
  default: "available",
},

profileImage: {
  type: String,
},

resumeUrl: {
  type: String,
},

resumeText: {
  type: String,
},

resumeData: {
  type: mongoose.Schema.Types.Mixed,
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

verificationDocuments: [
  {
    type: String,
  },
],
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

      primaryTrade: {
        type: String,
        default: "",
      },

      workerVerificationStatus: {
        type: String,
        enum: ["none", "pending", "verified", "rejected"],
        default: "none",
      },

      workerVerificationDocuments: [
        { type: String },
      ],

      workerRejectionReason: {
        type: String,
        default: "",
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

     verificationStatus: {
  type: String,
  enum: [
    "pending",
    "verified",
    "rejected",
  ],
  default: "pending",
},

accountStatus: {
  type: String,
  enum: [
    "active",
    "suspended",
    "deactivated",
  ],
  default: "active",
},

rejectionReason: {
  type: String,
  trim: true,
  default: "",
},

suspensionReason: {
  type: String,
  trim: true,
  default: "",
},
companyId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Company",
},

companyRole: {
  type: String,
  enum: [
    "owner",
    "admin",
    "recruiter",
  ],
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
