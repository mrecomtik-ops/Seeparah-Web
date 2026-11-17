import {describe,expect,it} from "vitest";
import {seeparahScheduledTask} from "./cron-job-routing";

describe("Seeparah Cloudflare Free resource-bounded scheduled jobs",()=>{
  const at="2026-11-17T02:30:00.000Z";
  it("keeps importing separate from recovery, translations and covers",()=>{
    const t=Date.parse("2026-11-17T07:17:00.000Z");
    expect(seeparahScheduledTask("* * * * *",t)).toBe("gutenberg-import");
    expect(seeparahScheduledTask("*/2 * * * *",t)).toBe("gutenberg-recovery");
    expect(seeparahScheduledTask("*/3 * * * *",t)).toBe("translations");
    expect(seeparahScheduledTask("*/5 * * * *",t)).toBe("legacy-archive");
    expect(["cover-cache","catalogue-discovery"]).toContain(seeparahScheduledTask("*/7 * * * *",t));
  });
  it("preserves daily retention without running legacy archive in same invocation",()=>{
    expect(seeparahScheduledTask("*/5 * * * *",Date.parse(at))).toBe("retention");
    expect(seeparahScheduledTask("*/5 * * * *",Date.parse("2026-11-17T02:35:00Z"))).toBe("legacy-archive");
  });
  it("fails closed on unexpected triggers",()=>{
    expect(seeparahScheduledTask("* * * * 5",Date.now())).toBeNull();
  });
  it("alternates long-running coverage across source mirror maintenance",()=>{
    const first=seeparahScheduledTask("*/7 * * * *",Date.parse("2026-11-17T07:07:00Z"));
    const second=seeparahScheduledTask("*/7 * * * *",Date.parse("2026-11-17T07:14:00Z"));
    expect(first).not.toBe(second);
  });
});
