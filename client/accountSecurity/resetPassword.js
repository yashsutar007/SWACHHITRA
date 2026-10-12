(() => {
    "use strict";

    const form = document.getElementById("resetPasswordForm");
    const password = document.getElementById("newPassword");
    const confirmation = document.getElementById("confirmNewPassword");
    const message = document.getElementById("resetMessage");
    const button = document.getElementById("resetButton");
    const heading = document.getElementById("resetHeading");
    const subtitle = document.getElementById("resetSubtitle");
    const linkRequired = document.getElementById("resetLinkRequired");

    // Read the token into memory and immediately remove it from browser history.
    const queryToken = new URLSearchParams(window.location.search).get("token") || "";
    const resetToken = /^[a-f0-9]{64}$/i.test(queryToken) ? queryToken : "";
    if (window.location.search) {
        window.history.replaceState(null, document.title, window.location.pathname);
    }

    function showMessage(text, kind = "") {
        message.textContent = String(text || "");
        message.className = `security-notice ${kind}`.trim();
    }

    if (resetToken) {
        form.classList.remove("security-hidden");
        linkRequired.classList.add("security-hidden");
        heading.textContent = "Create a new password";
        subtitle.textContent = "Choose a new password for the account associated with this one-time reset link.";
    } else {
        form.classList.add("security-hidden");
        linkRequired.classList.remove("security-hidden");
    }

    form?.addEventListener("submit", async event => {
        event.preventDefault();
        showMessage("");
        if (!resetToken) {
            showMessage("Open a valid reset link from your email, or request a new one.", "error");
            return;
        }
        if (!form.checkValidity()) { form.reportValidity(); return; }
        if (password.value !== confirmation.value) {
            showMessage("Passwords do not match.", "error");
            confirmation.focus();
            return;
        }

        button.disabled = true;
        button.textContent = "Updating…";
        try {
            const response = await fetch("/api/auth/password/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                cache: "no-store",
                body: JSON.stringify({
                    token: resetToken,
                    password: password.value,
                    confirm_password: confirmation.value
                })
            });
            const result = await response.json().catch(() => null);
            if (!response.ok || result?.success !== true) {
                throw new Error(result?.message || "Unable to set the password.");
            }

            showMessage(result.message || "Password changed. Please sign in with your new password.", "success");
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
