const path = require("path");
const express = require("express");
const session = require("express-session");

require("dotenv").config({
    path: path.join(__dirname, "../.env")
});

const db = require("./config/db");
const MySQLSessionStore = require("./config/mysqlSessionStore");

const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const inspectorRoutes = require("./routes/inspectorRoutes");
const assistantRoutes = require("./routes/assistantRoutes");
const deputyCommissionerRoutes = require("./routes/deputyCommissionerRoutes");
const citizenRoutes = require("./routes/citizenRoutes");
const driverRoutes = require("./routes/driverRoutes");

const {
    requireAuth,
    requirePageRole
} = require("./middleware/authMiddleware");
const { isProfileCompleteForRole } = require("./controllers/profileController");
const { cleanupExpiredAccountTokens } = require("./controllers/accountLifecycleController");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required in .env");
}

if (IS_PRODUCTION) {
    const productionSecret = String(process.env.SESSION_SECRET || "");
    const placeholderSecret = /replace[-_ ]?with|change[-_ ]?me|your[-_ ]secret|example/i.test(productionSecret);
    if (productionSecret.length < 48 || new Set(productionSecret).size < 12 || placeholderSecret) {
        throw new Error("Production SESSION_SECRET must be a non-placeholder random secret of at least 48 characters.");
    }

    if (!String(process.env.APP_ORIGIN || "").trim()) {
        throw new Error("APP_ORIGIN is required in production.");
    }

    if (!String(process.env.DB_PASSWORD || "").trim()) {
        throw new Error("DB_PASSWORD must be configured for production.");
    }

    if (String(process.env.DB_USER || "").trim().toLowerCase() === "root") {
        throw new Error("Use a dedicated least-privilege MySQL account instead of root in production.");
    }
}

if (IS_PRODUCTION) {
    if (String(process.env.ALLOW_DEV_EMAIL_LINKS || "false").toLowerCase() === "true") {
        throw new Error("ALLOW_DEV_EMAIL_LINKS must not be enabled in production.");
    }
    const requiredMailSettings = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
    const missingMailSettings = requiredMailSettings.filter(name => !String(process.env[name] || "").trim());
    if (missingMailSettings.length) {
        throw new Error("Production account email delivery requires: " + missingMailSettings.join(", ") + ".");
    }

    const mailPlaceholders = [
        ["SMTP_HOST", /example\.com|smtp\.example|your[-_ ]/i],
        ["SMTP_USER", /your[-_ ]|example\.com/i],
        ["SMTP_PASS", /your[-_ ]|replace[-_ ]?with|change[-_ ]?me/i],
        ["SMTP_FROM", /example\.com|your[-_ ]/i]
    ];
    const placeholderMailSettings = mailPlaceholders
        .filter(([name, pattern]) => pattern.test(String(process.env[name] || "")))
        .map(([name]) => name);
    if (placeholderMailSettings.length) {
        throw new Error("Replace placeholder production mail settings: " + placeholderMailSettings.join(", ") + ".");
    }

    const smtpPort = Number(process.env.SMTP_PORT || 587);
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
        throw new Error("SMTP_PORT must be an integer from 1 to 65535.");
    }
    if (!["true", "false"].includes(String(process.env.SMTP_SECURE || "false").toLowerCase())) {
        throw new Error("SMTP_SECURE must be set to true or false.");
    }
}

const trustProxy = process.env.TRUST_PROXY;
if (IS_PRODUCTION) {
    if (trustProxy === undefined || String(trustProxy).trim() === "") {
        throw new Error("Set TRUST_PROXY explicitly in production. Use 1 for one trusted reverse proxy, or the number matching your proxy chain.");
    }

    const resolvedTrustProxy = Number(trustProxy);
    if (!Number.isInteger(resolvedTrustProxy) || resolvedTrustProxy < 0 || resolvedTrustProxy > 10) {
        throw new Error("Production TRUST_PROXY must be an integer between 0 and 10.");
    }

    app.set("trust proxy", resolvedTrustProxy);

    try {
        const parsedOrigin = new URL(String(process.env.APP_ORIGIN).trim());
        const host = parsedOrigin.hostname.toLowerCase();
        const placeholderHost = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" ||
            /(^|\.)example\.(com|org|net|invalid)$/.test(host) || host.endsWith(".example") || host.endsWith(".invalid") || host.endsWith(".test");
        if (
            parsedOrigin.protocol !== "https:" ||
            parsedOrigin.pathname !== "/" ||
            parsedOrigin.search ||
            parsedOrigin.hash ||
            parsedOrigin.username ||
            parsedOrigin.password ||
            placeholderHost
        ) {
            throw new Error("invalid origin shape");
        }
    } catch {
        throw new Error("Production APP_ORIGIN must be a valid HTTPS origin using your real public domain.");
    }
}

