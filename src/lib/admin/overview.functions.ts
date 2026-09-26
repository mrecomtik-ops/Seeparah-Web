import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin.server";

const withToken = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ accessToken: z.string(), ...shape });

export const adminGetOverviewAnalytics = createServerFn({ method: "POST" })
  .inputValidator((data) => withToken({}).parse(data))
  .handler(async ({ data }) => {
    await requireAdmin(data.accessToken, "health.read");
    const { getAdminOverviewAnalytics } = await import("@/lib/admin/overview.server");
    return getAdminOverviewAnalytics();
  });
