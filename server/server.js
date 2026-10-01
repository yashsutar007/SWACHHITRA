const path = require("path");
const express = require("express");
const session = require("express-session");

require("dotenv").config({
    path: path.join(__dirname, "../.env")
});

const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const inspectorRoutes = require("./routes/inspectorRoutes");

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

// Request body parsing
app.use(express.json());
app.use(
    express.urlencoded({
        extended: true
    })
);

// Session
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

// Serve the frontend
app.use(
    express.static(
        path.join(__dirname, "../client")
    )
);

// Public dashboard
app.get("/", (req, res) => {
    return res.sendFile(
        path.join(
            __dirname,
            "../client/dashboard/dashboard.html"
        )
    );
});

// Login page
app.get("/login", (req, res) => {
    return res.sendFile(
        path.join(
            __dirname,
            "../client/login/login.html"
        )
    );
});

// Profile page
app.get(
    "/profile",
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

// Sanitary Inspector dashboard
app.get(
    "/inspectorDash",
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

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/inspector", inspectorRoutes);

// Database / server health check
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

// API 404 handler
app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({
            success: false,
            message: "API endpoint not found."
        });
    }

    return next();
});

// Page 404 handler
app.use((req, res) => {
    return res.status(404).send(
        "<h1>404</h1><p>Page not found.</p>"
    );
});

// Start server
app.listen(PORT, () => {
    console.log(
        `SWACHHITRA running at http://localhost:${PORT}`
    );
});
