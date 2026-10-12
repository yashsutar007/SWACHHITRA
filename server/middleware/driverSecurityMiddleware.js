"use strict";

const crypto = require("crypto");

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SESSION_KEY = "driverCsrfToken";
const WINDOW_MS = 60 * 1000;
const DEFAULT_LIMIT = 40;
const buckets = new Map();
let cleanupStarted = false;

function ensureCleanup() {
    if (cleanupStarted) return;
    cleanupStarted = true;
    const timer = setInterval(() => {
        const now = Date.now();
        for (const [key, value] of buckets) {
            if (now - value.started >= WINDOW_MS) buckets.delete(key);
        }
    }, WINDOW_MS);
    timer.unref?.();
}

function ensureDriverCsrfToken(req, res) {
    if (!req.session) {
        return res.status(500).json({ success: false, message: "Secure session is unavailable." });
    }
    if (!req.session[SESSION_KEY]) req.session[SESSION_KEY] = crypto.randomBytes(32).toString("hex");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    return res.json({ success: true, csrfToken: req.session[SESSION_KEY] });
}

function requireDriverMutationSecurity(req, res, next) {
    if (!WRITE_METHODS.has(req.method)) return next();
    ensureCleanup();

    const origin = String(req.get("origin") || "").trim().replace(/\/$/, "");
    const configured = String(process.env.APP_ORIGIN || "").trim().replace(/\/$/, "");
    const protocol = req.secure ? "https" : "http";
    const expected = configured || (req.get("host") ? `${protocol}://${req.get("host")}` : "");

    if (origin && (!expected || origin !== expected)) {
        return res.status(403).json({ success: false, message: "Request origin is not allowed." });
    }

    const supplied = String(req.get("x-csrf-token") || "");
    const expectedToken = String(req.session?.[SESSION_KEY] || "");
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expectedToken);

    if (!supplied || !expectedToken || suppliedBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
        return res.status(403).json({
            success: false,
            code: "CSRF_TOKEN_INVALID",
            message: "Security token missing or invalid. Refresh the Driver dashboard and try again."
        });
    }

    const userId = req.currentUser?.id || req.session?.userId || "anonymous";
    const key = `${req.ip || "unknown"}::${userId}`;
    const now = Date.now();
    const limit = Number.isInteger(Number(process.env.DRIVER_WRITE_RATE_LIMIT))
        ? Math.max(1, Math.min(200, Number(process.env.DRIVER_WRITE_RATE_LIMIT)))
        : DEFAULT_LIMIT;
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.started >= WINDOW_MS) bucket = { started: now, count: 0 };
    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > limit) {
        res.setHeader("Retry-After", "60");
        return res.status(429).json({ success: false, message: "Too many route updates. Wait and try again." });
    }
    return next();
}

module.exports = { ensureDriverCsrfToken, requireDriverMutationSecurity };
