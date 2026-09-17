const path = require("path");
const express = require("express");
const session = require("express-session");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const { requirePageRole } = require("./middleware/authMiddleware");

const app = express();
const PORT = Number(process.env.PORT || 5000);

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required in .env");
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
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
}));

app.use(express.static(path.join(__dirname, "../client")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dashboard/dashboard.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/login/login.html"));
});

app.get("/profile", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/profile/profile.html"));
});

app.get(
    "/InspectorDash",
    requirePageRole("sanitary_inspector"),
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "../client/InspectorDash/InspectorDash.html"
            )
        );
    }
);

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);

app.get("/api/health", async (req, res) => {
  try {
    const db = require("./config/db");
    await db.query("SELECT 1");
    res.json({ success: true, status: "ok", database: "connected" });
  } catch (error) {
    res.status(503).json({ success: false, status: "ok", database: "disconnected" });
  }
});

app.use((req, res) => {
  res.status(404).send("<h1>404</h1><p>Page not found.</p>");
});

app.listen(PORT, () => {
  console.log(`SWACHHITRA running at http://localhost:${PORT}`);
});
