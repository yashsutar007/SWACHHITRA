"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const {
    configurationStatus,
    verifySmtpConnection,
    sendAccountEmail
} = require("../utils/emailService");

function cleanCode(value) {
    return String(value || "error").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "error";
}

async function main() {
    const status = configurationStatus();
    if (!status.configured) {
        console.error("SMTP is not fully configured. Missing/invalid settings:");
        for (const name of status.missing) console.error(` - ${name}`);
        console.error("Edit the project-root .env file, restart the server, then run this script again.");
        process.exitCode = 2;
        return;
    }

    try {
        await verifySmtpConnection();
        console.log("PASS: SMTP connection and authentication verified.");
    } catch (error) {
        console.error(`FAIL: SMTP verification failed (${cleanCode(error.code)}).`);
        console.error("Check host, port, secure mode, username/password, outbound network access, and provider app-password requirements.");
        process.exitCode = 1;
        return;
    }

    const to = String(process.env.TEST_EMAIL_TO || "").trim();
    if (!to) {
        console.log("Connection test complete. To send a real test message, set TEST_EMAIL_TO in this terminal and rerun.");
        return;
    }

    try {
        await sendAccountEmail({
            to,
            subject: "SWACHHITRA email delivery test",
            text: "This is a test message confirming that SWACHHITRA can send account emails through the configured SMTP provider.",
            html: "<p>This is a test message confirming that SWACHHITRA can send account emails through the configured SMTP provider.</p>"
        });
        console.log("PASS: Test email accepted by the SMTP provider. Check the recipient inbox and Spam/Junk folder.");
    } catch (error) {
        console.error(`FAIL: Test email send failed (${cleanCode(error.code)}).`);
        console.error("The SMTP connection succeeded, but message delivery was rejected. Check SMTP_FROM sender verification and recipient/provider restrictions.");
        process.exitCode = 1;
    }
}

main().catch(error => {
    console.error(`FAIL: Email test ended unexpectedly (${cleanCode(error.code)}).`);
    process.exitCode = 1;
});
