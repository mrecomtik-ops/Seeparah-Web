// R2 is an optional, private Cloudflare Workers binding. The runtime supplies
// the actual environment object; no credential or bucket URL is exposed.
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
