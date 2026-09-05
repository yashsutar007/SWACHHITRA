const express = require("express");
const path = require("path");

const app = express();
const PORT = 5000;


// ==================================================
// MIDDLEWARE
// ==================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// ==================================================
// STATIC CLIENT FILES
// ==================================================

app.use(
    express.static(
        path.join(__dirname, "../client")
    )
);


// ==================================================
// DASHBOARD
// ==================================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "../client/dashboard/dashboard.html"
        )
    );

});


// ==================================================
// LOGIN / SIGN UP
// ==================================================

app.get("/login", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "../client/login/login.html"
        )
    );

});


// ==================================================
// LOGIN API
// ==================================================

app.post("/api/login", (req, res) => {

    res.json({
        success: false,
        message: "Authentication is not connected yet."
    });

});


// ==================================================
// PROFILE API
// ==================================================

app.post("/api/profile", (req, res) => {

    res.json({
        success: false,
        message: "Profile database is not connected yet."
    });

});


// ==================================================
// 404
// ==================================================

app.use((req, res) => {

    res.status(404).send(`
    
        <!DOCTYPE html>

        <html lang="en">

        <head>

            <meta charset="UTF-8">

            <meta
                name="viewport"
                content="width=device-width, initial-scale=1.0"
            >

            <title>SWACHHITRA | Page Not Found</title>

            <style>

                * {
                    box-sizing: border-box;
                }

                body {

                    margin: 0;

                    min-height: 100vh;

                    display: flex;

                    align-items: center;

                    justify-content: center;

                    background: #f2f6ed;

                    color: #052102;

                    font-family: Arial, sans-serif;

                }

                .error-container {

                    text-align: center;

                    padding: 50px;

                }

                .error-container h1 {

                    margin: 0;

                    font-size: 96px;

                    line-height: 1;

                    color: #315d0b;

                }

                .error-container h2 {

                    margin: 15px 0 10px;

                    font-size: 28px;

                }

                .error-container p {

                    margin: 0;

                    color: #667260;

                    font-size: 16px;

                }

                .back-button {

                    display: inline-block;

                    margin-top: 25px;

                    padding: 13px 25px;

                    border-radius: 10px;

                    background: #12360a;

                    color: white;

                    text-decoration: none;

                    transition: .25s ease;

                }

                .back-button:hover {

                    background: #294d1f;

                    transform: translateY(-2px);

                }

            </style>

        </head>

        <body>

            <div class="error-container">

                <h1>404</h1>

                <h2>Page Not Found</h2>

                <p>
                    The page you are looking for does not exist.
                </p>

                <a
                    href="/"
                    class="back-button"
                >
                    Back to Dashboard
                </a>

            </div>

        </body>

        </html>

    `);

});


// ==================================================
// START SERVER
// ==================================================

app.listen(PORT, () => {

    console.log("");
    console.log("======================================");
    console.log("        SWACHHITRA SERVER");
    console.log("======================================");

    console.log(
        `Server running at: http://localhost:${PORT}`
    );

    console.log(
        `Dashboard:         http://localhost:${PORT}/`
    );

    console.log(
        `Login:             http://localhost:${PORT}/login`
    );

    console.log("======================================");
    console.log("");

});
