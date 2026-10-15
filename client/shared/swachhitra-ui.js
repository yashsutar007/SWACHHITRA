/* SWACHHITRA shared in-app notifications and dialogs. No third-party dependencies. */
(function installSwachhitraUI() {
    "use strict";

    if (window.SwachhitraUI) return;

    const MAX_TOASTS = 3;
    let toastSequence = 0;
    let activeDialog = null;

    function ensureToastRegion() {
        let region = document.getElementById("swachhitraToastRegion");
        if (region) return region;
        region = document.createElement("div");
        region.id = "swachhitraToastRegion";
        region.className = "sw-ui-toast-region";
        region.setAttribute("aria-label", "Incoming notifications");
        region.setAttribute("aria-live", "polite");
        region.setAttribute("aria-relevant", "additions text");
        document.body.appendChild(region);
        return region;
    }

    function normalizeKind(value) {
        const raw = String(value || "info").toLowerCase();
        if (["critical", "high", "error", "danger"].includes(raw)) return "critical";
        if (["warning", "delayed", "truck_full_report"].includes(raw)) return "warning";
        if (["success", "completed"].includes(raw)) return "success";
        return "info";
    }

    function toast(options = {}) {
        const region = ensureToastRegion();
        const id = `sw-ui-toast-${++toastSequence}`;
        const kind = normalizeKind(options.kind || options.priority || options.type);
        const title = String(options.title || "SWACHHITRA notification").trim();
        const message = String(options.message || "You have a new update.").trim();
        const duration = Math.max(3500, Math.min(Number(options.duration) || 7800, 15000));

        const card = document.createElement("article");
        card.id = id;
        card.className = `sw-ui-toast sw-ui-toast--${kind}`;
        card.setAttribute("role", kind === "critical" ? "alert" : "status");
        card.setAttribute("aria-live", kind === "critical" ? "assertive" : "polite");

        const icon = document.createElement("span");
        icon.className = "sw-ui-toast-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = kind === "critical" ? "!" : kind === "warning" ? "⌁" : kind === "success" ? "✓" : "♧";

        const copy = document.createElement("div");
        copy.className = "sw-ui-toast-copy";
        const eyebrow = document.createElement("span");
        eyebrow.className = "sw-ui-toast-eyebrow";
        eyebrow.textContent = "SWACHHITRA · NEW UPDATE";
        const heading = document.createElement("strong");
        heading.className = "sw-ui-toast-title";
        heading.textContent = title;
        const body = document.createElement("p");
        body.className = "sw-ui-toast-message";
        body.textContent = message;
        copy.append(eyebrow, heading, body);

        const close = document.createElement("button");
        close.type = "button";
        close.className = "sw-ui-toast-close";
        close.setAttribute("aria-label", "Dismiss notification");
        close.textContent = "×";

        const progress = document.createElement("span");
        progress.className = "sw-ui-toast-progress";

        card.append(icon, copy, close, progress);
        region.prepend(card);

        close.addEventListener("click", () => dismiss());
        let timer = window.setTimeout(dismiss, duration);
        let removed = false;
        function dismiss() {
            if (removed) return;
            removed = true;
            window.clearTimeout(timer);
            card.classList.add("is-leaving");
            window.setTimeout(() => card.remove(), 260);
        }

        while (region.querySelectorAll(".sw-ui-toast:not(.is-leaving)").length > MAX_TOASTS) {
            const oldest = Array.from(region.querySelectorAll(".sw-ui-toast:not(.is-leaving)")).at(-1);
            if (!oldest || oldest === card) break;
            oldest.classList.add("is-leaving");
            window.setTimeout(() => oldest.remove(), 260);
        }

        if (typeof options.onClick === "function") {
            card.classList.add("is-clickable");
            card.addEventListener("click", event => {
                if (event.target.closest("button")) return;
                options.onClick();
                dismiss();
            });
        }
        return { id, dismiss };
    }

    function showIncomingNotification(notification, roleLabel) {
        if (!notification) return null;
        const title = String(notification.title || "New operational update");
        const message = String(notification.message || "Open Notifications to review the details.");
        const type = String(notification.type || notification.notification_type || "").toLowerCase();
        const priority = String(notification.priority || "").toLowerCase();
        const kind = ["critical", "high"].includes(priority) || /truck.full|complaint|delay|route.change/.test(type)
            ? "warning"
            : "info";
        return toast({
            title: roleLabel ? `${title}` : title,
            message,
            kind,
            duration: 8500
        });
    }

    function closeDialog(result) {
        if (!activeDialog) return;
        const current = activeDialog;
        activeDialog = null;
        current.overlay.classList.add("is-closing");
        window.setTimeout(() => current.overlay.remove(), 180);
        if (current.previousFocus && current.previousFocus.isConnected) {
            current.previousFocus.focus({ preventScroll: true });
        }
        current.resolve(result);
    }

    function openDialog(options = {}, mode = "confirm") {
        if (activeDialog) closeDialog(null);
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const overlay = document.createElement("div");
        overlay.className = "sw-ui-dialog-overlay";
        overlay.setAttribute("data-sw-ui-overlay", "true");

        const panel = document.createElement("section");
        panel.className = "sw-ui-dialog-panel";
        panel.setAttribute("role", mode === "confirm" ? "alertdialog" : "dialog");
        panel.setAttribute("aria-modal", "true");
        panel.setAttribute("aria-labelledby", "swUiDialogTitle");
        panel.setAttribute("aria-describedby", "swUiDialogMessage");

        const badge = document.createElement("span");
        badge.className = `sw-ui-dialog-badge${options.danger ? " is-danger" : ""}`;
        badge.setAttribute("aria-hidden", "true");
        badge.textContent = options.icon || (options.danger ? "!" : mode === "prompt" ? "✎" : "?");

        const title = document.createElement("h2");
        title.id = "swUiDialogTitle";
        title.className = "sw-ui-dialog-title";
        title.textContent = String(options.title || (mode === "prompt" ? "Enter details" : "Confirm action"));

        const message = document.createElement("p");
        message.id = "swUiDialogMessage";
        message.className = "sw-ui-dialog-message";
        message.textContent = String(options.message || "Please confirm to continue.");

        const content = document.createElement("div");
        content.className = "sw-ui-dialog-content";
        let promptError = null;
        if (mode === "prompt") {
            const label = document.createElement("label");
            label.className = "sw-ui-dialog-label";
            label.textContent = String(options.label || "Value");
            const inputType = options.multiline ? "textarea" : "input";
            const input = document.createElement(inputType);
            input.className = "sw-ui-dialog-input";
            if (!options.multiline) input.type = ["text", "number", "email", "search"].includes(options.inputType) ? options.inputType : "text";
            input.value = String(options.value ?? "");
            input.placeholder = String(options.placeholder || "");
            if (options.multiline) input.rows = Number(options.rows) || 3;
            if (options.min !== undefined && !options.multiline) input.min = String(options.min);
            if (options.max !== undefined && !options.multiline) input.max = String(options.max);
            if (options.maxLength) input.maxLength = Number(options.maxLength);
            if (options.required) input.required = true;
            label.appendChild(input);
            content.appendChild(label);
            if (options.hint) {
                const hint = document.createElement("small");
                hint.className = "sw-ui-dialog-hint";
                hint.textContent = String(options.hint);
                content.appendChild(hint);
            }
            promptError = document.createElement("small");
            promptError.className = "sw-ui-dialog-error";
            promptError.hidden = true;
            promptError.setAttribute("role", "alert");
            content.appendChild(promptError);
            input.addEventListener("input", () => {
                if (promptError) promptError.hidden = true;
            });
            panel._swUiInput = input;
        }

        const actions = document.createElement("div");
        actions.className = "sw-ui-dialog-actions";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "sw-ui-dialog-button sw-ui-dialog-button--secondary";
        cancel.textContent = String(options.cancelText || "Cancel");
        const submit = document.createElement("button");
        submit.type = "button";
        submit.className = `sw-ui-dialog-button ${options.danger ? "sw-ui-dialog-button--danger" : "sw-ui-dialog-button--primary"}`;
        submit.textContent = String(options.confirmText || (mode === "prompt" ? "Continue" : "Confirm"));
        actions.append(cancel, submit);

        panel.append(badge, title, message, content, actions);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        return new Promise(resolve => {
            activeDialog = { overlay, resolve, previousFocus };
            const cancelDialog = () => closeDialog(mode === "confirm" ? false : null);
            cancel.addEventListener("click", cancelDialog);
            overlay.addEventListener("mousedown", event => {
                if (event.target === overlay) cancelDialog();
            });
            const onKeyDown = event => {
                if (!activeDialog || activeDialog.overlay !== overlay) return;
                if (event.key === "Escape") {
                    event.preventDefault();
                    cancelDialog();
                } else if (event.key === "Tab") {
                    const focusable = Array.from(panel.querySelectorAll("button, input, textarea, select, [tabindex]:not([tabindex='-1'])"))
                        .filter(node => !node.disabled);
                    if (!focusable.length) return;
                    const first = focusable[0], last = focusable[focusable.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault(); last.focus();
                    } else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault(); first.focus();
                    }
                }
            };
            document.addEventListener("keydown", onKeyDown);
            // Remove the document listener once this dialog is resolved.
            const wrappedResolve = activeDialog.resolve;
            activeDialog.resolve = value => {
                document.removeEventListener("keydown", onKeyDown);
                wrappedResolve(value);
            };
            panel._swUiInput?.addEventListener("keydown", event => {
                if (mode === "prompt" && !options.multiline && event.key === "Enter") {
                    event.preventDefault();
                    submit.click();
                }
            });
            submit.addEventListener("click", () => {
                if (mode === "prompt") {
                    const input = panel._swUiInput;
                    const value = String(input?.value ?? "");
                    if (options.required && !value.trim()) {
                        if (promptError) {
                            promptError.textContent = "Please enter a value to continue.";
                            promptError.hidden = false;
                        }
                        input?.focus();
                        return;
                    }
                    closeDialog(value);
                } else {
                    closeDialog(true);
                }
            });
            const focusTarget = panel._swUiInput || cancel;
            window.requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
        });
    }

    window.SwachhitraUI = Object.freeze({
        toast,
        showIncomingNotification,
        confirm: options => openDialog(options || {}, "confirm"),
        prompt: options => openDialog(options || {}, "prompt")
    });
})();
