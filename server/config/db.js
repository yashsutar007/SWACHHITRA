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
            `${variable} is missing from SWACHHITRA/.env`
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

    charset: "utf8mb4"
});


module.exports = pool;
