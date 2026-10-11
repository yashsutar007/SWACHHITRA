"use strict";

const fs = require("fs/promises");
const path = require("path");

const DEFAULT_AUDIT_FILE = path.join(__dirname, "..", "logs", "deputy-commissioner-admin-audit.jsonl");

function auditFilePath() {
    const configured = String(process.env.DC_ADMIN_AUDIT_PATH || "").trim();
    return configured ? path.resolve(configured) : DEFAULT_AUDIT_FILE;
}

function normalizeAuditRecord(record) {
    return {
        actionId: String(record?.actionId || "").slice(0, 80),
        outcome: String(record?.outcome || "pending_review").slice(0, 40),
        actorUserId: Number.isSafeInteger(Number(record?.actorUserId)) ? Number(record.actorUserId) : null,
        targetUserId: Number.isSafeInteger(Number(record?.targetUserId)) ? Number(record.targetUserId) : null,
        targetRole: String(record?.targetRole || "unknown").slice(0, 60),
        previousStatus: String(record?.previousStatus || "unknown").slice(0, 40),
        newStatus: String(record?.newStatus || "unknown").slice(0, 40),
        reason: String(record?.reason || "").trim().slice(0, 300),
        sessionsInvalidated: Number.isSafeInteger(Number(record?.sessionsInvalidated)) ? Number(record.sessionsInvalidated) : null,
        errorCode: String(record?.errorCode || "").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80) || null,
        requestedAt: String(record?.requestedAt || "").slice(0, 40) || null,
        occurredAt: String(record?.occurredAt || new Date().toISOString()).slice(0, 40)
    };
}

async function appendAuditRecord(record) {
    const file = auditFilePath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const handle = await fs.open(file, "a", 0o600);
    try {
        await handle.writeFile(`${JSON.stringify(normalizeAuditRecord(record))}\n`, { encoding: "utf8" });
        await handle.sync();
    } finally {
        await handle.close();
    }
}

async function readRecentAuditRecords(limit = 20) {
    const file = auditFilePath();
    let content;
    try {
        content = await fs.readFile(file, "utf8");
    } catch (error) {
        if (error?.code === "ENOENT") return [];
        throw error;
    }

    const latestByAction = new Map();
    for (const line of content.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
            const record = normalizeAuditRecord(JSON.parse(line));
            const key = record.actionId || `${record.occurredAt}:${record.actorUserId}:${record.targetUserId}`;
            latestByAction.set(key, record);
        } catch {
            // Ignore malformed lines so a single damaged record does not hide newer valid entries.
        }
    }

    return Array.from(latestByAction.values())
        .sort((a, b) => String(b.occurredAt || "").localeCompare(String(a.occurredAt || "")))
        .slice(0, Math.min(50, Math.max(1, Number(limit) || 20)));
}

module.exports = { appendAuditRecord, readRecentAuditRecords };
