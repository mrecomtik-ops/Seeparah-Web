/**
 * SP-36: measurable architecture acceptance, not a cosmetic line-count check.
 * Source-preserving reader geometry & chrome must be independently typed and
 * covered; privileged rights and destructive admin code must retain server
 * authority. These checks forbid regressions back into giant UI monoliths.
 */
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

const src=(p)=>readFileSync(p,"utf8");
const cases=[
  {path:"src/components/reader/BookReaderV3.tsx",budget:1250,
   children:["BookReaderSettings","BookReaderTopbar","BookReaderBottomBar","BookReaderFinishDialog","BookReaderPhysicalPage"]},
  {path:"src/routes/admin/books/$bookId.tsx",budget:1000,
   children:["AdminBookHeaderActions","AdminBookReviewPanels","AdminBookRightsDialog","AdminBookMetadataDialog","AdminBookDestructiveDialogs","AdminBookSourceEditPanel","AdminBookReviewPreview","AdminBookOrganizer","AdminBookPublishingChecklist"]},
];
const evidence=[];
for(const item of cases){
  const s=src(item.path);
  const lines=s.split("\n").length;
  assert.ok(lines<=item.budget,`${item.path} exceeds maintainability budget (${lines} > ${item.budget})`);
  for(const child of item.children){
    assert.ok(s.includes(`<${child}`)||s.includes(child+" />"),
      item.path+" lost explicit delegation to "+child);
    const name=child==="BookReaderFrontMatterPage"?"BookReaderFrontMatterPage":child;
    const location=(item.path.includes("/reader/")?"src/components/reader/":"src/components/admin/")+name+".tsx";
    assert.ok(existsSync(location),name+" extracted child is missing");
  }
  evidence.push({module:item.path,lines,budget:item.budget,delegations:item.children.length});
}
assert.ok(src("src/components/reader/BookReaderPhysicalPage.tsx").includes("FrontMatterPage"),
  "Physical page no longer delegates front matter");
assert.ok(existsSync("src/components/reader/BookReaderFrontMatterPage.tsx"),
  "Book mode front matter component is missing");
// Reader presentational layers never write source or own persistent book state.
const readerSurfaces=[
"src/components/reader/BookReaderPhysicalPage.tsx",
"src/components/reader/BookReaderFrontMatterPage.tsx",
"src/components/reader/BookReaderTopbar.tsx",
"src/components/reader/BookReaderBottomBar.tsx",
"src/components/reader/BookReaderFinishDialog.tsx",
"src/components/reader/BookReaderSettings.tsx",
];
for(const p of readerSurfaces){
 const t=src(p);
 assert.ok(!/\b(?:useState|useEffect|useLayoutEffect)\s*\(/.test(t),p+" acquired hidden state/effect");
 assert.ok(!/supabaseAdmin|service_role|SUPABASE_SERVICE_ROLE_KEY|adminDeleteBookPermanently|adminPublishChunkContentEdit/.test(t),
    p+" imported a privileged/source-changing operation");
}
const adminBoundaries=[
"src/components/admin/AdminBookReviewPanels.tsx",
"src/components/admin/AdminBookHeaderActions.tsx",
"src/components/admin/AdminBookMetadataDialog.tsx",
"src/components/admin/AdminBookRightsDialog.tsx",
"src/components/admin/AdminBookDestructiveDialogs.tsx",
"src/components/admin/AdminBookSourceEditPanel.tsx",
];
for(const p of adminBoundaries){
 const t=src(p);
 assert.ok(!/supabaseAdmin|SUPABASE_SERVICE_ROLE_KEY|\bservice_role\b/.test(t),p+" gained service role");
}
// Sensitive actions still demand a freshly authenticated, active role+aal2.
const gate=src("src/lib/admin/require-admin.server.ts");
assert.match(gate,/auth\.getClaims\(accessToken\)/);
assert.match(gate,/\.from\("admin_users"\)/);
assert.match(gate,/aal\s*!==\s*"aal2"/);
assert.match(gate,/roleHasCapability\(role, capability\)/);
const deleteEntrypoint=src("src/lib/admin/catalog.functions.ts");
// Source repository helper is deliberately authority-free: the exposed
// server function checks the role/MFA before invoking it.
const destructive=deleteEntrypoint.slice(deleteEntrypoint.indexOf("export const adminDeleteBookPermanently"));
assert.ok(destructive.includes('requireAdmin(data.accessToken, "catalog.delete_permanent")'),
    "permanent delete endpoint lost authenticated AAL2/capability verification");
assert.ok(destructive.includes("data.confirmTitle.trim() !== impact.title"),
    "server-side exact-title confirmation was removed");
for(const p of [
"src/components/reader/BookReaderPhysicalPage.test.tsx",
"src/components/reader/BookReaderFrontMatterPage.test.tsx",
"src/components/reader/BookReaderChrome.test.tsx",
"src/components/reader/BookReaderSettings.test.tsx",
"src/components/admin/AdminBookHeaderActions.test.tsx",
"src/components/admin/AdminBookDestructiveDialogs.test.tsx",
"src/components/admin/AdminBookReviewPanels.test.tsx",
"src/components/admin/AdminBookRightsDialog.test.tsx",
"src/components/admin/AdminBookMetadataDialog.test.tsx",
"src/lib/admin/require-admin.role-mfa.test.ts",
]) assert.ok(existsSync(p),"Missing regression coverage: "+p);
console.log("SEE_PARAH_SP36_ARCHITECTURE_ACCEPTANCE "+
 JSON.stringify({status:"passed",evidence,readerPanels:readerSurfaces.length,
   adminPanels:adminBoundaries.length,privilegedServerBoundary:"aal2 + active role + capability verified",
   limitations:"Architecture check validates module boundaries with CI, not a real MFA owner/admin session",
 }));
