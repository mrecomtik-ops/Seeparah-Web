/**
 * One independent Cloudflare Cron Trigger invocation per resource-heavy job.
 * The Free plan subrequest budget is per invocation, NOT per waitUntil.
 * Exact cron-expression equality is required by Cloudflare.
 */
export type SeeparahCronTask =
  | "gutenberg-import" | "gutenberg-recovery" | "translations"
  | "legacy-archive" | "cover-cache" | "catalogue-discovery"
  | "retention";

export function seeparahScheduledTask(
  cron: string, scheduledTime: number,
): SeeparahCronTask | null {
  switch(cron){
    case "* * * * *": return "gutenberg-import";
    case "*/2 * * * *": return "gutenberg-recovery";
    case "*/3 * * * *": return "translations";
    case "*/5 * * * *": {
      const utc=new Date(scheduledTime);
      return utc.getUTCHours()===2 && utc.getUTCMinutes()===30
        ? "retention" : "legacy-archive";
    }
    case "*/7 * * * *": {
      // 78k discovery is already complete, but future official catalog
      // checkpoints and cover-cache verification must both remain scheduled.
      return Math.floor(scheduledTime/420000)%2===0
        ? "cover-cache":"catalogue-discovery";
    }
    default: return null;
  }
}
