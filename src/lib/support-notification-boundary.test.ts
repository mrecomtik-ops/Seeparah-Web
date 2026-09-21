import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = resolve(process.cwd(), "src");

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("SUPPORT_NOTIFICATION_TO stays out of client-reachable code", () => {
  it("the env var name appears only in server-only (.server.ts) files", () => {
    const files = listSourceFiles(SRC_DIR);
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith(".server.ts") || /\.test\.tsx?$/.test(file)) continue;
      const content = readFileSync(file, "utf8");
      if (content.includes("SUPPORT_NOTIFICATION_TO")) {
        offenders.push(relative(SRC_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("sendSupportNotificationEmail is not imported from any non-server-only, non-server-function-wrapper file", () => {
    const files = listSourceFiles(SRC_DIR);
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith(".server.ts") || /\.test\.tsx?$/.test(file)) continue;
      if (file.endsWith("support.functions.ts")) continue; // the one legitimate server-function wrapper that imports it
      const content = readFileSync(file, "utf8");
      if (content.includes("support-notification.server")) {
        offenders.push(relative(SRC_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("sendTicketReplyEmail's own function body never references SUPPORT_NOTIFICATION_TO", () => {
    // The requester-facing reply must never be able to leak the private
    // inbox address, even indirectly. Isolate just this function's source
    // (up to the next top-level export) rather than the whole file, so a
    // future addition elsewhere in this file can't hide a violation here.
    const content = readFileSync(
      resolve(SRC_DIR, "lib/support-notification.server.ts"),
      "utf8",
    );
    const start = content.indexOf("export async function sendTicketReplyEmail");
    expect(start).toBeGreaterThan(-1);
    const nextExport = content.indexOf("\nexport ", start + 1);
    const fnBody = content.slice(start, nextExport === -1 ? undefined : nextExport);
    expect(fnBody).not.toContain("SUPPORT_NOTIFICATION_TO");
  });
});
