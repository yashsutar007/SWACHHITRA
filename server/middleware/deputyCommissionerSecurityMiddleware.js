"use strict";

const crypto = require("crypto");

const SESSION_KEY = "deputyCsrfToken";
const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_WRITE_LIMIT = 12;
const buckets = new Map();
let cleanupTimer = null;

function getClientKey(req) {
    const userId = req.currentUser?.id || req.session?.userId || "anonymous";
    return `${String(req.ip || "unknown")}::${String(userId)}`;
}

function ensureCleanupTimer() {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, bucket] of buckets.entries()) {
            if (now - bucket.startedAt >= DEFAULT_WINDOW_MS) buckets.delete(key);
        }
    }, DEFAULT_WINDOW_MS);
    cleanupTimer.unref?.();
}

function expectedOrigin(req) {
    const configured = String(process.env.APP_ORIGIN || "").trim().replace(/\/$/, "");
    if (configured) return configured;
    const protocol = req.secure ? "https" : "http";
    const host = req.get("host");
    return host ? `${protocol}://${host}` : "";
}

function ensureDeputyCommissionerCsrfToken(req, res) {
    if (req.currentUser?.role !== "deputy_commissioner") {
        return res.status(403).json({ success: false, message: "Deputy Commissioner access is required." });
    }
    if (!req.session) {
        return res.status(500).json({ success: false, message: "Secure session is unavailable." });
    }
    if (!req.session[SESSION_KEY]) req.session[SESSION_KEY] = crypto.randomBytes(32).toString("hex");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    return res.json({ success: true, csrfToken: req.session[SESSION_KEY] });
}

function requireSameOrigin(req, res, next) {
    const origin = String(req.get("origin") || "").trim().replace(/\/$/, "");
    if (origin) {
        const expected = expectedOrigin(req);
        if (!expected || origin !== expected) {
            return res.status(403).json({ success: false, code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed." });
        }
    }
    return next();
}

function requireCsrf(req, res, next) {
    const supplied = String(req.get("x-csrf-token") || "").trim();
    const expected = String(req.session?.[SESSION_KEY] || "").trim();
    if (!supplied || !expected) {
        return res.status(403).json({ success: false, code: "CSRF_TOKEN_MISSING", message: "Security token required. Refresh the DC dashboard and try again." });
    }
    const suppliedBuffer = Buffer.from(supplied, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
        return res.status(403).json({ success: false, code: "CSRF_TOKEN_INVALID", message: "Security token is invalid. Refresh the DC dashboard and try again." });
    }
    return next();
}

function requireRateLimit(req, res, next) {
    ensureCleanupTimer();
    const now = Date.now();
    const key = getClientKey(req);
    const envLimit = Number(process.env.DC_WRITE_RATE_LIMIT || DEFAULT_WRITE_LIMIT);
    const limit = Number.isInteger(envLimit) && envLimit > 0 ? Math.min(envLimit, 120) : DEFAULT_WRITE_LIMIT;
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.startedAt >= DEFAULT_WINDOW_MS) bucket = { startedAt: now, count: 0 };
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > limit) {
        res.setHeader("Retry-After", "60");
        return res.status(429).json({ success: false, message: "Too many supervisory actions. Wait before trying again." });
    }
    return next();
}

function requireDeputyCommissionerMutationSecurity(req, res, next) {
    return requireSameOrigin(req, res, () => requireCsrf(req, res, () => requireRateLimit(req, res, next)));
}

module.exports = { ensureDeputyCommissionerCsrfToken, requireDeputyCommissionerMutationSecurity };
