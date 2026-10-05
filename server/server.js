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

const {
    requireAuth,
    requirePageRole
} = require("./middleware/authMiddleware");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required in .env");
}

if (IS_PRODUCTION && process.env.SESSION_SECRET.length < 32) {
    throw new Error("Production SESSION_SECRET must be at least 32 characters long.");
}

if (IS_PRODUCTION && !String(process.env.APP_ORIGIN || "").trim()) {
    throw new Error("APP_ORIGIN is required in production.");
}

const trustProxy = process.env.TRUST_PROXY;
if (IS_PRODUCTION) {
    app.set("trust proxy", trustProxy === undefined ? 1 : Number(trustProxy));
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
        return res.sendFile(
            path.join(
                __dirname,
                "../client/assistantDash/assistantDash.html"
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
        return res.sendFile(
            path.join(
                __dirname,
                "../client/assistantDash/assistantDash.html"
            )
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

// ---------------------------------------------------------
// Database / server health check
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
        console.error("Health check failed:", error);

        return res.status(503).json({
            success: false,
            status: "error",
            database: "disconnected"
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

async function startServer() {
    await sessionStore.ensureTable();
    sessionStore.startCleanup();

    const server = app.listen(PORT, () => {
        console.log(
            `SWACHHITRA running at http://localhost:${PORT}`
        );
    });

    server.requestTimeout = 30 * 1000;
    server.headersTimeout = 15 * 1000;
    server.keepAliveTimeout = 5 * 1000;

    return server;
}

startServer().catch(error => {
    console.error("SWACHHITRA failed to start:", error);
    process.exit(1);
});
