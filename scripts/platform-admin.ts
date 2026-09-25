/** Secure local operator tool for credential-backed Platform Admins. */
async function main() {
  try { process.loadEnvFile(); } catch { /* environment may already be loaded */ }
  const { createPlatformAdminAccount, changePlatformAdminPassword, normalizePlatformAdminUsername } = await import("../src/modules/platform-admin/credentials");
  const { db } = await import("../src/db");
  const { platformAdminAccounts } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const command = process.argv[2];
  if (command !== "create" && command !== "password") {
    throw new Error("Usage: npm run admin:create | npm run admin:password");
  }
  const username = normalizePlatformAdminUsername(await prompt("Username: "));
  const password = await promptSecret("Password: ");
  if (command === "create") {
    const displayName = await prompt("Display name (optional): ");
    const account = await createPlatformAdminAccount({ username, displayName, password });
    console.log(`Created Platform Admin ${account.username}. No email identity was created.`);
  } else {
    const account = await db.query.platformAdminAccounts.findFirst({ where: eq(platformAdminAccounts.username, username) });
    if (!account) throw new Error("No Platform Admin account matches that username.");
    await changePlatformAdminPassword(account.id, password);
    console.log(`Password changed for ${account.username}.`);
  }
}

function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes("\n") || text.includes("\r")) {
        process.stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value.trim());
      } else {
        value += text;
      }
    };
    process.stdin.on("data", onData);
  });
}

function promptSecret(question: string): Promise<string> {
  process.stdout.write(question);
  if (!process.stdin.isTTY) return prompt("");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString()) {
        if (char === "\u0003") process.exit(130);
        if (char === "\r" || char === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
        } else if (char === "\u007f") {
          value = value.slice(0, -1);
        } else value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