app.disable("x-powered-by");
app.set("etag", false);

// ---------------------------------------------------------
// Security headers
// ---------------------------------------------------------
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");

    if (IS_PRODUCTION) {
        res.setHeader(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains"
        );
    }

    if (req.path.startsWith("/api/")) {
        res.setHeader(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, private"
        );
        res.setHeader("Pragma", "no-cache");
    }

    // Do not let browser caches or shared proxies retain Citizen pages that
    // expose account/profile context. This also covers direct HTML entry URLs.
    if (
        req.path.startsWith("/citizenDash") ||
        ["/citizenRegister", "/verifyEmail", "/forgotPassword", "/resetPassword", "/accountSecurity/verifyEmail.html", "/accountSecurity/forgotPassword.html", "/accountSecurity/resetPassword.html"].includes(req.path)
    ) {
        res.setHeader(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, private"
        );
        res.setHeader("Pragma", "no-cache");
    }

    return next();
});

// ---------------------------------------------------------
// Request body parsing
// ---------------------------------------------------------
app.use(
    express.json({
        limit: "1mb",
        strict: true
    })
);
app.use(
    express.urlencoded({
        extended: true,
        limit: "100kb",
        parameterLimit: 200
    })
);

// ---------------------------------------------------------
// Persistent session store
// ---------------------------------------------------------
const sessionTtlHours = Number(process.env.SESSION_TTL_HOURS || 8);
const sessionTtlMs = Number.isFinite(sessionTtlHours) && sessionTtlHours > 0
    ? Math.min(sessionTtlHours, 24 * 30) * 60 * 60 * 1000
    : 8 * 60 * 60 * 1000;

const sessionStore = new MySQLSessionStore(db, {
    tableName: "sessions",
    ttlMs: sessionTtlMs
});

app.use(
    session({
        name: IS_PRODUCTION
            ? "__Host-swachhitra.sid"
            : "swachhitra.sid",
        secret: process.env.SESSION_SECRET,
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        proxy: IS_PRODUCTION,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: IS_PRODUCTION,
            maxAge: sessionTtlMs,
            path: "/"
        }
    })
);

// Redirect Citizens to their profile until the Ward has been derived from
// a saved address pin and verified against an available operational boundary.
async function requireCompletedCitizenProfile(req, res, next) {
    try {
        const [rows] = await db.execute(
            `
            SELECT
                full_name,
                mobile_number,
                address,
                city,
                postal_code,
                address_latitude,
                address_longitude,
                zone_id,
                ward_id
            FROM user_profiles
            WHERE user_id = ?
            LIMIT 1
            `,
            [req.currentUser.id]
        );

        if (!isProfileCompleteForRole("citizen", rows[0] || null)) {
            return res.redirect("/citizenDash/profile");
        }

        return next();
    } catch (error) {
        console.error("Citizen profile page guard failed:", error);
        return res.status(500).send("Unable to verify the Citizen profile.");
    }
}

// ---------------------------------------------------------
// Public pages
// ---------------------------------------------------------
app.get("/", (req, res) => {
    return res.sendFile(
        path.join(
            __dirname,
            "../client/dashboard/dashboard.html"
        )
    );
});

app.get("/login", (req, res) => {
    return res.sendFile(
        path.join(
            __dirname,
            "../client/login/login.html"
        )
    );
});

// ---------------------------------------------------------
// Protected profile page
// ---------------------------------------------------------
app.get(
    ["/profile", "/profile/"],
    requireAuth,
    (req, res) => {
        if (req.currentUser.role === "citizen") {
            return res.redirect("/citizenDash/profile");
        }

        return res.sendFile(
            path.join(
                __dirname,
                "../client/profile/profile.html"
            )
        );
    }
);

// ---------------------------------------------------------
// Protected Sanitary Inspector dashboard
// ---------------------------------------------------------
app.get(
    ["/inspectorDash", "/inspectorDash/"],
    requirePageRole("sanitary_inspector"),
    (req, res) => {
        return res.sendFile(
            path.join(
                __dirname,
                "../client/inspectorDash/inspectorDash.html"
            )
        );
    }
);

