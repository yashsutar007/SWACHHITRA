(() => {
    "use strict";

    const form = document.getElementById("issueRecoveryCodeForm");
    const heading = document.getElementById("issuerHeading");
    const subtitle = document.getElementById("issuerSubtitle");
    const roleLabel = document.getElementById("issuerRoleLabel");
    const emailLabel = document.getElementById("targetEmailLabel");
    const targetHint = document.getElementById("targetHint");
    const emailInput = document.getElementById("targetEmail");
    const message = document.getElementById("issuerMessage");
    const button = document.getElementById("issueCodeButton");
    const codeResult = document.getElementById("codeResult");
    const codeValue = document.getElementById("recoveryCodeValue");
    const codeResultMessage = document.getElementById("codeResultMessage");
    const signInPrompt = document.getElementById("signInPrompt");
    const copyButton = document.getElementById("copyRecoveryCodeButton");
    const anotherButton = document.getElementById("issueAnotherCodeButton");

    let issuerRole = "";
    let endpoint = "";
    let csrfEndpoint = "";
    let csrfToken = "";

    function setMessage(element, text, kind = "") {
        element.textContent = String(text || "");
        element.className = `security-notice ${kind}`.trim();
    }

    async function readJson(response) {
        return response.json().catch(() => null);
    }

    async function initialize() {
        try {
            const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
            const result = await readJson(response);
            if (!response.ok || result?.success !== true) {
                heading.textContent = "Sign in required";
                subtitle.textContent = "Only an authenticated assigning authority can issue a staff recovery code.";
                signInPrompt.textContent = "Sign in as the Sanitary Inspector responsible for the Driver's Ward, or as the Assistant Commissioner who assigned the Inspector, then reopen this page.";
                signInPrompt.classList.remove("security-hidden");
                return;
            }

            issuerRole = String(result.user?.role || "");
            if (issuerRole === "sanitary_inspector") {
                endpoint = "/api/auth/password/activation/driver";
                csrfEndpoint = "/api/inspector/security/csrf-token";
                roleLabel.textContent = "SANITARY INSPECTOR";
                heading.textContent = "Issue a Driver code";
                subtitle.textContent = "Enter the login email of a Driver linked to a Driver Registry record in your current assigned Ward/Division.";
                emailLabel.textContent = "Driver login email";
                targetHint.textContent = "The backend checks the active Driver account, Registry link, active Ward/Zone, and your current operational scope.";
            } else if (issuerRole === "assistant_commissioner") {
                endpoint = "/api/auth/password/activation/inspector";
                csrfEndpoint = "/api/assistant/security/csrf-token";
                roleLabel.textContent = "ASSISTANT COMMISSIONER";
                heading.textContent = "Issue an Inspector code";
                subtitle.textContent = "Enter the login email of an active Inspector assigned by you in your current Division.";
                emailLabel.textContent = "Inspector login email";
                targetHint.textContent = "The backend checks the Inspector's active account, current Division/Ward, and assignment record.";
            } else {
                heading.textContent = "Code issuance not permitted";
                subtitle.textContent = "This function is restricted to Sanitary Inspectors and Assistant Commissioners.";
                signInPrompt.textContent = "Your current role cannot issue staff recovery codes.";
                signInPrompt.classList.remove("security-hidden");
                return;
            }

            const csrfResponse = await fetch(csrfEndpoint, { credentials: "same-origin", cache: "no-store" });
            const csrfResult = await readJson(csrfResponse);
            if (!csrfResponse.ok || !csrfResult?.csrfToken) {
                throw new Error(csrfResult?.message || "Could not establish the session security token. Refresh the page and try again.");
            }
            csrfToken = csrfResult.csrfToken;
            form.classList.remove("security-hidden");
        } catch (error) {
            heading.textContent = "Unable to initialize";
            subtitle.textContent = "Refresh the page. If the problem continues, sign in again.";
            signInPrompt.textContent = error.message || "Unable to verify authority access.";
            signInPrompt.classList.remove("security-hidden");
        }
    }

    form?.addEventListener("submit", async event => {
        event.preventDefault();
        setMessage(message, "");
        codeResult.classList.add("security-hidden");
        if (!form.checkValidity()) { form.reportValidity(); return; }
        if (!endpoint || !csrfToken) {
            setMessage(message, "Authority session is not ready. Refresh and try again.", "error");
            return;
        }

        button.disabled = true;
        button.textContent = "Verifying assignment…";
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                credentials: "same-origin",
                cache: "no-store",
                headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
                body: JSON.stringify({ email: emailInput.value.trim() })
            });
            const result = await readJson(response);
            if (!response.ok || result?.success !== true) throw new Error(result?.message || "Unable to issue a code.");

            codeValue.textContent = String(result.recoveryCode || "");
            codeResultMessage.textContent = `${result.message || "Code issued."} Expiry: ${Number(result.expiresInMinutes) || 30} minutes.`;
            codeResult.classList.remove("security-hidden");
            form.classList.add("security-hidden");
            emailInput.value = "";
        } catch (error) {
            setMessage(message, error.message || "Unable to issue a recovery code.", "error");
        } finally {
            button.disabled = false;
            button.textContent = "Issue one-time code";
        }
    });

    copyButton?.addEventListener("click", async () => {
        const code = codeValue.textContent.trim();
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
            copyButton.textContent = "Copied";
        } catch {
            setMessage(codeResultMessage, "Clipboard access was blocked. Select the code and copy it manually.", "error");
        }
    });

    anotherButton?.addEventListener("click", () => {
        // Issuing another code invalidates the previous code for the same user.
        codeValue.textContent = "";
        codeResult.classList.add("security-hidden");
        form.classList.remove("security-hidden");
        emailInput.focus();
        copyButton.textContent = "Copy code";
        setMessage(message, "A newly issued code will invalidate any previous unused recovery code.");
    });

    initialize();
})();
