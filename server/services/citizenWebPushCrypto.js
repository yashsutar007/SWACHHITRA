"use strict";

const crypto = require("crypto");

function base64Url(buffer) {
    return Buffer.from(buffer).toString("base64url");
}

function decodeBase64Url(value, label = "value") {
    const text = String(value || "");
    if (!text || !/^[A-Za-z0-9_-]+$/.test(text)) {
        throw new Error(`Invalid Web Push ${label}.`);
    }
    return Buffer.from(text, "base64url");
}

function isTrustedPushEndpoint(endpoint) {
    let url;
    try { url = new URL(String(endpoint || "")); } catch { return false; }
    if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") return false;
    const host = url.hostname.toLowerCase();
    return host === "fcm.googleapis.com" ||
        host.endsWith(".fcm.googleapis.com") ||
        host === "updates.push.services.mozilla.com" ||
        host === "push.services.mozilla.com" ||
        host.endsWith(".notify.windows.com") ||
        host === "web.push.apple.com";
}

function getVapidKeyMaterial(publicKeyEncoded, privateKeyEncoded) {
    const publicKey = decodeBase64Url(publicKeyEncoded, "public key");
    const privateScalar = decodeBase64Url(privateKeyEncoded, "private key");
    if (publicKey.length !== 65 || publicKey[0] !== 4 || privateScalar.length !== 32) {
        throw new Error("Web Push VAPID key lengths are invalid.");
    }

    const ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(privateScalar);
    const derivedPublic = ecdh.getPublicKey(undefined, "uncompressed");
    if (!crypto.timingSafeEqual(derivedPublic, publicKey)) {
        throw new Error("Web Push VAPID public and private keys do not match.");
    }

    const jwk = {
        kty: "EC",
        crv: "P-256",
        x: base64Url(publicKey.subarray(1, 33)),
        y: base64Url(publicKey.subarray(33, 65)),
        d: base64Url(privateScalar)
    };
    return { publicKey, privateScalar, privateKeyObject: crypto.createPrivateKey({ key: jwk, format: "jwk" }) };
}

function createVapidToken(endpoint, publicKeyEncoded, privateKeyEncoded, subject) {
    const endpointUrl = new URL(endpoint);
    if (endpointUrl.protocol !== "https:") throw new Error("Web Push endpoint must use HTTPS.");
    if (!/^mailto:[^\s]+@[^\s]+$/.test(String(subject || "")) && !/^https:\/\//i.test(String(subject || ""))) {
        throw new Error("WEB_PUSH_VAPID_SUBJECT must be a mailto: address or HTTPS URL.");
    }
    const { publicKey, privateKeyObject } = getVapidKeyMaterial(publicKeyEncoded, privateKeyEncoded);
    const header = base64Url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
    const payload = base64Url(Buffer.from(JSON.stringify({
        aud: endpointUrl.origin,
        exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60),
        sub: String(subject)
    })));
    const unsigned = `${header}.${payload}`;
    const signature = crypto.sign("sha256", Buffer.from(unsigned), {
        key: privateKeyObject,
        dsaEncoding: "ieee-p1363"
    });
    if (signature.length !== 64) throw new Error("Unable to sign the Web Push VAPID token.");
    return { token: `${unsigned}.${base64Url(signature)}`, publicKey: base64Url(publicKey) };
}

function encryptPayload(subscription, payload) {
    const clientPublicKey = decodeBase64Url(subscription?.keys?.p256dh, "subscription p256dh key");
    const authSecret = decodeBase64Url(subscription?.keys?.auth, "subscription auth secret");
    if (clientPublicKey.length !== 65 || clientPublicKey[0] !== 4) {
        throw new Error("Web Push subscription public key is invalid.");
    }
    if (authSecret.length < 16 || authSecret.length > 64) {
        throw new Error("Web Push subscription authentication secret is invalid.");
    }

    const serverEcdh = crypto.createECDH("prime256v1");
    serverEcdh.generateKeys();
    const serverPublicKey = serverEcdh.getPublicKey(undefined, "uncompressed");
    const sharedSecret = serverEcdh.computeSecret(clientPublicKey);
    const keyInfo = Buffer.concat([
        Buffer.from("WebPush: info\0", "utf8"),
        clientPublicKey,
        serverPublicKey
    ]);
    const inputKeyMaterial = Buffer.from(crypto.hkdfSync(
        "sha256", sharedSecret, authSecret, keyInfo, 32
    ));

    const salt = crypto.randomBytes(16);
    const contentEncryptionKey = Buffer.from(crypto.hkdfSync(
        "sha256", inputKeyMaterial, salt, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16
    ));
    const nonce = Buffer.from(crypto.hkdfSync(
        "sha256", inputKeyMaterial, salt, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12
    ));

    // RFC 8188 final-record delimiter (0x02) follows the compact JSON payload.
    const plaintext = Buffer.concat([Buffer.from(JSON.stringify(payload), "utf8"), Buffer.from([2])]);
    const cipher = crypto.createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

    const recordSize = Buffer.alloc(4);
    recordSize.writeUInt32BE(4096, 0);
    const publicKeyLength = Buffer.from([serverPublicKey.length]);
    return Buffer.concat([salt, recordSize, publicKeyLength, serverPublicKey, encrypted]);
}

module.exports = {
    base64Url,
    decodeBase64Url,
    isTrustedPushEndpoint,
    getVapidKeyMaterial,
    createVapidToken,
    encryptPayload
};
