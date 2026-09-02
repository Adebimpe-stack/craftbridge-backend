// Paid plan per account type, mirroring the public pricing page.
// Each plan has its own Paystack payment page.

const PAID_PLANS = {
  jobseeker: {
    id: "professional-plus",
    name: "Professional Plus",
    amount: 2500,
    paystackUrl: "https://paystack.shop/pay/xxh4cu4fbn",
  },
  service_business: {
    id: "business-plus",
    name: "Business Plus",
    amount: 7500,
    paystackUrl: "https://paystack.shop/pay/qp2my5116b",
  },
  employer: {
    id: "company-growth",
    name: "Growth",
    amount: 15000,
    paystackUrl: "https://paystack.shop/pay/eiajbwq7hc",
  },
  recruitment_agency: {
    id: "agency-pro",
    name: "Agency Pro",
    amount: 30000,
    paystackUrl: "https://paystack.shop/pay/55rlnh9fyc",
  },
};

const getPaidPlan = (accountType) =>
  PAID_PLANS[accountType] || PAID_PLANS.employer;

// Account type is the user's role for professionals, and the company's
// organizationType for every account that hires or sells services.
const resolveAccountType = (user, company) => {
  if (user.role === "jobseeker") return "jobseeker";
  return company?.organizationType || "employer";
};

module.exports = { PAID_PLANS, getPaidPlan, resolveAccountType };