// ---------------------------------------------------------
// Protected Assistant Commissioner dashboard
// ---------------------------------------------------------
app.get(
    ["/assistantDash", "/assistantDash/"],
    requirePageRole("assistant_commissioner"),
    (req, res) => {
        res.setHeader(
            "Content-Security-Policy",
            [
                "default-src 'self'",
                "base-uri 'self'",
                "form-action 'self'",
                "frame-ancestors 'none'",
                "object-src 'none'",
                "script-src 'self' https://unpkg.com",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
                "font-src 'self' data: https://fonts.gstatic.com",
                "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
                "connect-src 'self' https://router.project-osrm.org",
                "worker-src 'self' blob:"
            ].join("; ")
        );

        return res.sendFile(
            path.join(
                __dirname,
                "../client/assistantDash/assistantDash.html"
            )
        );
    }
);

// ---------------------------------------------------------
// Protected Deputy Commissioner city-wide dashboard
// ---------------------------------------------------------
app.get(
    [
        "/deputyCommissionerDash",
        "/deputyCommissionerDash/",
        "/deputyCommissionerDash/deputyCommissionerDash.html"
    ],
    requirePageRole("deputy_commissioner"),
    (req, res) => {
        res.setHeader(
            "Content-Security-Policy",
            [
                "default-src 'self'",
                "base-uri 'self'",
                "form-action 'self'",
                "frame-ancestors 'none'",
                "object-src 'none'",
                "script-src 'self'",
                "style-src 'self' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com",
                "img-src 'self' data:",
                "connect-src 'self'"
            ].join("; ")
        );
        res.setHeader(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, private"
        );
        res.setHeader("Pragma", "no-cache");
        return res.sendFile(
            path.join(
                __dirname,
                "../client/deputyCommissionerDash/deputyCommissionerDash.html"
            )
        );
    }
);

// ---------------------------------------------------------
// Direct protected dashboard HTML entry points
// ---------------------------------------------------------
app.get(
    "/inspectorDash/inspectorDash.html",
    requirePageRole("sanitary_inspector"),
    (req, res) => {
        return res.sendFile(
            path.join(
                __dirname,
                "../client/inspectorDash/inspectorDash.html"
            )
        );
    }
);

app.get(
    "/assistantDash/assistantDash.html",
    requirePageRole("assistant_commissioner"),
    (req, res) => {
        res.setHeader(
            "Content-Security-Policy",
            [
                "default-src 'self'",
                "base-uri 'self'",
                "form-action 'self'",
                "frame-ancestors 'none'",
                "object-src 'none'",
                "script-src 'self' https://unpkg.com",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
                "font-src 'self' data: https://fonts.gstatic.com",
                "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
                "connect-src 'self' https://router.project-osrm.org",
                "worker-src 'self' blob:"
            ].join("; ")
        );

        return res.sendFile(
            path.join(
                __dirname,
                "../client/assistantDash/assistantDash.html"
            )
        );
    }
);

// ---------------------------------------------------------
// Public Citizen registration page
// ---------------------------------------------------------
app.get("/citizenRegister", (req, res) => {
    res.setHeader(
        "Content-Security-Policy",
        [
            "default-src 'self'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "object-src 'none'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data:"
        ].join("; ")
    );
    return res.sendFile(
        path.join(__dirname, "../client/citizenDash/citizenRegister.html")
    );
});

// ---------------------------------------------------------
// Public account lifecycle pages: email verification and password recovery
// ---------------------------------------------------------
function sendAccountSecurityPage(res, fileName) {
    if (fileName === "verifyEmail.html" || fileName === "resetPassword.html") {
        // Avoid disclosing one-time tokens through Referer headers.
        res.setHeader("Referrer-Policy", "no-referrer");
    }
    res.setHeader(
        "Content-Security-Policy",
        [
            "default-src 'self'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "object-src 'none'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data:",
            "connect-src 'self'"
        ].join("; ")
    );
    return res.sendFile(path.join(__dirname, "../client/accountSecurity", fileName));
}

app.get(["/verifyEmail", "/verifyEmail/"], (req, res) => sendAccountSecurityPage(res, "verifyEmail.html"));
app.get(["/forgotPassword", "/forgotPassword/"], (req, res) => sendAccountSecurityPage(res, "forgotPassword.html"));
app.get(["/resetPassword", "/resetPassword/"], (req, res) => sendAccountSecurityPage(res, "resetPassword.html"));
app.get("/accountSecurity/verifyEmail.html", (req, res) => sendAccountSecurityPage(res, "verifyEmail.html"));
app.get("/accountSecurity/forgotPassword.html", (req, res) => sendAccountSecurityPage(res, "forgotPassword.html"));
app.get("/accountSecurity/resetPassword.html", (req, res) => sendAccountSecurityPage(res, "resetPassword.html"));

