
(() => {
    "use strict";
    const form = document.getElementById("resetPasswordForm");
    const password = document.getElementById("newPassword");
    const confirmation = document.getElementById("confirmNewPassword");
    const message = document.getElementById("resetMessage");
    const button = document.getElementById("resetButton");
    const token = new URLSearchParams(window.location.search).get("token") || "";

    function showMessage(text, kind = "") {
        message.textContent = String(text || "");
        message.className = `notice ${kind}`.trim();
    }

    if (!/^[a-f0-9]{64}$/i.test(token)) {
        showMessage("This reset link is missing or invalid. Request a new link.", "error");
        button.disabled = true;
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
        if (!/^[a-f0-9]{64}$/i.test(token)) return;
        button.disabled = true;
        button.textContent = "Updating…";
        try {
            const response = await fetch("/api/auth/password/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ token, password: password.value, confirm_password: confirmation.value })
            });
            const result = await response.json().catch(() => null);
            if (!response.ok || result?.success !== true) throw new Error(result?.message || "Unable to reset password.");
            showMessage(result.message || "Password changed. Please sign in.", "success");
            form.reset();
            button.textContent = "Password updated";
        } catch (error) {
            showMessage(error.message || "Unable to reset password.", "error");
            button.disabled = false;
            button.textContent = "Set new password";
        }
    });
})();
