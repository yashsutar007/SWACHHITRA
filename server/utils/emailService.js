"use strict";

const nodemailer = require("nodemailer");

let cachedTransporter = null;
let cachedTransporterKey = "";

function smtpConfig() {
    const host = String(process.env.SMTP_HOST || "").trim();
    const user = String(process.env.SMTP_USER || "").trim();
    const pass = String(process.env.SMTP_PASS || "");
    const from = String(process.env.SMTP_FROM || "").trim();
    const secureRaw = String(process.env.SMTP_SECURE || "").trim().toLowerCase();
    const secure = secureRaw === "true";
    const portNumber = Number(process.env.SMTP_PORT || (secure ? 465 : 587));

    if (
        !host || !user || !pass || !from ||
        !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535 ||
        (secureRaw && !["true", "false"].includes(secureRaw))
    ) {
        return null;
    }

    return { host, port: portNumber, secure, auth: { user, pass }, from };
}

function configurationStatus() {
    const config = smtpConfig();
    const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
    const missing = required.filter(name => !String(process.env[name] || "").trim());
    const secureRaw = String(process.env.SMTP_SECURE || "").trim().toLowerCase();
    const portRaw = String(process.env.SMTP_PORT || "").trim();
    if (secureRaw && !["true", "false"].includes(secureRaw)) missing.push("SMTP_SECURE (must be true or false)");
    if (portRaw && (!Number.isInteger(Number(portRaw)) || Number(portRaw) < 1 || Number(portRaw) > 65535)) missing.push("SMTP_PORT (must be 1-65535)");
    return {
        configured: Boolean(config),
        missing: [...new Set(missing)]
    };
}

function transporterFor(config) {
    // Rebuild if configuration was changed during local development/testing.
    const key = JSON.stringify({
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.auth.user,
        pass: config.auth.pass,
        from: config.from
    });

    if (!cachedTransporter || cachedTransporterKey !== key) {
        cachedTransporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            // On submission ports such as 587, refuse to send credentials or
            // message contents unless STARTTLS has been negotiated.
            requireTLS: !config.secure,
            auth: config.auth,
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
            disableFileAccess: true,
            disableUrlAccess: true
        });
        cachedTransporterKey = key;
    }
    return cachedTransporter;
}

function isConfigured() {
    return Boolean(smtpConfig());
}

async function verifySmtpConnection() {
    const config = smtpConfig();
    if (!config) {
        const error = new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS and SMTP_FROM in the project-root .env file.");
        error.code = "SMTP_NOT_CONFIGURED";
        throw error;
    }
    await transporterFor(config).verify();
    return { verified: true };
}

async function sendAccountEmail({ to, subject, text, html }) {
    const config = smtpConfig();
    if (!config) {
        if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
            const error = new Error("SMTP email delivery is not configured.");
            error.code = "SMTP_NOT_CONFIGURED";
            throw error;
        }
        return { sent: false, reason: "not_configured" };
    }

    const info = await transporterFor(config).sendMail({
        from: config.from,
        to,
        subject,
        text,
        html
    });

    // Nodemailer may resolve with per-recipient acceptance/rejection details.
    // This app sends to one address, so don't report success if no recipient was accepted.
    if (Array.isArray(info.rejected) && info.rejected.length > 0 && (!Array.isArray(info.accepted) || info.accepted.length === 0)) {
        const error = new Error("The SMTP provider rejected the recipient.");
        error.code = "EMAIL_RECIPIENT_REJECTED";
        throw error;
    }
    if (Array.isArray(info.accepted) && info.accepted.length === 0) {
        const error = new Error("The SMTP provider accepted no recipients.");
        error.code = "EMAIL_NO_RECIPIENT_ACCEPTED";
        throw error;
    }

    return {
        sent: true,
        messageId: info.messageId || null
    };
}

module.exports = {
    isConfigured,
    configurationStatus,
    verifySmtpConnection,
    sendAccountEmail
};
