const path = require("path");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config({
    path: path.join(__dirname, "../../.env")
});


function getPositiveInteger(value, fallback) {
    const number = Number(value);

    if (Number.isInteger(number) && number > 0) {
        return number;
    }

    return fallback;
}


const requiredEnvironmentVariables = [
    "DB_HOST",
    "DB_USER",
    "DB_NAME"
];

for (const variable of requiredEnvironmentVariables) {
    if (!process.env[variable]) {
        throw new Error(
            `${variable} is missing from SWACHHITRA/.env or the hosting environment.`
        );
    }
}


const dbPort = getPositiveInteger(
    process.env.DB_PORT,
    3306
);

const connectionLimit = getPositiveInteger(
    process.env.DB_CONNECTION_LIMIT,
    10
);

const connectTimeout = getPositiveInteger(
    process.env.DB_CONNECT_TIMEOUT,
    10000
);

const dbSslSetting = String(process.env.DB_SSL || "false").trim().toLowerCase();
if (!["true", "false"].includes(dbSslSetting)) {
    throw new Error("DB_SSL must be set to true or false.");
}

const isProduction = String(process.env.NODE_ENV || "development").toLowerCase() === "production";
if (isProduction && dbSslSetting !== "true") {
    throw new Error("DB_SSL must be true for production MySQL connections.");
}

const dbSslCaBase64 = String(process.env.DB_SSL_CA_BASE64 || "").trim();
let dbSsl;

if (dbSslSetting === "true") {
    dbSsl = {
        rejectUnauthorized: true,
        minVersion: "TLSv1.2"
    };

    if (dbSslCaBase64) {
        const decodedCa = Buffer.from(dbSslCaBase64, "base64").toString("utf8");
        if (
            !decodedCa.includes("-----BEGIN CERTIFICATE-----") ||
            !decodedCa.includes("-----END CERTIFICATE-----")
        ) {
            throw new Error("DB_SSL_CA_BASE64 must contain a Base64-encoded PEM CA certificate.");
        }
        dbSsl.ca = decodedCa;
    }
} else if (dbSslCaBase64) {
    throw new Error("DB_SSL_CA_BASE64 cannot be configured unless DB_SSL=true.");
}


const pool = mysql.createPool({
    host: process.env.DB_HOST,

    port: dbPort,

    user: process.env.DB_USER,

    password: process.env.DB_PASSWORD || "",

    database: process.env.DB_NAME,

    waitForConnections: true,

    connectionLimit,

    queueLimit: 0,

    connectTimeout,

    charset: "utf8mb4",

    ...(dbSsl ? { ssl: dbSsl } : {})
});


module.exports = pool;
