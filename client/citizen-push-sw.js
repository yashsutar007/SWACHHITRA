/* Citizen-only Web Push service worker. Registered by the Citizen dashboard. */
"use strict";

self.addEventListener("push", event => {
    event.waitUntil((async () => {
        let data = {};
        try { data = event.data ? event.data.json() : {}; } catch { data = {}; }

        const payload = {
            notificationId: Number(data.notificationId) || null,
            title: String(data.title || "SWACHHITRA service update").slice(0, 150),
            body: String(data.body || "There is a new update for your service area.").slice(0, 1200),
            type: String(data.type || "service_update").slice(0, 50),
            url: "/citizenDash#serviceNotifications",
            tag: String(data.tag || `swachhitra-citizen-${Number(data.notificationId) || Date.now()}`).slice(0, 100)
        };

        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        // Suppress the OS banner only when the Citizen dashboard itself is
        // visible. A staff dashboard in the same browser must not swallow a
        // Citizen push subscription that belongs to a different account.
        const visibleClient = windows.find(client => {
            try {
                const clientUrl = new URL(client.url);
                return clientUrl.origin === self.location.origin &&
                    ["/citizenDash", "/citizenDash/", "/citizenDash/citizenDash.html"].includes(clientUrl.pathname) &&
                    client.visibilityState === "visible" && client.focused;
            } catch { return false; }
        });
        if (visibleClient) {
            visibleClient.postMessage({ type: "SWACHHITRA_CITIZEN_PUSH", notificationId: payload.notificationId });
            return;
        }

        // Do not surface a Citizen notification on top of another SWACHHITRA
        // role dashboard in the same browser profile. The Citizen can review it
        // when they return to their dashboard; otherwise an OS banner is shown.
        const visibleOtherRoleClient = windows.some(client => {
            try {
                const clientUrl = new URL(client.url);
                return clientUrl.origin === self.location.origin &&
                    client.visibilityState === "visible" && client.focused;
            } catch { return false; }
        });
        if (visibleOtherRoleClient) return;

        // Notification sound in this state is controlled by browser/OS settings.
        // The Web Notifications API has no standard custom-sound option.
        await self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: String(data.icon || "/assets/logo.png"),
            badge: String(data.badge || "/assets/logo.png"),
            tag: payload.tag,
            renotify: false,
            requireInteraction: false,
            data: { url: payload.url, notificationId: payload.notificationId }
        });
    })());
});

self.addEventListener("notificationclick", event => {
    event.notification.close();
    event.waitUntil((async () => {
        let target = new URL("/citizenDash#serviceNotifications", self.location.origin);
        const requested = String(event.notification.data?.url || "");
        if (requested.startsWith("/citizenDash") && !requested.startsWith("//")) {
            target = new URL(requested, self.location.origin);
        }
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const citizenClient = windows.find(client => {
            try {
                const clientUrl = new URL(client.url);
                return clientUrl.origin === self.location.origin && clientUrl.pathname.startsWith("/citizenDash");
            } catch { return false; }
        });
        if (citizenClient) {
            if ("navigate" in citizenClient) await citizenClient.navigate(target.href);
            return citizenClient.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(target.href);
        return undefined;
    })());
});
