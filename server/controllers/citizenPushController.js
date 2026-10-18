"use strict";

const { getConfig, validSubscription, hashEndpoint } = require("../services/citizenWebPush");
const db = require("../config/db");

function currentCitizenId(req) {
    const id = Number(req.currentUser?.id);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function getCitizenPushConfig(req, res) {
    const config = getConfig();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    return res.json({
        success: true,
        enabled: config.enabled,
        publicKey: config.publicKey,
        message: config.enabled ? "Background notifications are available." : "Background notifications are not configured on this server yet."
    });
}

async function saveCitizenPushSubscription(req, res) {
    const userId = currentCitizenId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Sign in as a Citizen to enable notifications." });
    if (!getConfig().enabled) return res.status(503).json({ success: false, message: "Background notifications are not configured on this server yet." });

    const subscription = req.body?.subscription;
    if (!validSubscription(subscription)) {
        return res.status(400).json({ success: false, message: "The browser push subscription is invalid or unsupported." });
    }
    const endpoint = String(subscription.endpoint);
    const p256dh = String(subscription.keys.p256dh);
    const authSecret = String(subscription.keys.auth);
    const expirationTime = subscription.expirationTime !== null && subscription.expirationTime !== undefined &&
        Number.isFinite(Number(subscription.expirationTime))
        ? Math.max(0, Math.floor(Number(subscription.expirationTime)))
        : null;
    try {
        await db.execute(
            `INSERT INTO citizen_push_subscriptions
                (user_id, endpoint_hash, endpoint, p256dh_key, auth_secret, expiration_time, disabled_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL)
             ON DUPLICATE KEY UPDATE
                user_id = VALUES(user_id),
                endpoint = VALUES(endpoint),
                p256dh_key = VALUES(p256dh_key),
                auth_secret = VALUES(auth_secret),
                expiration_time = VALUES(expiration_time),
                disabled_at = NULL,
                last_error_at = NULL,
                updated_at = CURRENT_TIMESTAMP`,
            [userId, hashEndpoint(endpoint), endpoint, p256dh, authSecret, expirationTime]
        );
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return res.status(201).json({ success: true, message: "Background Citizen notifications enabled on this browser." });
    } catch (error) {
        console.error("Saving Citizen push subscription failed:", error?.code || "database_error");
        return res.status(503).json({ success: false, message: "Unable to save notification settings. Apply the Citizen Web Push database migration and try again." });
    }
}

async function removeCitizenPushSubscription(req, res) {
    const userId = currentCitizenId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Sign in as a Citizen to update notification settings." });
    const endpoint = String(req.body?.endpoint || "");
    if (endpoint.length > 2048 || !/^https:\/\//i.test(endpoint)) {
        return res.status(400).json({ success: false, message: "A valid push endpoint is required." });
    }
    try {
        const [result] = await db.execute(
            `DELETE FROM citizen_push_subscriptions WHERE user_id = ? AND endpoint_hash = ?`,
            [userId, hashEndpoint(endpoint)]
        );
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        return res.json({ success: true, removed: Number(result.affectedRows || 0), message: "Background notifications disabled for this browser." });
    } catch (error) {
        console.error("Removing Citizen push subscription failed:", error?.code || "database_error");
        return res.status(503).json({ success: false, message: "Unable to update notification settings. Please try again." });
    }
}

module.exports = { getCitizenPushConfig, saveCitizenPushSubscription, removeCitizenPushSubscription };
