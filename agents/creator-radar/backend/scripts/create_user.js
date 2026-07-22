// CLI: create a user, or reset an existing user's password.
//
//   node scripts/create_user.js <username> <password> [role]        # legacy positional (role default viewer)
//   node scripts/create_user.js --username U --password P [--role viewer|admin]
//   node scripts/create_user.js --username U --reset-password NEWPASS [--role R]
//
// Passwords are hashed with bcrypt (10 rounds). Create fails if the username already exists.
// --reset-password updates password_hash for an EXISTING user (errors if absent) and leaves
// the role intact unless --role is also passed.
import bcrypt from "bcrypt";
import { get, run, nowIso } from "../src/db.js";
import { logger } from "../src/logger.js";

const BCRYPT_ROUNDS = 10;
const argv = process.argv.slice(2);

// Value following a --flag, unless that value is itself another --flag.
function flagVal(name) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
}

const usesFlags = argv.some((a) => a.startsWith("--"));

let username, password, role, resetPassword;
if (usesFlags) {
  username = flagVal("--username");
  password = flagVal("--password");
  role = flagVal("--role"); // null unless explicitly passed
  resetPassword = flagVal("--reset-password");
} else {
  [username, password, role] = argv; // legacy positional
}

const USAGE =
  "usage:\n" +
  "  node scripts/create_user.js <username> <password> [role]\n" +
  "  node scripts/create_user.js --username U --password P [--role viewer|admin]\n" +
  "  node scripts/create_user.js --username U --reset-password NEWPASS [--role R]";

if (!username) {
  console.error(USAGE);
  process.exit(1);
}

const existing = await get("SELECT id, role FROM users WHERE username = @u", { u: username });

// ---- reset-password mode: update an existing user's password (role optional) ----
if (resetPassword) {
  if (!existing) {
    console.error(`user "${username}" does not exist — cannot reset password`);
    process.exit(1);
  }
  const password_hash = await bcrypt.hash(resetPassword, BCRYPT_ROUNDS);
  if (role) {
    await run("UPDATE users SET password_hash = @h, role = @r WHERE username = @u", {
      h: password_hash,
      r: role,
      u: username,
    });
    logger.info(`reset password for "${username}" (role -> ${role})`);
  } else {
    await run("UPDATE users SET password_hash = @h WHERE username = @u", { h: password_hash, u: username });
    logger.info(`reset password for "${username}" (role unchanged: ${existing.role})`);
  }
  process.exit(0);
}

// ---- create mode ----
if (!password) {
  console.error("password required (positional <password> or --password)");
  process.exit(1);
}
if (existing) {
  console.error(`user "${username}" already exists (use --reset-password to change its password)`);
  process.exit(1);
}

const finalRole = role || "viewer";
const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
await run(
  "INSERT INTO users (username, password_hash, role, created_at) VALUES (@u, @h, @r, @c)",
  { u: username, h: password_hash, r: finalRole, c: nowIso() }
);
logger.info(`created user "${username}" (role=${finalRole})`);
