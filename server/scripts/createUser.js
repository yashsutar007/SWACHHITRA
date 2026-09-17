const bcrypt = require("bcryptjs");
const db = require("../config/db");

const [emailArg, passwordArg, roleArg] = process.argv.slice(2);
const roles = [
  "deputy_commissioner",
  "assistant_commissioner",
  "sanitary_inspector",
  "driver",
  "citizen"
];

async function main() {
  if (!emailArg || !passwordArg || !roles.includes(roleArg)) {
    console.error("Usage: npm run create-user -- email password role");
    console.error(`Roles: ${roles.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const email = emailArg.trim().toLowerCase();
  const hash = await bcrypt.hash(passwordArg, 12);

  await db.execute(
    `INSERT INTO users (email, password_hash, role, status)
     VALUES (?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role), status = 'active'`,
    [email, hash, roleArg]
  );

  console.log(`User created: ${email} (${roleArg})`);
  await db.end();
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
