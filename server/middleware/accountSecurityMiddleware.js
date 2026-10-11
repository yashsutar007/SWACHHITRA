
"use strict";

const { hasAllowedOrigin } = require("./citizenSecurityMiddleware");

const buckets = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 40;
const PUBLIC_ACTION_MAX = 10;

function clientIp(req) {
    return String(req.ip || req.socket?.remoteAddress || "unknown").slice(0, 100);
}

function prune() {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
        if (now - bucket.startedAt >= WINDOW_MS * 2) buckets.delete(key);
    }
    if (buckets.size > 20000) {
        const entries = [...buckets.entries()].sort((a, b) => a[1].startedAt - b[1].startedAt);
        for (let i = 0; i < entries.length - 10000; i += 1) buckets.delete(entries[i][0]);
    }
}

function limit(name, maxAttempts) {
    return function accountSecurityRateLimit(req, res, next) {
        prune();
        if (!hasAllowedOrigin(req)) {
            return res.status(403).json({
                success: false,
                code: "ORIGIN_REJECTED",
                message: "Request origin is not allowed."
            });
        }

        const key = `${name}:${clientIp(req)}`;
        const now = Date.now();
        let bucket = buckets.get(key);
        if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
            bucket = { startedAt: now, count: 0 };
            buckets.set(key, bucket);
        }

        if (bucket.count >= maxAttempts) {
            const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.startedAt)) / 1000));
            res.setHeader("Retry-After", String(retryAfter));
            return res.status(429).json({
                success: false,
                code: "ACCOUNT_SECURITY_RATE_LIMITED",
                message: "Too many attempts. Please wait and try again."
            });
        }

        bucket.count += 1;
        return next();
    };
}

const protectLogin = limit("login", LOGIN_MAX);
const protectLogout = limit("logout", 60);
const protectVerificationRequest = limit("verification-request", PUBLIC_ACTION_MAX);
const protectVerificationConfirm = limit("verification-confirm", 20);
const protectForgotPassword = limit("forgot-password", PUBLIC_ACTION_MAX);
const protectResetPassword = limit("reset-password", PUBLIC_ACTION_MAX);

module.exports = {
    protectLogin,
    protectLogout,
    protectVerificationRequest,
    protectVerificationConfirm,
    protectForgotPassword,
    protectResetPassword
};
