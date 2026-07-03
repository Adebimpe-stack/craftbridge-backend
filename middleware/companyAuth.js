const User = require("../models/User");
const Company = require("../models/Company");

/**
 * Middleware to check if user belongs to the company
 */
const requireCompanyMember = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user.companyId) {
      return res.status(403).json({
        message: "You must belong to a company to perform this action"
      });
    }

    const companyId = req.params.id || req.params.companyId;
    if (user.companyId.toString() !== companyId) {
      return res.status(403).json({
        message: "You are not a member of this company"
      });
    }

    req.companyId = user.companyId;
    next();
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

/**
 * Middleware to check if user has specific company role
 * @param {string[]} allowedRoles - Array of allowed roles (e.g., ['owner', 'admin'])
 */
const requireCompanyRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user.companyId) {
        return res.status(403).json({
          message: "You must belong to a company to perform this action"
        });
      }

      if (!user.companyRole || !allowedRoles.includes(user.companyRole)) {
        return res.status(403).json({
          message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
        });
      }

      const companyId = req.params.id || req.params.companyId;
      if (user.companyId.toString() !== companyId) {
        return res.status(403).json({
          message: "You are not a member of this company"
        });
      }

      req.companyId = user.companyId;
      req.companyRole = user.companyRole;
      next();
    } catch (error) {
      res.status(500).json({
        message: error.message
      });
    }
  };
};

/**
 * Middleware to check if user is company owner
 */
const requireCompanyOwner = requireCompanyRole(['owner']);

/**
 * Middleware to check if user is company owner or admin
 */
const requireCompanyOwnerOrAdmin = requireCompanyRole(['owner', 'admin']);

module.exports = {
  requireCompanyMember,
  requireCompanyRole,
  requireCompanyOwner,
  requireCompanyOwnerOrAdmin
};
