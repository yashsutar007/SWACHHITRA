const form = document.getElementById("loginForm");
const email = document.getElementById("email");
const password = document.getElementById("password");
const role = document.getElementById("role");
const message = document.getElementById("loginMessage");
const togglePassword = document.getElementById("togglePassword");
const button = form.querySelector("button[type=submit]");

const showMessage = text => {
  message.textContent = text;
};

togglePassword.addEventListener("click", () => {
  const hidden = password.type === "password";
  password.type = hidden ? "text" : "password";
  togglePassword.textContent = hidden ? "Hide" : "Show";
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  showMessage("");

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  button.disabled = true;
  button.textContent = "Signing in...";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        email: email.value.trim(),
        password: password.value,
        role: role.value
      })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Login failed.");
    }

    window.location.href = "/profile";
  } catch (error) {
    showMessage(error.message);
    button.disabled = false;
    button.textContent = "Login";
  }
});
