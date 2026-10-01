import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const required = [
  ["Supabase project URL", "https://wxldqxuxpjurttspbxok.supabase.co"],
  ["Supabase publishable key", "sb_publishable_0dqRtyB4-A7AuuYzP_KNMQ_PBjrfDHy"],
];

const assetsDir = join(process.cwd(), "dist", "client", "assets");
const files = (await readdir(assetsDir)).filter((name) => name.endsWith(".js"));

let bundle = "";
for (const name of files) {
  bundle += await readFile(join(assetsDir, name), "utf8");
}

const missing = required.filter(([, value]) => !bundle.includes(value));
if (missing.length > 0) {
  console.error(
    "FATAL: browser build is missing required public Supabase configuration: " +
      missing.map(([label]) => label).join(", "),
  );
  console.error(
    "Refusing to produce a deployable build. Restore src/config/public-supabase.ts before deploying.",
  );
  process.exit(1);
}

console.log("Verified browser Supabase public configuration is embedded in the client bundle.");
