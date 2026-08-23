const form = document.getElementById("loginForm");

const email = document.getElementById("email");
const password = document.getElementById("password");
const role = document.getElementById("role");

const message = document.getElementById("loginMessage");

const togglePassword =
    document.getElementById("togglePassword");


// Show / Hide Password
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


// Login form validation
form.addEventListener("submit", async (event) => {

    event.preventDefault();

    message.textContent = "";
    message.style.color = "#cf4f5b";


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


    // Check email format
    if (!email.checkValidity()) {

        message.textContent =
            "Please enter a valid email address.";

        email.focus();

        return;
    }


    // Check password length
    if (passwordValue.length < 6) {

        message.textContent =
            "Password must contain at least 6 characters.";

        password.focus();

        return;
    }


    /*
        Authentication is NOT connected to MySQL yet.

        Later this section will send:

        POST /api/auth/login

        to the Node.js + Express backend.
    */


    message.style.color = "#4e7a2f";

    message.textContent =
        `Login details accepted for ${getRoleName(roleValue)}. Database authentication will be connected next.`;


    // Temporary console output for development
    console.log({
        email: emailValue,
        role: roleValue
    });

});


// Convert role value into readable name
function getRoleName(roleValue) {

    const names = {

        deputy_commissioner:
            "Deputy Commissioner (Health)",

        assistant_commissioner:
            "Assistant Commissioner",

        sanitary_inspector:
            "Sanitary Inspector",

        driver:
            "Driver",

        citizen:
            "Citizen"

    };

    return (
        names[roleValue] ||
        "selected role"
    );
}
