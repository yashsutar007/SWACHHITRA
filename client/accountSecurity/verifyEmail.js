(() => {
    "use strict";
    const message = document.getElementById("verifyMessage");
    const verifyButton = document.getElementById("verifyEmailButton");
    const resendForm = document.getElementById("resendVerificationForm");
    const emailInput = document.getElementById("verificationEmail");
    const resendButton = document.getElementById("resendVerificationButton");
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";

    function showMessage(text, kind = "") {
        message.textContent = String(text || "");
        message.className = `notice ${kind}`.trim();
    }

    function addDevelopmentLink(path, label) {
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
        link.textContent = label;
    }

    const suppliedEmail = params.get("email");
    if (suppliedEmail && emailInput) emailInput.value = suppliedEmail;

    // Keep the one-time token in memory for the explicit confirmation button,
    // but remove it from the visible URL/history as soon as the page loads.
    if (token && window.history && typeof window.history.replaceState === "function") {
        const safeQuery = suppliedEmail ? `?email=${encodeURIComponent(suppliedEmail)}` : "";
        window.history.replaceState(null, document.title, `${window.location.pathname}${safeQuery}`);
    }
    if (token && verifyButton) {
        verifyButton.hidden = false;
        showMessage("Verification token found. Select Verify email address to confirm it.");
        verifyButton.addEventListener("click", async () => {
            verifyButton.disabled = true;
            verifyButton.textContent = "Verifying…";
            try {
                const response = await fetch("/api/auth/citizen/verification/confirm", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ token })
                });
                const result = await response.json().catch(() => null);
                if (!response.ok || result?.success !== true) throw new Error(result?.message || "Unable to verify this email.");
                showMessage(result.message || "Email verified. You can sign in now.", "success");
                verifyButton.hidden = true;
            } catch (error) {
                showMessage(error.message || "This verification link may be expired. Request a new link.", "error");
                verifyButton.disabled = false;
                verifyButton.textContent = "Try verification again";
            }
        });
    } else {
        showMessage("Enter your email below to request a new verification link.");
    }

    resendForm?.addEventListener("submit", async event => {
        event.preventDefault();
        showMessage("");
        if (!resendForm.checkValidity()) { resendForm.reportValidity(); return; }
        resendButton.disabled = true;
        resendButton.textContent = "Requesting…";
        try {
            const response = await fetch("/api/auth/citizen/verification/resend", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ email: emailInput.value.trim() })
            });
            const result = await response.json().catch(() => null);
            if (!response.ok || result?.success !== true) throw new Error(result?.message || "Unable to process the request.");
            addDevelopmentLink(result.developmentVerificationPath, "Open local development verification link");
            if (result.developmentVerificationPath) {
                showMessage("A local verification link was generated. Open the link below to verify this account.", "success");
            } else if (result.emailDeliveryMode === "not_configured") {
                showMessage(result.deliveryHelp || "This server has no SMTP email configuration. For local testing, set ALLOW_DEV_EMAIL_LINKS=true in the project-root .env and restart the server, or configure SMTP.", "error");
            } else {
                showMessage(`${result.message || "If the account needs verification, instructions will be sent."}${result.deliveryHelp ? " " + result.deliveryHelp : ""}`, "success");
            }
        } catch (error) {
            showMessage(error.message || "Unable to process the request.", "error");
        } finally {
            resendButton.disabled = false;
            resendButton.textContent = "Send a new verification link";
        }
    });
})();
