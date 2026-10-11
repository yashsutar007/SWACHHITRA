const crypto = require("crypto");

const REGISTRATION_WINDOW_MS = 15 * 60 * 1000;
const REGISTRATION_MAX_ATTEMPTS = 5;
const CITIZEN_WRITE_WINDOW_MS = 10 * 60 * 1000;
const CITIZEN_WRITE_MAX_ATTEMPTS = 20;

const registrationBuckets = new Map();
const citizenWriteBuckets = new Map();

function getExpectedOrigin(req) {
    const configured = String(process.env.APP_ORIGIN || "").trim();

    if (process.env.NODE_ENV === "production" && configured) {
        try {
            return new URL(configured).origin;
        } catch {
            return null;
        }
    }

    const protocol = req.protocol || "http";
    const host = String(req.get("host") || "").trim();

    if (!host) {
        return null;
    }

    return `${protocol}://${host}`;
}

function hasAllowedOrigin(req) {
    const origin = String(req.get("origin") || "").trim();
    const expectedOrigin = getExpectedOrigin(req);

    if (!origin) {
        return process.env.NODE_ENV !== "production";
    }

    if (!expectedOrigin) {
        return false;
    }

    try {
        const originUrl = new URL(origin);
        if (originUrl.origin === expectedOrigin) {
            return true;
        }

        const configured = String(process.env.APP_ORIGIN || "").trim();
        if (configured) {
            return originUrl.origin === new URL(configured).origin;
        }

        return false;
    } catch {
        return false;
    }
}

function getClientKey(req) {
    return String(req.ip || req.socket?.remoteAddress || "unknown");
}

function rateLimit(bucketMap, key, windowMs, maxAttempts) {
    const now = Date.now();
    const current = bucketMap.get(key);

    if (!current || now - current.windowStartedAt >= windowMs) {
        bucketMap.set(key, {
            windowStartedAt: now,
            count: 1
        });
        return { allowed: true, retryAfterSeconds: 0 };
    }

    if (current.count >= maxAttempts) {
        return {
            allowed: false,
            retryAfterSeconds: Math.max(
                1,
                Math.ceil((windowMs - (now - current.windowStartedAt)) / 1000)
            )
        };
    }

    current.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
}

function pruneBuckets() {
    const now = Date.now();

    for (const [key, value] of registrationBuckets) {
        if (now - value.windowStartedAt > REGISTRATION_WINDOW_MS * 2) {
            registrationBuckets.delete(key);
        }
    }

    for (const [key, value] of citizenWriteBuckets) {
        if (now - value.windowStartedAt > CITIZEN_WRITE_WINDOW_MS * 2) {
            citizenWriteBuckets.delete(key);
        }
    }
}

function validateCitizenRegistrationPayload(req, res) {
    // Reject cheap, malformed inputs before consuming the rate-limit budget.
    // The controller repeats these checks as defense in depth.
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const confirmation = String(
        req.body?.confirm_password || req.body?.password_confirmation || ""
    );

    if (!email || email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({
            success: false,
            code: "INVALID_EMAIL",
            message: "Enter a valid email address."
        });
        return false;
    }

    if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
        res.status(400).json({
            success: false,
            code: "INVALID_PASSWORD",
            message: "Password must be at least 12 characters and no more than 72 UTF-8 bytes."
        });
        return false;
    }

    if (password !== confirmation) {
        res.status(400).json({
            success: false,
            code: "PASSWORD_MISMATCH",
            message: "Password and confirmation do not match."
        });
        return false;
    }

    return true;
}

function protectCitizenRegistration(req, res, next) {
    pruneBuckets();

    if (!hasAllowedOrigin(req)) {
        return res.status(403).json({
            success: false,
            code: "ORIGIN_REJECTED",
            message: "Registration request origin is not allowed."
        });
    }

    if (!validateCitizenRegistrationPayload(req, res)) {
        return;
    }

    const key = getClientKey(req);
    const limit = rateLimit(
        registrationBuckets,
        key,
        REGISTRATION_WINDOW_MS,
        REGISTRATION_MAX_ATTEMPTS
    );

    if (!limit.allowed) {
        res.setHeader("Retry-After", String(limit.retryAfterSeconds));
        return res.status(429).json({
            success: false,
            code: "REGISTRATION_RATE_LIMITED",
            message: "Too many registration attempts. Try again later."
        });
    }

    return next();
}

function issueCitizenCsrfToken(req, res) {
    if (!req.session.citizenCsrfToken) {
        req.session.citizenCsrfToken = crypto.randomBytes(32).toString("hex");
    }

    return res.json({
        success: true,
        csrfToken: req.session.citizenCsrfToken
    });
}

function protectCitizenMutation(req, res, next) {
    pruneBuckets();

    if (!hasAllowedOrigin(req)) {
        return res.status(403).json({
            success: false,
            code: "ORIGIN_REJECTED",
            message: "Request origin is not allowed."
        });
    }

    const supplied = String(req.get("x-csrf-token") || "");
    const expected = String(req.session?.citizenCsrfToken || "");

    let validToken = false;
    if (supplied && expected) {
        const suppliedBytes = Buffer.from(supplied, "utf8");
        const expectedBytes = Buffer.from(expected, "utf8");
        validToken =
            suppliedBytes.length === expectedBytes.length &&
            crypto.timingSafeEqual(suppliedBytes, expectedBytes);
    }

    if (!validToken) {
        return res.status(403).json({
            success: false,
            code: supplied ? "CSRF_TOKEN_INVALID" : "CSRF_TOKEN_MISSING",
            message: "Refresh the page and try again."
        });
    }

    const userId = Number(req.currentUser?.id || 0);
    const key = `${userId}:${getClientKey(req)}`;
    const limit = rateLimit(
        citizenWriteBuckets,
        key,
        CITIZEN_WRITE_WINDOW_MS,
        CITIZEN_WRITE_MAX_ATTEMPTS
    );

    if (!limit.allowed) {
        res.setHeader("Retry-After", String(limit.retryAfterSeconds));
        return res.status(429).json({
            success: false,
            code: "CITIZEN_WRITE_RATE_LIMITED",
            message: "Too many profile changes. Try again later."
        });
    }

    return next();
}

module.exports = {
    protectCitizenRegistration,
    issueCitizenCsrfToken,
    protectCitizenMutation,
    hasAllowedOrigin
};
