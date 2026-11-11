/** Support belongs in catalogue and public-site chrome, never on top of
 * a reader's pages, overlays or any admin management surface. */
export function showFloatingFeedback(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return !(/^\/read(?:\/|$)/.test(clean) ||
    /^\/sacred-texts\//.test(clean) ||
    /^\/admin(?:\/|$)/.test(clean));
}
