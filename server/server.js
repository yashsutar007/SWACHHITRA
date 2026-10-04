const path = require("path");
const express = require("express");
const session = require("express-session");

require("dotenv").config({
    path: path.join(__dirname, "../.env")
});

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

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required in .env");
}

app.disable("x-powered-by");

// ---------------------------------------------------------
// Request body parsing
// ---------------------------------------------------------
app.use(express.json());
app.use(
    express.urlencoded({
        extended: true
    })
);

// ---------------------------------------------------------
// Session
// ---------------------------------------------------------
app.use(
    session({
        name: "swachhitra.sid",
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 1000 * 60 * 60 * 8
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
// Both entry URLs serve the same protected HTML directly.
// There is intentionally NO redirect between the two forms.
// The dashboard HTML uses a <base href="/assistantDash/"> so that
// relative asset paths such as ./assistantDash.css and ./assistantDash.js
// work correctly whether the browser URL has a trailing slash or not.
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
//
// The dashboard route above protects /inspectorDash and /assistantDash,
// but express.static() can also serve the HTML files directly by filename.
// Keep those HTML files behind the same role checks.
// CSS, JS and image assets remain publicly readable and contain no secrets.
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
//
// Keep this AFTER all protected page routes. This allows CSS, JS and
// public image assets to remain directly readable while protected HTML
// entry points are handled by authenticated routes above.
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
        const db = require("./config/db");

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
// Page 404 handler
// ---------------------------------------------------------
app.use((req, res) => {
    return res.status(404).send(
        "<h1>404</h1><p>Page not found.</p>"
    );
});

// ---------------------------------------------------------
// Start server
// ---------------------------------------------------------
app.listen(PORT, () => {
    console.log(
        `SWACHHITRA running at http://localhost:${PORT}`
    );
});
