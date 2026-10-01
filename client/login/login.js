const form = document.getElementById("loginForm");
const email = document.getElementById("email");
const password = document.getElementById("password");
const role = document.getElementById("role");
const message = document.getElementById("loginMessage");
const togglePassword = document.getElementById("togglePassword");
const button = form.querySelector('button[type="submit"]');

const showMessage = (text) => {
    message.textContent = text || "";
};

const setLoading = (loading) => {
    button.disabled = loading;
    button.textContent = loading ? "Signing in..." : "Login";
};

const getSafeRedirect = (result) => {
    const loggedInRole = result?.user?.role || result?.role || role.value;
    const profileComplete = Boolean(result?.profileComplete);

    // First login: complete the profile before entering the dashboard.
    if (!profileComplete) {
        return "/profile";
    }

    // Current implemented operational dashboard.
    if (loggedInRole === "sanitary_inspector") {
        return "/inspectorDash";
    }

    // Other role dashboards can be added here as they are implemented.
    // Until then, send authenticated users to the profile page.
    return "/profile";
};

// Show/hide password.
togglePassword.addEventListener("click", () => {
    const hidden = password.type === "password";

    password.type = hidden ? "text" : "password";
    togglePassword.textContent = hidden ? "Hide" : "Show";

    togglePassword.setAttribute(
        "aria-label",
        hidden ? "Hide password" : "Show password"
    );
});

// Login.
form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("");

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const emailValue = email.value.trim();
    const passwordValue = password.value;
    const roleValue = role.value;

    setLoading(true);

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify({
                email: emailValue,
                password: passwordValue,
                role: roleValue
            })
        });

        let result;

        try {
            result = await response.json();
        } catch (_) {
            throw new Error(
                "The server returned an invalid response."
            );
        }

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "Login failed."
            );
        }

        // The server owns the authenticated session.
        // Redirect according to the server's profile state and role.
        window.location.replace(getSafeRedirect(result));

    } catch (error) {
        console.error("Login error:", error);

        showMessage(
            error?.message ||
            "Unable to sign in. Please try again."
        );

        setLoading(false);
    }
});