// ---------------------------------------------------------
// Protected Citizen profile (map pin + automatic Ward resolution)
// ---------------------------------------------------------
app.get(
    ["/citizenDash/profile", "/citizenDash/profile/"],
    requirePageRole("citizen"),
    (req, res) => {
        res.setHeader(
            "Content-Security-Policy",
            [
                "default-src 'self'",
                "base-uri 'self'",
                "form-action 'self'",
                "frame-ancestors 'none'",
                "object-src 'none'",
                "script-src 'self' https://unpkg.com",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
                "font-src 'self' data: https://fonts.gstatic.com",
                "img-src 'self' data: blob: https://unpkg.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
                "connect-src 'self' https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
                "worker-src 'self' blob:"
            ].join("; ")
        );
        return res.sendFile(
            path.join(__dirname, "../client/citizenDash/citizenProfile.html")
        );
    }
);

// Direct HTML entry point is protected just like the pretty URL.
app.get(
    "/citizenDash/citizenProfile.html",
    requirePageRole("citizen"),
    (req, res) => {
        res.setHeader(
            "Content-Security-Policy",
            [
                "default-src 'self'",
                "base-uri 'self'",
                "form-action 'self'",
                "frame-ancestors 'none'",
                "object-src 'none'",
                "script-src 'self' https://unpkg.com",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
                "font-src 'self' data: https://fonts.gstatic.com",
                "img-src 'self' data: blob: https://unpkg.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
                "connect-src 'self' https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
                "worker-src 'self' blob:"
            ].join("; ")
        );
        return res.sendFile(
            path.join(__dirname, "../client/citizenDash/citizenProfile.html")
        );
    }
);

// ---------------------------------------------------------
// Protected Citizen dashboard
// ---------------------------------------------------------
app.get(
    ["/citizenDash", "/citizenDash/"],
    requirePageRole("citizen"),
    requireCompletedCitizenProfile,
    (req, res) => {
        res.setHeader(
            "Content-Security-Policy",
            [
                "default-src 'self'",
                "base-uri 'self'",
                "form-action 'self'",
                "frame-ancestors 'none'",
                "object-src 'none'",
                "script-src 'self'",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com",
                "img-src 'self' data:"
            ].join("; ")
        );
        return res.sendFile(
            path.join(__dirname, "../client/citizenDash/citizenDash.html")
        );
    }
);

app.get(
    "/citizenDash/citizenDash.html",
    requirePageRole("citizen"),
    requireCompletedCitizenProfile,
    (req, res) => {
        res.setHeader(
            "Content-Security-Policy",
            [
                "default-src 'self'",
                "base-uri 'self'",
                "form-action 'self'",
                "frame-ancestors 'none'",
                "object-src 'none'",
                "script-src 'self'",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com",
                "img-src 'self' data:"
            ].join("; ")
        );
        return res.sendFile(
            path.join(__dirname, "../client/citizenDash/citizenDash.html")
        );
    }
);

// ---------------------------------------------------------
// Static frontend assets
// ---------------------------------------------------------
app.use(
    express.static(
        path.join(__dirname, "../client")
    )
);

// ---------------------------------------------------------
// API routes
// ---------------------------------------------------------
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/inspector", inspectorRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/deputy", deputyCommissionerRoutes);
app.use("/api/citizen", citizenRoutes);
app.use("/api/driver", driverRoutes);

// ---------------------------------------------------------
// Health and readiness checks
// /api/health confirms the process and database pool respond.
// /api/ready confirms the minimum application tables are available.
// Production responses intentionally avoid exposing schema details.
// ---------------------------------------------------------
app.get("/api/health", async (req, res) => {
    try {
        await db.execute("SELECT 1");

        return res.json({
            success: true,
            status: "ok",
            database: "connected"
        });
    } catch (error) {
        console.error("Health check failed:", error?.code || "database_error");

        return res.status(503).json({
            success: false,
            status: "error",
            database: "disconnected"
        });
    }
});

