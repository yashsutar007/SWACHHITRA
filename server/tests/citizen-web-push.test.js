"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
    base64Url,
    isTrustedPushEndpoint,
    getVapidKeyMaterial,
    createVapidToken,
    encryptPayload
} = require("../services/citizenWebPushCrypto");

const projectRoot = path.resolve(__dirname, "../..");
const read = relative => fs.readFileSync(path.join(projectRoot, relative), "utf8");
let passed = 0;
let failed = 0;
function check(name, fn) {
    try { fn(); passed += 1; console.log(`PASS ${name}`); }
    catch (error) { failed += 1; console.error(`FAIL ${name}: ${error.message}`); }
}

function generateVapidPair() {
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.generateKeys();
    return {
        publicKey: ecdh.getPublicKey(undefined, "uncompressed").toString("base64url"),
        privateKey: ecdh.getPrivateKey().toString("base64url")
    };
}

check("Web Push accepts HTTPS browser push endpoints and rejects untrusted URLs", () => {
    assert.equal(isTrustedPushEndpoint("https://fcm.googleapis.com/fcm/send/example"), true);
    assert.equal(isTrustedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/example"), true);
    assert.equal(isTrustedPushEndpoint("http://fcm.googleapis.com/fcm/send/example"), false);
    assert.equal(isTrustedPushEndpoint("https://attacker.invalid/fake"), false);
});

check("VAPID public/private key pair is validated and ES256 token is correctly signed", () => {
    const keys = generateVapidPair();
    const material = getVapidKeyMaterial(keys.publicKey, keys.privateKey);
    assert.equal(material.publicKey.length, 65);
    assert.throws(() => getVapidKeyMaterial(keys.publicKey, generateVapidPair().privateKey));

    const { token } = createVapidToken(
        "https://fcm.googleapis.com/fcm/send/demo",
        keys.publicKey,
        keys.privateKey,
        "mailto:swachhitra-demo@example.org"
    );
    const parts = token.split(".");
    assert.equal(parts.length, 3);
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    assert.equal(header.alg, "ES256");
    assert.equal(payload.aud, "https://fcm.googleapis.com");
    assert.equal(payload.sub, "mailto:swachhitra-demo@example.org");
    assert.ok(payload.exp > Math.floor(Date.now() / 1000));
    const publicObject = crypto.createPublicKey(material.privateKeyObject);
    assert.equal(crypto.verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), {
        key: publicObject, dsaEncoding: "ieee-p1363"
    }, Buffer.from(parts[2], "base64url")), true);
});

check("Web Push aes128gcm payload round-trips with P-256 ECDH, HKDF and AES-GCM", () => {
    const client = crypto.createECDH("prime256v1");
    client.generateKeys();
    const clientPublic = client.getPublicKey(undefined, "uncompressed");
    const auth = crypto.randomBytes(16);
    const expected = {
        title: "Collection truck approaching your area",
        body: "A truck is expected at your nearby collection point in approximately 8 minutes.",
        notificationId: 42
    };
    const body = encryptPayload({ keys: { p256dh: base64Url(clientPublic), auth: base64Url(auth) } }, expected);
    assert.equal(body.length > 86, true);
    const salt = body.subarray(0, 16);
    assert.equal(body.readUInt32BE(16), 4096);
    const keyLength = body[20];
    assert.equal(keyLength, 65);
    const serverPublic = body.subarray(21, 21 + keyLength);
    const encrypted = body.subarray(21 + keyLength);
    const shared = client.computeSecret(serverPublic);
    const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), clientPublic, serverPublic]);
    const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, auth, keyInfo, 32));
    const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
    const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
    const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
    decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
    const clear = Buffer.concat([
        decipher.update(encrypted.subarray(0, encrypted.length - 16)),
        decipher.final()
    ]);
    assert.equal(clear[clear.length - 1], 2);
    assert.deepEqual(JSON.parse(clear.subarray(0, clear.length - 1).toString("utf8")), expected);
});

