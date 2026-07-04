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
          "employer", "admin"
        ],
        default: "jobseeker",
      },

      // ==============================
      // PROFESSIONAL & SKILLED WORKER PROFILE
      // ==============================
      availabilityFor: {
        type: [String],
        enum: [
          "Full-time Employment",
          "Part-time Employment",
          "Contract Work",
          "Freelance Services",
          "Emergency Call-outs",
          "Apprenticeship",
          "Relocation"
        ],
        default: ["Full-time Employment"]
      },
      primaryTrade: {
        type: String,
        default: "",
      },
      serviceDescription: {
        type: String,
      },
      professionalSummary: {
        type: String,
      },
      portfolio: [
        {
          title: String,
          description: String,
          category: String,
          completionYear: Number,
          isFeatured: { type: Boolean, default: false },
          url: String,
          caption: String,
          type: { type: String, enum: ["image", "video"], default: "image" },
        },
      ],
      serviceLocations: [String],
      languages: [String],
      emergencyService: {
        type: Boolean,
        default: false,
      },
      startingPrice: {
        type: Number,
      },
      phoneVisibility: {
        type: String,
        enum: ["public", "on_request", "private"],
        default: "private",
      },
      socialLinks: {
        linkedin: String,
        twitter: String,
      },
      profileVisibility: {
        type: String,
        enum: ["Public", "Employers Only", "Private"],
        default: "Public",
      },
      profileSlug: {
        type: String,
        unique: true,
        sparse: true, // Allows multiple null values, but unique once set
      },
      workerVerificationStatus: {
        type: String,
        enum: ["none", "pending", "verified", "rejected", "revoked"],
        default: "none",
      },

      workerVerificationDocuments: [
        { type: String },
      ],

      // Flexible, evidence-based verification
      verificationEvidence: [
        {
          evidenceCategory: { type: String, required: true },
          documentName: { type: String, required: true },
          documentUrl: { type: String, required: true },
          status: { type: String, enum: ["Pending", "Approved", "Rejected", "Additional Evidence Required"], default: "Pending" },
          adminNotes: String, // Internal notes
          applicantNotes: String, // Notes visible to the professional
        }
      ],
      workerRejectionReason: {
        type: String,
        trim: true,
        default: "",
      },



headline: {
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

      location: {
        type: String,
      },

resumeText: {
  type: String,
},

resumeData: {
  type: mongoose.Schema.Types.Mixed,
},

      resume: {
        type: String,
      },

      resumeUrl: {
        type: String,
        default: "",
      },

      profilePicture: {
        type: String,
      },

      website: {
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
          "none",
          "pending",
          "verified",
          "rejected",
          "revoked",
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

      subscription: {
        plan: {
          type: String,
          default: "",
        },
        isActive: {
          type: Boolean,
          default: false,
        },
        startDate: {
          type: Date,
        },
        expiresAt: {
          type: Date,
        },
      },

      // ==============================
      // ACCOUNT DATES
      // ==============================

      createdAt: {
        type: Date,
        default: Date.now,
      },

      reportsReceived: {
        type: Number,
        default: 0,
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
