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
                cache: "no-store",
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

            const redirectTo = String(result.redirectTo || "");
            const allowedRedirects = new Set([
                "/citizenDash/profile",
                "/login"
            ]);
            showMessage(result.message || "Account created.", "success");
            button.textContent = "Account created";

            if (allowedRedirects.has(redirectTo)) {
                window.location.replace(redirectTo);
                return;
            }

            window.location.replace("/citizenDash/profile");
        } catch (error) {
            showMessage(error.message || "Unable to create the Citizen account.", "error");
            button.disabled = false;
            button.textContent = "Create account";
        }
    });
})();
