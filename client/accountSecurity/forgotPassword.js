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
        button.textContent = "Checking options…";
        try {
            const response = await fetch("/api/auth/password/forgot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                cache: "no-store",
                body: JSON.stringify({ email: email.value.trim() })
            });
            const result = await response.json().catch(() => null);
            if (!response.ok || result?.success !== true) throw new Error(result?.message || "Unable to process the request.");

            if (result.developmentResetPath) {
                addDevelopmentLink(result.developmentResetPath);
                showMessage("A local development reset link was generated. Open it below to choose a new password.", "success");
            } else if (result.emailDeliveryMode === "staff_activation_code") {
                showMessage(result.message || "For a Driver account, request a code from the Inspector responsible for the Driver's Ward. For an Inspector account, request a code from the Assistant Commissioner who assigned the Inspector. The authority must issue the code while signed in.", "success");
            } else if (result.emailDeliveryMode === "not_configured") {
                showMessage("If this is a Driver or Sanitary Inspector account, use the assignment-authorized recovery-code process described below. Email-based reset instructions require SMTP configuration.", "success");
            } else {
                showMessage(`${result.message || "If the account exists, reset instructions will be sent."}${result.deliveryHelp ? " " + result.deliveryHelp : ""}`, "success");
            }
        } catch (error) {
            showMessage(error.message || "Unable to process the request.", "error");
        } finally {
            button.disabled = false;
            button.textContent = "Request reset instructions";
        }
    });
})();
