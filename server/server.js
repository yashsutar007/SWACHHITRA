const express = require("express");
const path = require("path");

const app = express();

const PORT = 5000;


// ===============================
// Middleware
// ===============================

app.use(express.json());


// ===============================
// Serve frontend
// ===============================

app.use(
    express.static(
        path.join(
            __dirname,
            "../client"
        )
    )
);


// ===============================
// Backend health check
// ===============================

app.get("/api/health", (req, res) => {

    res.json({

        success: true,

        message:
            "SWACHHITRA backend is running."

    });

});

// ===============================
// Start server
// ===============================

app.listen(
    PORT,
    () => {

        console.log(
            `SWACHHITRA running at http://localhost:${PORT}`
        );

    }
);
