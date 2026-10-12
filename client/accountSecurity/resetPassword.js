(() => {
    "use strict";

    const form = document.getElementById("resetPasswordForm");
    const emailField = document.getElementById("recoveryEmailField");
    const codeField = document.getElementById("recoveryCodeField");
    const email = document.getElementById("recoveryEmail");
    const code = document.getElementById("recoveryCode");
    const password = document.getElementById("newPassword");
    const confirmation = document.getElementById("confirmNewPassword");
    const message = document.getElementById("resetMessage");
    const button = document.getElementById("resetButton");
    const heading = document.getElementById("resetHeading");
    const subtitle = document.getElementById("resetSubtitle");
    const emailTokenNote = document.getElementById("emailTokenNote");

    // Existing email reset links remain supported. Their full token is captured
    // in memory and immediately removed from the address bar.
    const queryToken = new URLSearchParams(window.location.search).get("token") || "";
    const emailResetToken = /^[a-f0-9]{64}$/i.test(queryToken) ? queryToken : "";
    if (window.location.search) {
        window.history.replaceState(null, document.title, window.location.pathname);
    }

    function showMessage(text, kind = "") {
        message.textContent = String(text || "");
        message.className = `security-notice ${kind}`.trim();
    }

    if (emailResetToken) {
        emailField.classList.add("security-hidden");
        codeField.classList.add("security-hidden");
        email.required = false;
        code.required = false;
        emailTokenNote.classList.remove("security-hidden");
        heading.textContent = "Reset your password";
        subtitle.textContent = "Choose a new password for the account associated with this one-time reset link.";
    }

    form?.addEventListener("submit", async event => {
        event.preventDefault();
        showMessage("");
        if (!form.checkValidity()) { form.reportValidity(); return; }
        if (password.value !== confirmation.value) {
            showMessage("Passwords do not match.", "error");
            confirmation.focus();
            return;
        }
        if (!emailResetToken && !/^[a-f0-9]{32}$/i.test(code.value.trim())) {
            showMessage("Enter the 32-character recovery code provided by your assigning authority.", "error");
            code.focus();
            return;
        }

        button.disabled = true;
        button.textContent = "Updating…";
        try {
            const endpoint = emailResetToken
                ? "/api/auth/password/reset"
                : "/api/auth/password/reset-assigned-staff";
            const payload = emailResetToken
                ? { token: emailResetToken, password: password.value, confirm_password: confirmation.value }
                : { email: email.value.trim(), code: code.value.trim().toLowerCase(), password: password.value, confirm_password: confirmation.value };

            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                cache: "no-store",
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => null);
            if (!response.ok || result?.success !== true) throw new Error(result?.message || "Unable to set the password.");

            showMessage(result.message || "Password changed. Please sign in.", "success");
            form.reset();
            button.textContent = "Password updated";
            button.disabled = true;
        } catch (error) {
            showMessage(error.message || "Unable to set the password.", "error");
            button.disabled = false;
            button.textContent = "Set new password";
        }
    });
})();
