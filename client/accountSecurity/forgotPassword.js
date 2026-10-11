(() => {
    "use strict";
    const form = document.getElementById("forgotPasswordForm");
    const email = document.getElementById("forgotEmail");
    const message = document.getElementById("forgotMessage");
    const button = document.getElementById("forgotButton");

    function showMessage(text, kind = "") {
        message.textContent = String(text || "");
        message.className = `notice ${kind}`.trim();
    }

    function addDevelopmentLink(path) {
        let link = document.getElementById("developmentAccountLink");
        if (!path || !path.startsWith("/")) {
            link?.remove();
            return;
        }
        if (!link) {
            link = document.createElement("a");
            link.id = "developmentAccountLink";
            link.className = "account-security-dev-link";
            link.rel = "noreferrer";
            message.insertAdjacentElement("afterend", link);
        }
        link.href = path;
        link.textContent = "Open local development password-reset link";
    }

    form?.addEventListener("submit", async event => {
        event.preventDefault();
        showMessage("");
        if (!form.checkValidity()) { form.reportValidity(); return; }
        button.disabled = true;
        button.textContent = "Requesting…";
        try {
            const response = await fetch("/api/auth/password/forgot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ email: email.value.trim() })
            });
            const result = await response.json().catch(() => null);
            if (!response.ok || result?.success !== true) throw new Error(result?.message || "Unable to process the request.");
            addDevelopmentLink(result.developmentResetPath);
            if (result.developmentResetPath) {
                showMessage("A local password-reset link was generated. Open the link below to choose a new password.", "success");
            } else if (result.emailDeliveryMode === "not_configured") {
                showMessage(result.deliveryHelp || "This server has no SMTP email configuration. For local testing, set ALLOW_DEV_EMAIL_LINKS=true in the project-root .env and restart the server, or configure SMTP.", "error");
            } else {
                showMessage(`${result.message || "If the account exists, reset instructions will be sent."}${result.deliveryHelp ? " " + result.deliveryHelp : ""}`, "success");
            }
        } catch (error) {
            showMessage(error.message || "Unable to process the request.", "error");
        } finally {
            button.disabled = false;
            button.textContent = "Send reset instructions";
        }
    });
})();
