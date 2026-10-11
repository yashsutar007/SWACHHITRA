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
const { protectCitizenRegistration } = require("../middleware/citizenSecurityMiddleware");
const {
    protectLogin,
    protectLogout,
    protectVerificationRequest,
    protectVerificationConfirm,
    protectForgotPassword,
    protectResetPassword
} = require("../middleware/accountSecurityMiddleware");

const router = express.Router();

router.post("/register-citizen", protectCitizenRegistration, registerCitizen);
router.post("/login", protectLogin, login);
router.get("/me", me);
router.post("/logout", protectLogout, logout);

router.post("/citizen/verification/resend", protectVerificationRequest, requestEmailVerification);
router.post("/citizen/verification/confirm", protectVerificationConfirm, confirmEmailVerification);
router.post("/password/forgot", protectForgotPassword, requestPasswordReset);
router.post("/password/reset", protectResetPassword, resetPassword);

module.exports = router;
