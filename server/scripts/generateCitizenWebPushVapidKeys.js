"use strict";

const crypto = require("crypto");
const ecdh = crypto.createECDH("prime256v1");
ecdh.generateKeys();
console.log("Add these values to Render Environment. Never commit the private key.");
console.log(`WEB_PUSH_VAPID_PUBLIC_KEY=${ecdh.getPublicKey(undefined, "uncompressed").toString("base64url")}`);
console.log(`WEB_PUSH_VAPID_PRIVATE_KEY=${ecdh.getPrivateKey().toString("base64url")}`);
console.log("WEB_PUSH_VAPID_SUBJECT=mailto:replace-with-a-monitored-email@example.com");
