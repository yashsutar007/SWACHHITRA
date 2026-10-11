"use strict";

const crypto = require("crypto");

const WRITE_METHODS = new Set([
    "POST",
    "PUT",
    "PATCH",
    "DELETE"
]);

const CSRF_SESSION_KEY = "assistantCsrfToken";
const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_WRITE_LIMIT = 60;

const rateBuckets = new Map();
let cleanupTimer = null;

function getClientKey(req) {
    const userId = req.currentUser?.id || req.session?.userId || "anonymous";
    return `${String(req.ip || "unknown")}::${String(userId)}`;
}

function getConfiguredWriteLimit() {
    const parsed = Number(
        process.env.ASSISTANT_WRITE_RATE_LIMIT || DEFAULT_WRITE_LIMIT
    );

    return Number.isInteger(parsed) && parsed > 0
        ? Math.min(parsed, 600)
        : DEFAULT_WRITE_LIMIT;
}

function createToken() {
    return crypto.randomBytes(32).toString("hex");
}

function ensureCleanupTimer() {
    if (cleanupTimer) {
        return;
    }

    cleanupTimer = setInterval(() => {
        const now = Date.now();

        for (const [key, bucket] of rateBuckets.entries()) {
            if (now - bucket.windowStartedAt >= DEFAULT_WINDOW_MS) {
                rateBuckets.delete(key);
            }
        }
    }, DEFAULT_WINDOW_MS);

    cleanupTimer.unref?.();
}

function ensureAssistantCsrfToken(req, res) {
    ensureCleanupTimer();

    if (!req.session) {
        return res.status(500).json({
            success: false,
            message: "Secure session is unavailable."
        });
    }

    if (!req.session[CSRF_SESSION_KEY]) {
        req.session[CSRF_SESSION_KEY] = createToken();
    }

    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, private"
    );
    res.setHeader("Pragma", "no-cache");

    return res.json({
        success: true,
        csrfToken: req.session[CSRF_SESSION_KEY]
    });
}

function expectedOrigin(req) {
    const configured = String(process.env.APP_ORIGIN || "")
        .trim()
        .replace(/\/$/, "");

    if (configured) {
        return configured;
    }

    const protocol = req.secure ? "https" : "http";
    const host = req.get("host");

    return host ? `${protocol}://${host}` : "";
}

function requireAssistantSameOrigin(req, res, next) {
    const origin = String(req.get("origin") || "")
        .trim()
        .replace(/\/$/, "");

    if (origin) {
        const expected = expectedOrigin(req);

        if (!expected || origin !== expected) {
            return res.status(403).json({
                success: false,
                code: "ORIGIN_NOT_ALLOWED",
                message: "Request origin is not allowed."
            });
        }
    }

    return next();
}

function requireAssistantCsrfToken(req, res, next) {
    const supplied = String(req.get("x-csrf-token") || "").trim();
    const expected = String(
        req.session?.[CSRF_SESSION_KEY] || ""
    ).trim();

    if (!supplied || !expected) {
        return res.status(403).json({
            success: false,
            code: "CSRF_TOKEN_MISSING",
            message: "Security token required. Refresh the Assistant Commissioner dashboard and try again."
        });
    }

    const suppliedBuffer = Buffer.from(supplied, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    if (
        suppliedBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(
            suppliedBuffer,
            expectedBuffer
        )
    ) {
        return res.status(403).json({
            success: false,
            code: "CSRF_TOKEN_INVALID",
            message: "Security token is invalid or expired. Refresh the Assistant Commissioner dashboard and try again."
        });
    }

    return next();
}

function requireAssistantMutationRateLimit(req, res, next) {
    ensureCleanupTimer();

    const key = getClientKey(req);
    const now = Date.now();
    const limit = getConfiguredWriteLimit();

    let bucket = rateBuckets.get(key);

    if (
        !bucket ||
        now - bucket.windowStartedAt >= DEFAULT_WINDOW_MS
    ) {
        bucket = {
            windowStartedAt: now,
            count: 0
        };
    }

    bucket.count += 1;
    rateBuckets.set(key, bucket);

    if (bucket.count > limit) {
        const retryAfterSeconds = Math.max(
            1,
            Math.ceil(
                (
                    DEFAULT_WINDOW_MS -
                    (now - bucket.windowStartedAt)
                ) / 1000
            )
        );

        res.setHeader(
            "Retry-After",
            String(retryAfterSeconds)
        );

        return res.status(429).json({
            success: false,
            code: "ASSISTANT_WRITE_RATE_LIMITED",
            message: "Too many Assistant Commissioner update requests. Please wait and try again."
        });
    }

    return next();
}

function requireAssistantMutationSecurity(req, res, next) {
    if (!WRITE_METHODS.has(req.method)) {
        return next();
    }

    return requireAssistantMutationRateLimit(
        req,
        res,
        () => requireAssistantSameOrigin(
            req,
            res,
            () => requireAssistantCsrfToken(
                req,
                res,
                next
            )
        )
    );
}

module.exports = {
    ensureAssistantCsrfToken,
    requireAssistantMutationSecurity
};
