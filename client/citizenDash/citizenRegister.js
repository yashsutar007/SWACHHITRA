(() => {
    "use strict";

    const form = document.getElementById("citizenRegisterForm");
    const email = document.getElementById("email");
    const password = document.getElementById("password");
    const confirmPassword = document.getElementById("confirmPassword");
    const message = document.getElementById("registerMessage");
    const button = document.getElementById("registerButton");

    function showMessage(text, kind = "") {
        message.textContent = String(text || "");
        message.className = `notice ${kind}`.trim();
    }

    function showDevelopmentLink(path) {
        if (!path || !path.startsWith("/")) return;
        let link = document.getElementById("developmentVerificationLink");
        if (!link) {
            link = document.createElement("a");
            link.id = "developmentVerificationLink";
            link.className = "account-security-dev-link";
            link.rel = "noreferrer";
            message.insertAdjacentElement("afterend", link);
        }
        link.href = path;
        link.textContent = "Open local development verification link";
    }

    form?.addEventListener("submit", async event => {
        event.preventDefault();
        showMessage("");

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        if (password.value !== confirmPassword.value) {
            showMessage("Password and confirmation do not match.", "error");
            confirmPassword.focus();
            return;
        }

        button.disabled = true;
        button.textContent = "Creating account…";

        try {
            const response = await fetch("/api/auth/register-citizen", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                    email: email.value.trim(),
                    password: password.value,
                    confirm_password: confirmPassword.value
                })
            });

            const result = await response.json().catch(() => null);
            if (!response.ok || result?.success !== true) {
                throw new Error(result?.message || "Unable to create the Citizen account.");
            }

            showDevelopmentLink(result.developmentVerificationPath);
            if (result.developmentVerificationPath) {
                showMessage("Account created. Open the local development verification link below to verify your email before signing in.", "success");
            } else if (result.emailDeliveryStatus === "not_configured" || result.emailDeliveryMode === "not_configured") {
                showMessage(`${result.message || "Account created, but email delivery is not configured."} ${result.deliveryHelp || "For local testing, set ALLOW_DEV_EMAIL_LINKS=true in the project-root .env and restart the server, or configure SMTP."}`, "error");
            } else if (result.emailDeliveryStatus === "failed" || result.emailDeliveryStatus === "not_sent") {
                showMessage(`${result.message || "Account created, but the verification email could not be delivered."} ${result.deliveryHelp || "Check the server terminal and SMTP settings, then request a new verification link."}`, "error");
            } else {
                showMessage(result.message || "Account created. Check your inbox and Spam/Junk for the verification link.", "success");
            }
            button.disabled = true;
            button.textContent = "Account created";
        } catch (error) {
            showMessage(error.message || "Unable to create the Citizen account.", "error");
            button.disabled = false;
            button.textContent = "Create account";
        }
    });
})();