const REQUIRED_RUNTIME_TABLES = [
    "users",
    "user_profiles",
    "divisions",
    "zones",
    "wards",
    "routes",
    "route_assignments",
    "route_stops",
    "drivers",
    "vehicles",
    "inspector_operational_areas",
    "complaints",
    "citizen_account_security",
    "citizen_account_tokens",
    "sessions"
];

app.get("/api/ready", async (req, res) => {
    try {
        await db.execute("SELECT 1");
        const placeholders = REQUIRED_RUNTIME_TABLES.map(() => "?").join(", ");
        const [rows] = await db.execute(
            `SELECT TABLE_NAME
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN (${placeholders})`,
            REQUIRED_RUNTIME_TABLES
        );
        const present = new Set(rows.map(row => String(row.TABLE_NAME)));
        const missingTables = REQUIRED_RUNTIME_TABLES.filter(table => !present.has(table));

        if (missingTables.length) {
            console.error("Readiness check failed: required database tables are missing.");
            return res.status(503).json({
                success: false,
                status: "not_ready",
                ...(IS_PRODUCTION ? {} : { missingTables })
            });
        }

        return res.json({
            success: true,
            status: "ready",
            checks: {
                database: "ok",
                requiredTables: "ok",
                accountSecuritySchema: "ok"
            }
        });
    } catch (error) {
        console.error("Readiness check failed:", error?.code || "database_error");
        return res.status(503).json({
            success: false,
            status: "not_ready"
        });
    }
});

// ---------------------------------------------------------
// API 404 handler
// ---------------------------------------------------------
app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({
            success: false,
            message: "API endpoint not found."
        });
    }

    return next();
});

// ---------------------------------------------------------
// Controlled API error handler
// ---------------------------------------------------------
app.use((error, req, res, next) => {
    console.error("Unhandled request error:", error);

    if (req.path.startsWith("/api/")) {
        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }

    return next(error);
});

// ---------------------------------------------------------
// Page 404 handler
// ---------------------------------------------------------
app.use((req, res) => {
    return res.status(404).send(
        "<h1>404</h1><p>Page not found.</p>"
    );
});

let runningServer = null;
let sessionCleanupTimer = null;
let accountTokenCleanupTimer = null;
let shutdownStarted = false;

async function startServer() {
    await sessionStore.ensureTable();
    sessionCleanupTimer = sessionStore.startCleanup();
    await cleanupExpiredAccountTokens();
    accountTokenCleanupTimer = setInterval(() => {
        cleanupExpiredAccountTokens().catch(error => {
            console.error("Account token cleanup failed:", error?.code || "database_error");
        });
    }, 6 * 60 * 60 * 1000);
    accountTokenCleanupTimer.unref?.();

    runningServer = app.listen(PORT, () => {
        console.log(`SWACHHITRA listening on port ${PORT} (${process.env.NODE_ENV || "development"}).`);
    });

    runningServer.requestTimeout = 30 * 1000;
    runningServer.headersTimeout = 15 * 1000;
    runningServer.keepAliveTimeout = 5 * 1000;

    runningServer.on("error", error => {
        console.error("SWACHHITRA HTTP server error:", error?.code || "server_error");
        if (!runningServer?.listening) {
            db.end().catch(() => {}).finally(() => {
                process.exitCode = 1;
            });
        }
    });

    return runningServer;
}

async function shutdown(signal) {
    if (shutdownStarted) return;
    shutdownStarted = true;
    console.log(`SWACHHITRA received ${signal}; starting graceful shutdown.`);

    if (sessionCleanupTimer) clearInterval(sessionCleanupTimer);
    if (accountTokenCleanupTimer) clearInterval(accountTokenCleanupTimer);

    const forcedCloseTimer = setTimeout(() => {
        console.error("Graceful shutdown timeout reached; closing active HTTP connections.");
        runningServer?.closeAllConnections?.();
    }, 12000);
    forcedCloseTimer.unref?.();

    try {
        if (runningServer?.listening) {
            await new Promise((resolve, reject) => {
                runningServer.close(error => error ? reject(error) : resolve());
            });
        }
        await db.end();
        clearTimeout(forcedCloseTimer);
        console.log("SWACHHITRA shutdown completed.");
    } catch (error) {
        clearTimeout(forcedCloseTimer);
        console.error("SWACHHITRA shutdown failed:", error?.code || "shutdown_error");
        process.exitCode = 1;
    }
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

startServer().catch(error => {
    console.error("SWACHHITRA failed to start:", error?.code || error?.message || "startup_error");
    process.exit(1);
});