check("Citizen Web Push subscription API is Citizen-only and mutations use CSRF protection", () => {
    const routes = read("server/routes/citizenRoutes.js");
    assert.match(routes, /router\.use\(requireRole\("citizen"\)\)/);
    assert.match(routes, /router\.get\("\/push\/config", getCitizenPushConfig\)/);
    assert.match(routes, /router\.post\("\/push\/subscription", protectCitizenMutation, saveCitizenPushSubscription\)/);
    assert.match(routes, /router\.delete\("\/push\/subscription", protectCitizenMutation, removeCitizenPushSubscription\)/);
});

check("Push subscriptions are stored by endpoint hash and tied to users with cascade cleanup", () => {
    const migration = read("database/migrations/SWACHHITRA_Citizen_Web_Push_Migration.sql");
    assert.match(migration, /UNIQUE KEY `uq_citizen_push_endpoint_hash`/);
    assert.match(migration, /FOREIGN KEY \(`user_id`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE/);
    assert.match(migration, /last_success_at/);
    assert.match(migration, /last_error_at/);
});

check("Push delivery is restricted to active Citizen accounts and removes expired subscriptions", () => {
    const service = read("server/services/citizenWebPush.js");
    assert.match(service, /u\.role = 'citizen'/);
    assert.match(service, /u\.status = 'active'/);
    assert.match(service, /PUSH_SUBSCRIPTION_GONE/);
    assert.match(service, /DELETE FROM citizen_push_subscriptions/);
    assert.match(service, /crypto\.createHash\("sha256"\)/);
    assert.doesNotMatch(service, /console\.warn\([^\n]*endpoint/);
});

check("Citizen dashboard asks permission only on explicit action and plays a custom foreground chime", () => {
    const page = read("client/citizenDash/citizenDash.html");
    const client = read("client/citizenDash/citizenDash.js");
    const worker = read("client/citizen-push-sw.js");
    assert.match(page, /id="enableCitizenPushButton"/);
    assert.match(client, /Notification\.requestPermission\(\)/);
    assert.match(client, /navigator\.serviceWorker\.register\("\/citizen-push-sw\.js"/);
    assert.match(client, /function playCitizenNotificationSound\(\)/);
    assert.match(client, /playCitizenNotificationSound\(\);/);
    assert.match(worker, /self\.registration\.showNotification/);
    assert.match(worker, /notificationclick/);
    assert.match(worker, /controlled by browser\/OS settings/);
    assert.match(worker, /visibleOtherRoleClient/);
});

check("Driver GPS-start push dispatch runs only after the notification transaction commits", () => {
    const driver = read("server/controllers/driverController.js");
    assert.match(driver, /pushQueue\.push\(\{[\s\S]*userId,[\s\S]*notification:/);
    assert.match(driver, /await connection\.commit\(\);[\s\S]*for \(const queued of citizenPushQueue\)[\s\S]*sendCitizenPush\(queued\.userId, queued\.notification\)/);
});

check("Only Citizen dashboard loads the Web Push controls/service worker and migration is in base schema", () => {
    const schema = read("database/schema.sql");
    const citizen = read("client/citizenDash/citizenDash.html");
    const server = read("server/server.js");
    const manifest = read("client/citizen.webmanifest");
    assert.match(schema, /CREATE TABLE IF NOT EXISTS `citizen_push_subscriptions`/);
    assert.match(citizen, /Get collection alerts when SWACHHITRA is closed/);
    assert.match(citizen, /rel="manifest" href="\/citizen\.webmanifest"/);
    assert.match(manifest, /"display": "standalone"/);
    assert.match(server, /hasCitizenWebPushConfig[\s\S]*REQUIRED_RUNTIME_TABLES\.push\("citizen_push_subscriptions"\)/);
    for (const rolePath of [
        "client/driverDash/driverDash.html",
        "client/inspectorDash/inspectorDash.html",
        "client/assistantDash/assistantDash.html",
        "client/deputyCommissionerDash/deputyCommissionerDash.html"
    ]) assert.doesNotMatch(read(rolePath), /citizen-push-sw|enableCitizenPushButton/);
});

console.log(`\nCitizen Web Push tests: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
