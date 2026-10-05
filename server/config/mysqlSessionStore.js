"use strict";

const session = require("express-session");

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 8;

function positiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : fallback;
}

function resolveExpiry(sessionData, ttlMs) {
    const cookieExpiry = sessionData?.cookie?.expires;
    if (cookieExpiry) {
        const date = new Date(cookieExpiry);
        if (!Number.isNaN(date.getTime())) {
            return date;
        }
    }

    return new Date(Date.now() + ttlMs);
}

class MySQLSessionStore extends session.Store {
    constructor(pool, options = {}) {
        super();

        if (!pool || typeof pool.execute !== "function") {
            throw new TypeError("MySQLSessionStore requires a mysql2/promise pool.");
        }

        this.pool = pool;
        this.tableName = options.tableName || "sessions";
        this.ttlMs = positiveInteger(options.ttlMs, DEFAULT_TTL_MS);
        this.cleanupIntervalMs = positiveInteger(
            options.cleanupIntervalMs,
            60 * 60 * 1000
        );

        if (!/^[A-Za-z0-9_]+$/.test(this.tableName)) {
            throw new Error("Invalid session table name.");
        }
    }

    async ensureTable() {
        await this.pool.execute(`
            CREATE TABLE IF NOT EXISTS ${this.tableName} (
                session_id VARCHAR(255) NOT NULL,
                expires DATETIME(3) NULL,
                data MEDIUMTEXT NOT NULL,
                PRIMARY KEY (session_id),
                INDEX idx_${this.tableName}_expires (expires)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    }

    get(sid, callback) {
        this.pool.execute(
            `SELECT data, expires FROM ${this.tableName} WHERE session_id = ? LIMIT 1`,
            [sid]
        )
            .then(async ([rows]) => {
                const row = rows[0];
                if (!row) {
                    return callback(null, null);
                }

                if (row.expires && new Date(row.expires).getTime() <= Date.now()) {
                    await this.pool.execute(
                        `DELETE FROM ${this.tableName} WHERE session_id = ?`,
                        [sid]
                    );
                    return callback(null, null);
                }

                let parsed;
                try {
                    parsed = JSON.parse(row.data);
                } catch (error) {
                    console.error("Invalid persisted session data:", error);
                    await this.pool.execute(
                        `DELETE FROM ${this.tableName} WHERE session_id = ?`,
                        [sid]
                    );
                    return callback(null, null);
                }

                return callback(null, parsed);
            })
            .catch(error => callback(error));
    }

    set(sid, sessionData, callback) {
        const expires = resolveExpiry(sessionData, this.ttlMs);
        const data = JSON.stringify(sessionData);

        this.pool.execute(
            `
            INSERT INTO ${this.tableName} (session_id, expires, data)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
                expires = VALUES(expires),
                data = VALUES(data)
            `,
            [sid, expires, data]
        )
            .then(() => callback?.(null))
            .catch(error => callback?.(error));
    }

    destroy(sid, callback) {
        this.pool.execute(
            `DELETE FROM ${this.tableName} WHERE session_id = ?`,
            [sid]
        )
            .then(() => callback?.(null))
            .catch(error => callback?.(error));
    }

    touch(sid, sessionData, callback) {
        const expires = resolveExpiry(sessionData, this.ttlMs);

        this.pool.execute(
            `UPDATE ${this.tableName} SET expires = ? WHERE session_id = ?`,
            [expires, sid]
        )
            .then(() => callback?.(null))
            .catch(error => callback?.(error));
    }

    clear(callback) {
        this.pool.execute(`TRUNCATE TABLE ${this.tableName}`)
            .then(() => callback?.(null))
            .catch(error => callback?.(error));
    }

    length(callback) {
        this.pool.execute(`SELECT COUNT(*) AS count FROM ${this.tableName}`)
            .then(([rows]) => callback?.(null, Number(rows[0]?.count || 0)))
            .catch(error => callback?.(error));
    }

    all(callback) {
        this.pool.execute(`SELECT session_id, data, expires FROM ${this.tableName}`)
            .then(([rows]) => {
                const sessions = {};
                for (const row of rows) {
                    if (row.expires && new Date(row.expires).getTime() <= Date.now()) {
                        continue;
                    }

                    try {
                        sessions[row.session_id] = JSON.parse(row.data);
                    } catch {
                        // Ignore malformed rows here. get() removes them when requested.
                    }
                }
                callback?.(null, sessions);
            })
            .catch(error => callback?.(error));
    }

    async clearExpired() {
        await this.pool.execute(
            `DELETE FROM ${this.tableName} WHERE expires IS NOT NULL AND expires <= UTC_TIMESTAMP(3)`
        );
    }

    startCleanup() {
        const timer = setInterval(() => {
            this.clearExpired().catch(error => {
                console.error("Session cleanup failed:", error);
            });
        }, this.cleanupIntervalMs);

        timer.unref?.();
        return timer;
    }
}

module.exports = MySQLSessionStore;
