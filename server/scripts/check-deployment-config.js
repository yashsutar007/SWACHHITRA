"use strict";

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const ENV_PATH = path.join(PROJECT_ROOT, ".env");
const forceProduction = process.argv.includes("--production");

dotenv.config({ path: ENV_PATH });

const productionMode = forceProduction || String(process.env.NODE_ENV || "development").toLowerCase() === "production";
const errors = [];
const warnings = [];

function value(name) {
    return String(process.env[name] || "").trim();
}

function requireValue(name, message = `${name} must be configured.`) {
    if (!value(name)) errors.push(message);
}

function isPlaceholder(valueToCheck) {
    return /replace[-_ ]?with|change[-_ ]?me|your[-_ ]|example\.com|smtp\.example/i.test(String(valueToCheck || ""));
}

function checkInteger(name, fallback, min, max) {
    const raw = value(name) || String(fallback);
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
        errors.push(`${name} must be an integer from ${min} to ${max}.`);
    }
}

for (const name of ["DB_HOST", "DB_USER", "DB_NAME", "SESSION_SECRET"]) requireValue(name);
checkInteger("PORT", 5000, 1, 65535);
checkInteger("DB_PORT", 3306, 1, 65535);
checkInteger("DB_CONNECTION_LIMIT", 10, 1, 1000);
checkInteger("DB_CONNECT_TIMEOUT", 10000, 1000, 120000);
checkInteger("SESSION_TTL_HOURS", 8, 1, 720);

if (productionMode) {
    if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
        errors.push("Set NODE_ENV=production in the project-root .env before production validation.");
    }

    const secret = value("SESSION_SECRET");
    if (secret.length < 48 || new Set(secret).size < 12 || isPlaceholder(secret)) {
        errors.push("SESSION_SECRET must be a random, non-placeholder value of at least 48 characters.");
    }

    requireValue("APP_ORIGIN");
    try {
        const origin = new URL(value("APP_ORIGIN"));
        const host = origin.hostname.toLowerCase();
        const placeholderHost = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" ||
            /(^|\.)example\.(com|org|net|invalid)$/.test(host) || host.endsWith(".example") || host.endsWith(".invalid") || host.endsWith(".test");
        if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password || placeholderHost) {
            errors.push("APP_ORIGIN must be the real HTTPS origin only, for example https://your-real-domain/.");
        }
    } catch {
        errors.push("APP_ORIGIN must be a valid HTTPS origin.");
    }

    requireValue("TRUST_PROXY", "TRUST_PROXY must be explicitly set for production.");
    checkInteger("TRUST_PROXY", 1, 0, 10);
    requireValue("DB_PASSWORD", "DB_PASSWORD must be set for production.");
    if (value("DB_SSL").toLowerCase() !== "true") {
        errors.push("DB_SSL must be true for production MySQL connections.");
    }
    const databaseCa = value("DB_SSL_CA_BASE64");
    if (databaseCa) {
        const decodedCa = Buffer.from(databaseCa, "base64").toString("utf8");
        if (!decodedCa.includes("-----BEGIN CERTIFICATE-----") || !decodedCa.includes("-----END CERTIFICATE-----")) {
            errors.push("DB_SSL_CA_BASE64 must be a Base64-encoded PEM CA certificate when provided.");
        }
    }
    if (value("DB_USER").toLowerCase() === "root") {
        errors.push("Use a dedicated least-privilege MySQL user instead of root in production.");
    }
    if (String(process.env.ALLOW_DEV_EMAIL_LINKS || "false").toLowerCase() === "true") {
        errors.push("ALLOW_DEV_EMAIL_LINKS must be false in production.");
    }

    const requiredMailSettings = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
    const missingMailSettings = requiredMailSettings.filter(name => !value(name));
    const staffRecoveryWithoutSmtp = value("ALLOW_NO_SMTP_FOR_STAFF_RECOVERY").toLowerCase() === "true";
    if (missingMailSettings.length && !staffRecoveryWithoutSmtp) {
        for (const name of missingMailSettings) errors.push(`${name} must be configured for production email delivery, or explicitly enable ALLOW_NO_SMTP_FOR_STAFF_RECOVERY=true for the staff-only demo mode.`);
    } else if (missingMailSettings.length && staffRecoveryWithoutSmtp) {
        warnings.push("SMTP is not configured. Driver/Inspector password activation will use assignment-authorized one-time codes; Citizen registration is disabled until email is configured.");
    }
    if (!missingMailSettings.length) {
        for (const name of requiredMailSettings) {
            if (value(name) && isPlaceholder(value(name))) errors.push(`${name} still contains a placeholder value.`);
        }
        checkInteger("SMTP_PORT", 587, 1, 65535);
        if (!["true", "false"].includes((value("SMTP_SECURE") || "false").toLowerCase())) {
            errors.push("SMTP_SECURE must be true or false.");
        }
    }
} else {
    if (String(process.env.ALLOW_DEV_EMAIL_LINKS || "false").toLowerCase() === "true") {
        warnings.push("ALLOW_DEV_EMAIL_LINKS is enabled for local development. Never deploy with it enabled.");
    }
    if (!value("SMTP_HOST") || !value("SMTP_USER") || !value("SMTP_PASS") || !value("SMTP_FROM")) {
        warnings.push("SMTP is not fully configured. Verification/reset emails will not be delivered in local development; use the development link flow.");
    }
    warnings.push("Development mode is not a production security sign-off.");
}

if (!fs.existsSync(ENV_PATH) && !productionMode) {
    errors.push("Project-root .env was not found. Copy .env.example to .env and configure it first.");
}

console.log(`SWACHHITRA deployment configuration check (${productionMode ? "production" : "development"})`);
console.log(`Environment file: ${ENV_PATH}`);
for (const warning of warnings) console.warn(`WARN  ${warning}`);
for (const error of errors) console.error(`FAIL  ${error}`);

if (errors.length) {
    console.error(`\nResult: ${errors.length} configuration issue(s) found.`);
    process.exitCode = 1;
} else {
    console.log(`\nPASS  Required ${productionMode ? "production" : "development"} configuration checks passed.`);
    if (!productionMode) console.log("NOTE  Run with --production after configuring production values to validate production-specific settings.");
}
