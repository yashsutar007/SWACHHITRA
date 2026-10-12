
/* =========================================================
   SWACHHITRA LOGIN
   Part 6B - Role-aware, scope-aware redirect
   ========================================================= */

const form = document.getElementById("loginForm");
const email = document.getElementById("email");
const password = document.getElementById("password");
const role = document.getElementById("role");
const message = document.getElementById("loginMessage");
const togglePassword = document.getElementById("togglePassword");
const verifyHelp = document.getElementById("verifyHelp");
const verifyHelpLink = document.getElementById("verifyHelpLink");

const button = form?.querySelector('button[type="submit"]');


function showMessage(text) {
    if (!message) {
        return;
    }

    message.textContent = String(text || "");
}


function setLoading(loading) {
    if (!button) {
        return;
    }

    button.disabled = loading;
    button.textContent = loading
        ? "Signing in..."
        : "Login";
}


/*
 * The server is the authority for role/profile/scope state.
 * The selected role is used only as a fallback for malformed legacy
 * responses. It is never used to grant access to a dashboard.
 */
function getSafeRedirect(result) {
    const loggedInRole = String(result?.user?.role || "").trim().toLowerCase();
    const profileComplete = result?.profileComplete === true;
    if (!loggedInRole) return "/login";

    if (!profileComplete) {
        const profilePathByRole = {
            citizen: "/citizenDash/profile",
            driver: "/driverProfile/",
            sanitary_inspector: "/inspectorProfile/",
            assistant_commissioner: "/assistantProfile/",
            deputy_commissioner: "/deputyCommissionerProfile/"
        };
        return profilePathByRole[loggedInRole] || "/login";
    }

    // Keep this explicit allow-list: redirects are selected from the trusted
    // authenticated role, never from a URL supplied by the request/browser.
    switch (loggedInRole) {
        case "assistant_commissioner":
            return "/assistantDash";
        case "sanitary_inspector":
            return "/inspectorDash";
        case "citizen":
            return "/citizenDash";
        case "deputy_commissioner":
            return "/deputyCommissionerDash";
        case "driver":
            return "/driverDash";
        default:
            return "/login";
    }
}


/*
 * Password visibility toggle.
 */
if (togglePassword && password) {
    togglePassword.addEventListener("click", () => {
        const hidden = password.type === "password";

        password.type = hidden ? "text" : "password";
        togglePassword.textContent = hidden
            ? "Hide"
            : "Show";

        togglePassword.setAttribute(
            "aria-label",
            hidden
                ? "Hide password"
                : "Show password"
        );
    });
}


/*
 * Login submission.
 */
if (form) {
    form.addEventListener("submit", async event => {
        event.preventDefault();
        showMessage("");
        if (verifyHelp) verifyHelp.hidden = true;

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const emailValue = String(
            email?.value || ""
        ).trim();

        const passwordValue =
            password?.value || "";

        const selectedRole = String(
            role?.value || ""
        ).trim().toLowerCase();

        if (!emailValue || !passwordValue || !selectedRole) {
            showMessage(
                "Email, password and role are required."
            );
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(
                "/api/auth/login",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    credentials: "same-origin",
                    body: JSON.stringify({
                        email: emailValue,
                        password: passwordValue,
                        role: selectedRole
                    })
                }
            );

            let result = null;

            try {
                result = await response.json();
            } catch (error) {
                console.error(
                    "Login response parsing error:",
                    error
                );

                throw new Error(
                    "The server returned an invalid response."
                );
            }

            if (result?.code === "EMAIL_NOT_VERIFIED") {
                if (verifyHelp) verifyHelp.hidden = false;
                if (verifyHelpLink) {
                    verifyHelpLink.href = `/verifyEmail?email=${encodeURIComponent(emailValue)}`;
                }
            }

            if (
                !response.ok ||
                result?.success !== true
            ) {
                throw new Error(
                    result?.message || "Login failed."
                );
            }

            /*
             * Never build a redirect from arbitrary server-provided URLs.
             * getSafeRedirect() maps the authenticated role to a fixed local
             * application route.
             */
            const redirectPath =
                getSafeRedirect(result);

            window.location.replace(redirectPath);

        } catch (error) {
            console.error(
                "Login error:",
                error
            );

            showMessage(
                error?.message ||
                "Unable to sign in. Please try again."
            );

            setLoading(false);
        }
    });
}
