import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const isWindows = process.platform === "win32";
const result = spawnSync(isWindows ? "cmd.exe" : "npx", isWindows
  ? ["/d", "/s", "/c", "npx.cmd supabase status -o env"]
  : ["supabase", "status", "-o", "env"], {
  encoding: "utf8",
});

if (result.status !== 0) {
  console.error("Local Supabase must be running before generating .env.local.");
  process.exit(result.status ?? 1);
}

const values = Object.fromEntries(
  result.stdout
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].replace(/"$/, "")])
);

if (!values.API_URL || !values.ANON_KEY) {
  console.error("Supabase status did not provide API_URL and ANON_KEY.");
  process.exit(1);
}

writeFileSync(
  ".env.local",
  `NEXT_PUBLIC_SUPABASE_URL=${values.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${values.ANON_KEY}\n`,
  { encoding: "utf8", mode: 0o600 }
);

console.log("Wrote low-privilege local Supabase settings to ignored .env.local.");
