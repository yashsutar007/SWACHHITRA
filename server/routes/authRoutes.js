"use strict";

const express = require("express");
const { login, me, logout } = require("../controllers/authController");
const {
    registerCitizen,
    requestEmailVerification,
    confirmEmailVerification,
    requestPasswordReset,
    resetPassword
} = require("../controllers/accountLifecycleController");
const {
    issueDriverRecoveryCode,
    issueInspectorRecoveryCode,
    resetPasswordWithRecoveryCode
} = require("../controllers/staffPasswordRecoveryController");
const { protectCitizenRegistration } = require("../middleware/citizenSecurityMiddleware");
const {
    protectLogin,
    protectLogout,
    protectVerificationRequest,
    protectVerificationConfirm,
    protectForgotPassword,
    protectResetPassword
} = require("../middleware/accountSecurityMiddleware");
const { requireRole } = require("../middleware/authMiddleware");
const { requireInspectorMutationSecurity } = require("../middleware/inspectorSecurityMiddleware");
const { requireAssistantMutationSecurity } = require("../middleware/assistantSecurityMiddleware");

const router = express.Router();

router.post("/register-citizen", protectCitizenRegistration, registerCitizen);
router.post("/login", protectLogin, login);
router.get("/me", me);
router.post("/logout", protectLogout, logout);

router.post("/citizen/verification/resend", protectVerificationRequest, requestEmailVerification);
router.post("/citizen/verification/confirm", protectVerificationConfirm, confirmEmailVerification);
router.post("/password/forgot", protectForgotPassword, requestPasswordReset);
router.post("/password/reset", protectResetPassword, resetPassword);

// Assignment-authorized staff password activation. Codes are issued only to
// an authenticated assigning authority and redeemed once through the public
// reset page after the backend rechecks that the assignment is still active.
router.post(
    "/password/activation/driver",
    requireRole("sanitary_inspector"),
    requireInspectorMutationSecurity,
    issueDriverRecoveryCode
);
router.post(
    "/password/activation/inspector",
    requireRole("assistant_commissioner"),
    requireAssistantMutationSecurity,
    issueInspectorRecoveryCode
);
router.post(
    "/password/reset-assigned-staff",
    protectResetPassword,
    resetPasswordWithRecoveryCode
);

module.exports = router;
