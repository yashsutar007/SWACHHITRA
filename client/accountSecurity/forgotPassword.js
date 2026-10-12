(() => {
    "use strict";

    const form = document.getElementById("forgotPasswordForm");
    const email = document.getElementById("forgotEmail");
    const message = document.getElementById("forgotMessage");
    const button = document.getElementById("forgotButton");

    function showMessage(text, kind = "") {
        message.textContent = String(text || "");
        message.className = `security-notice ${kind}`.trim();
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
            link.className = "security-link-button secondary";
            link.rel = "noreferrer";
            link.style.marginTop = "10px";
            message.insertAdjacentElement("afterend", link);
        }
        link.href = path;
        link.textContent = "Open local development password-reset link";
    }

    form?.addEventListener("submit", async event => {
        event.preventDefault();
        showMessage("");
        addDevelopmentLink("");
        if (!form.checkValidity()) { form.reportValidity(); return; }

        button.disabled = true;
        button.textContent = "Requesting link…";
        try {
            const response = await fetch("/api/auth/password/forgot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                cache: "no-store",
                body: JSON.stringify({ email: email.value.trim() })
            });
            const result = await response.json().catch(() => null);
            if (!response.ok || result?.success !== true) {
                throw new Error(result?.message || "Unable to process the request.");
            }

            if (result.developmentResetPath) {
                addDevelopmentLink(result.developmentResetPath);
                showMessage(
                    "A local development reset link was generated. Open it below to choose a new password.",
                    "success"
                );
            } else if (result.emailDeliveryMode === "not_configured") {
                showMessage(
                    result.deliveryHelp || "Email delivery is not configured on this server. Ask the administrator to configure SMTP before requesting a reset link.",
                    "error"
                );
            } else {
                showMessage(
                    `${result.message || "If the account is eligible, a reset link will be emailed."}${result.deliveryHelp ? " " + result.deliveryHelp : ""}`,
                    "success"
                );
            }
        } catch (error) {
            showMessage(error.message || "Unable to process the request.", "error");
        } finally {
            button.disabled = false;
            button.textContent = "Send password reset link";
        }
    });
})();
