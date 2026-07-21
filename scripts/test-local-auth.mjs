import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const isWindows = process.platform === "win32";
const status = spawnSync(isWindows ? "cmd.exe" : "npx", isWindows
  ? ["/d", "/s", "/c", "npx.cmd supabase status -o env"]
  : ["supabase", "status", "-o", "env"], {
  encoding: "utf8",
});
if (status.status !== 0) throw new Error("Local Supabase is not running.");

const env = Object.fromEntries(status.stdout.split(/\r?\n/).map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((match) => [match[1], match[2].replace(/"$/, "")]));
if (!env.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY || !env.MAILPIT_URL) throw new Error("Required local test values are unavailable.");

const storage = new Map();
const memoryStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
const client = createClient(env.API_URL, env.ANON_KEY, { auth: { flowType: "pkce", persistSession: true, autoRefreshToken: false, storage: memoryStorage } });
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const email = `auth-${suffix}@example.test`;
const oldPassword = `Maker-${suffix}!`;
const newPassword = `Updated-${suffix}!`;
let userId;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`ok - ${message}`);
}

async function waitForEmail(subjectFragment) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listing = await fetch(`${env.MAILPIT_URL}/api/v1/messages`).then((response) => response.json());
    const message = listing.messages?.find((item) =>
      item.To?.some((recipient) => recipient.Address === email) &&
      item.Subject?.toLowerCase().includes(subjectFragment)
    );
    if (message) return fetch(`${env.MAILPIT_URL}/api/v1/message/${message.ID}`).then((response) => response.json());
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Mailpit did not receive ${subjectFragment} email.`);
}

function verificationLink(message) {
  const content = `${message.HTML ?? ""}\n${message.Text ?? ""}`.replaceAll("&amp;", "&");
  const link = content.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/)?.[0];
  if (!link) throw new Error("Auth verification link was not found in Mailpit.");
  return link;
}

async function exchangeEmailLink(message) {
  const response = await fetch(verificationLink(message), { redirect: "manual" });
  const location = response.headers.get("location");
  const code = location ? new URL(location).searchParams.get("code") : null;
  assert(Boolean(code), "email callback supplies a PKCE authorization code");
  const result = await client.auth.exchangeCodeForSession(code);
  assert(!result.error && Boolean(result.data.session), "callback establishes a valid session");
  return result.data;
}

try {
  const signup = await client.auth.signUp({ email, password: oldPassword, options: { emailRedirectTo: "http://localhost:3000/auth/callback" } });
  userId = signup.data.user?.id;
  assert(Boolean(userId) && !signup.data.session, "registration creates an unconfirmed user");
  const confirmation = await waitForEmail("confirm");
  assert(Boolean(confirmation), "confirmation email is generated in Mailpit");
  await exchangeEmailLink(confirmation);
  await client.auth.signOut();

  const login = await client.auth.signInWithPassword({ email, password: oldPassword });
  assert(!login.error && Boolean(login.data.session), "login succeeds after confirmation");
  await client.auth.signOut();
  const incorrect = await client.auth.signInWithPassword({ email, password: "not-the-password" });
  assert(Boolean(incorrect.error), "incorrect password fails");

  const reset = await client.auth.resetPasswordForEmail(email, { redirectTo: "http://localhost:3000/auth/callback?next=%2Fupdate-password" });
  assert(!reset.error, "password-reset request is accepted");
  const recovery = await waitForEmail("reset");
  assert(Boolean(recovery), "recovery email is generated in Mailpit");
  await exchangeEmailLink(recovery);
  const update = await client.auth.updateUser({ password: newPassword });
  assert(!update.error, "password update succeeds");
  await client.auth.signOut();
  const oldLogin = await client.auth.signInWithPassword({ email, password: oldPassword });
  assert(Boolean(oldLogin.error), "old password fails after update");
  const newLogin = await client.auth.signInWithPassword({ email, password: newPassword });
  assert(!newLogin.error && Boolean(newLogin.data.session), "new password succeeds");
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
}
