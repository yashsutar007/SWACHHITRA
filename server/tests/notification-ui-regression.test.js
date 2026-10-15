"use strict";
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "../..");
let passed = 0;
let failed = 0;
function check(name, condition) {
    if (condition) { passed += 1; console.log(`PASS ${name}`); }
    else { failed += 1; console.error(`FAIL ${name}`); }
}
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
const ui = read("client/shared/swachhitra-ui.js");
const css = read("client/shared/swachhitra-ui.css");
const roles = [
    ["Citizen", "client/citizenDash/citizenDash.html", "client/citizenDash/citizenDash.js"],
    ["Driver", "client/driverDash/driverDash.html", "client/driverDash/driverDash.js"],
    ["Inspector", "client/inspectorDash/inspectorDash.html", "client/inspectorDash/inspectorDash.js"],
    ["Assistant Commissioner", "client/assistantDash/assistantDash.html", "client/assistantDash/assistantDash.js"],
    ["Deputy Commissioner", "client/deputyCommissionerDash/deputyCommissionerDash.html", "client/deputyCommissionerDash/deputyCommissionerDash.js"]
];
check("Shared UI provides animated incoming notification banners", /showIncomingNotification/.test(ui) && /sw-ui-drop-in/.test(css));
check("Shared UI provides custom asynchronous confirmation and prompt dialogs", /confirm: options => openDialog/.test(ui) && /prompt: options => openDialog/.test(ui));
check("Shared UI respects reduced-motion preferences", /prefers-reduced-motion:\s*reduce/.test(css));
for (const [role, htmlPath, jsPath] of roles) {
    const html = read(htmlPath);
    const js = read(jsPath);
    check(`${role} dashboard loads shared toast CSS and JS`, html.includes("/shared/swachhitra-ui.css") && html.includes("/shared/swachhitra-ui.js"));
    check(`${role} dashboard announces newly received notifications`, js.includes("SwachhitraUI") && /notifications/i.test(js));
}
const appJs = ["client/driverDash/driverDash.js", "client/citizenDash/citizenDash.js", "client/inspectorDash/inspectorDash.js"].map(read).join("\n");
check("Driver, Citizen and Inspector actions no longer call native browser confirm/prompt", !/window\.(?:confirm|prompt|alert)\s*\(/.test(appJs));
const assistantRoutes = read("server/routes/assistantRoutes.js");
const assistantController = read("server/controllers/assistantController.js");
check("Assistant notifications endpoint is authenticated and recipient-scoped", /router\.use\([\s\S]*requireRole[\s\S]*\)/.test(assistantRoutes) && /router\.get\(["']\/notifications["'],\s*getNotifications\)/.test(assistantRoutes) && /WHERE recipient_user_id = \?/.test(assistantController));
const dcRoutes = read("server/routes/deputyCommissionerRoutes.js");
const dcController = read("server/controllers/deputyCommissionerController.js");
check("Deputy Commissioner notifications endpoint is role-protected and recipient-scoped", /router\.use\(requireRole\("deputy_commissioner"\)\)/.test(dcRoutes) && /router\.get\(["']\/notifications["'],\s*getMyNotifications\)/.test(dcRoutes) && /WHERE recipient_user_id = \?/.test(dcController));
console.log(`\nNotification UI regression: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
