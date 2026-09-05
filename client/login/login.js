const form = document.getElementById("loginForm");

const email = document.getElementById("email");
const password = document.getElementById("password");
const role = document.getElementById("role");

const message = document.getElementById("loginMessage");

const togglePassword =
    document.getElementById("togglePassword");


// ===============================
// Show / Hide Password
// ===============================

togglePassword.addEventListener("click", () => {

    const isHidden =
        password.type === "password";

    if (isHidden) {

        password.type = "text";
        togglePassword.textContent = "Hide";

    } else {

        password.type = "password";
        togglePassword.textContent = "Show";

    }

});


// ===============================
// Login Form Validation
// ===============================

form.addEventListener("submit", (event) => {

    event.preventDefault();

    message.textContent = "";
    message.style.color = "#c83b3b";


    const emailValue =
        email.value.trim();

    const passwordValue =
        password.value;

    const roleValue =
        role.value;


    // Check empty fields

    if (
        !emailValue ||
        !passwordValue ||
        !roleValue
    ) {

        message.textContent =
            "Please fill in all fields.";

        return;

    }


    // Validate email

    if (!email.checkValidity()) {

        message.textContent =
            "Please enter a valid email address.";

        email.focus();

        return;

    }


    // Validate password length

    if (passwordValue.length < 6) {

        message.textContent =
            "Password must contain at least 6 characters.";

        password.focus();

        return;

    }


    // ===============================
    // Temporary Role Storage
    // ===============================

    // MySQL authentication will replace this later

    sessionStorage.setItem(
        "swachhitraEmail",
        emailValue
    );

    sessionStorage.setItem(
        "swachhitraRole",
        roleValue
    );


    // Redirect to profile page

    window.location.href =
        "/profile/profile.html";

});