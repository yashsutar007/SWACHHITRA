"use strict";

const crypto = require("crypto");
const https = require("https");
const db = require("../config/db");
const {
    isTrustedPushEndpoint,
    getVapidKeyMaterial,
    decodeBase64Url,
    createVapidToken,
    encryptPayload
} = require("./citizenWebPushCrypto");

function getConfig() {
    const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
    const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
    const subject = String(process.env.WEB_PUSH_VAPID_SUBJECT || "").trim();
    let enabled = Boolean(publicKey && privateKey && subject);
    if (enabled) {
        try {
            getVapidKeyMaterial(publicKey, privateKey);
            if (!/^mailto:[^\s]+@[^\s]+$/.test(subject) && !/^https:\/\//i.test(subject)) enabled = false;
        } catch {
            enabled = false;
        }
    }
    return { enabled, publicKey: enabled ? publicKey : "" };
}

function validSubscription(subscription) {
    if (!subscription || typeof subscription !== "object" || Array.isArray(subscription)) return false;
    const endpoint = String(subscription.endpoint || "");
    const p256dh = String(subscription.keys?.p256dh || "");
    const auth = String(subscription.keys?.auth || "");
    if (endpoint.length > 2048 || !isTrustedPushEndpoint(endpoint) ||
        p256dh.length > 200 || auth.length > 200) return false;
    try {
        const publicKey = decodeBase64Url(p256dh, "subscription public key");
        const authBytes = decodeBase64Url(auth, "subscription auth secret");
        return publicKey.length === 65 && publicKey[0] === 4 && authBytes.length >= 16 && authBytes.length <= 64;
    } catch {
        return false;
    }
}

function postEncryptedPush(subscription, payload) {
    return new Promise((resolve, reject) => {
        const endpoint = String(subscription.endpoint || "");
        if (!isTrustedPushEndpoint(endpoint)) {
            return reject(Object.assign(new Error("Untrusted Web Push endpoint."), { code: "PUSH_ENDPOINT_INVALID" }));
        }

        let body;
        let vapid;
        try {
            body = encryptPayload(subscription, payload);
            vapid = createVapidToken(
                endpoint,
                process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
                process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
                process.env.WEB_PUSH_VAPID_SUBJECT
            );
        } catch (error) {
            return reject(error);
        }

        const req = https.request(new URL(endpoint), {
            method: "POST",
            headers: {
                Authorization: `vapid t=${vapid.token}, k=${vapid.publicKey}`,
                "Content-Type": "application/octet-stream",
                "Content-Encoding": "aes128gcm",
                "Content-Length": body.length,
                TTL: "900",
                Urgency: "normal"
            },
            timeout: 8000
        }, response => {
            response.resume();
            response.on("end", () => {
                const status = Number(response.statusCode || 0);
                if (status >= 200 && status < 300) return resolve({ status });
                reject(Object.assign(new Error("Push service rejected the notification."), {
                    code: status === 404 || status === 410 ? "PUSH_SUBSCRIPTION_GONE" : "PUSH_SERVICE_REJECTED",
                    status
                }));
            });
        });
        req.on("timeout", () => req.destroy(Object.assign(new Error("Push service timed out."), { code: "ETIMEDOUT" })));
        req.on("error", reject);
        req.end(body);
    });
}

async function sendCitizenPush(userId, notification) {
    const config = getConfig();
    const recipientId = Number(userId);
    if (!config.enabled || !Number.isSafeInteger(recipientId) || recipientId <= 0) {
        return { sent: 0, disabled: !config.enabled };
    }

    const [rows] = await db.execute(
        `SELECT s.id, s.endpoint, s.p256dh_key, s.auth_secret
         FROM citizen_push_subscriptions s
         INNER JOIN users u
            ON u.id = s.user_id
           AND u.role = 'citizen'
           AND u.status = 'active'
         WHERE s.user_id = ?
           AND s.disabled_at IS NULL`,
        [recipientId]
    );

    if (!rows.length) return { sent: 0, noSubscriptions: true };

    const data = {
        notificationId: Number(notification.id),
        title: String(notification.title || "SWACHHITRA service update").slice(0, 150),
        body: String(notification.message || "There is a new update for your service area.").slice(0, 1200),
        type: String(notification.type || "service_update").slice(0, 50),
        url: "/citizenDash#serviceNotifications",
        tag: `swachhitra-citizen-${Number(notification.id)}`,
        icon: "/assets/logo.png",
        badge: "/assets/logo.png"
    };

    let sent = 0;
    await Promise.all(rows.map(async row => {
        const subscription = {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh_key, auth: row.auth_secret }
        };
        try {
            await postEncryptedPush(subscription, data);
            sent += 1;
            await db.execute(
                `UPDATE citizen_push_subscriptions
                 SET last_success_at = NOW(), last_error_at = NULL
                 WHERE id = ? AND user_id = ?`,
                [Number(row.id), recipientId]
            );
        } catch (error) {
            if (error.code === "PUSH_SUBSCRIPTION_GONE") {
                await db.execute(
                    `DELETE FROM citizen_push_subscriptions WHERE id = ? AND user_id = ?`,
                    [Number(row.id), recipientId]
                ).catch(() => {});
            } else {
                await db.execute(
                    `UPDATE citizen_push_subscriptions SET last_error_at = NOW() WHERE id = ? AND user_id = ?`,
                    [Number(row.id), recipientId]
                ).catch(() => {});
            }
            // Do not log endpoint or subscription keys; they are capability secrets.
            console.warn("Citizen Web Push delivery failed:", error.code || "push_error", error.status || "");
        }
    }));
    return { sent, subscriptions: rows.length };
}

function hashEndpoint(endpoint) {
    return crypto.createHash("sha256").update(String(endpoint)).digest("hex");
}

module.exports = {
    getConfig,
    validSubscription,
    hashEndpoint,
    postEncryptedPush,
    sendCitizenPush
};
