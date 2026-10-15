import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderSacredInline } from "./sacred-inline-markup";

const html = (input: string) => renderToStaticMarkup(<>{renderSacredInline(input)}</>);

describe("safe sourced scripture inline rendering", () => {
  it("renders DN34 bold headings without showing literal tag bytes", () => {
    const source = "One thing. \n\n<b>What one thing is helpful?</b> \n\nDiligence in skillful qualities.";
    const rendered = html(source);
    expect(rendered).toContain("<strong>What one thing is helpful?</strong>");
    expect(rendered).not.toContain("&lt;b&gt;");
    expect(rendered).toContain("Diligence in skillful qualities.");
  });
  it("retains the actual source text and disallows arbitrary embedded HTML", () => {
    const rendered = html("A <script>alert('x')</script> & <b>real text</b>");
    expect(rendered).toContain("&lt;script&gt;");
    expect(rendered).toContain("&lt;/script&gt;");
    expect(rendered).toContain("<strong>real text</strong>");
    expect(rendered).toContain(" &amp; ");
    expect(rendered).not.toContain("<script>");
  });
  it("renders italics and a secure SuttaCentral source reference", () => {
    const rendered = html("Original <i>dukkha</i> and <em>emphasis</em>. Refer <a href='https://suttacentral.net/sn45.92'>SN 45.92</a>.");
    expect(rendered).toContain('<i lang="pi">dukkha</i>');
    expect(rendered).toContain("<em>emphasis</em>");
    expect(rendered).toContain("https://suttacentral.net/sn45.92");
    expect(rendered).toContain("SN 45.92</a>");
    expect(rendered).toContain('rel="noreferrer noopener"');
  });
  it("preserves unknown or unbalanced source markup visibly and blocks unsafe links", () => {
    const rendered = html("Before <b>unfinished; <a href='javascript:alert(1)'>unsafe</a> and <odd>original</odd>");
    expect(rendered).toContain("&lt;b&gt;");
    expect(rendered).toContain("&lt;odd&gt;");
    expect(rendered).toContain("&lt;a href=&#x27;javascript:alert(1)&#x27;&gt;");
    expect(rendered).not.toContain('href="javascript:');
  });
  it("treats Bilara's nonlexical <j> joining marker as display-only", () => {
    const rendered = html("they <j>took refuge.");
    expect(rendered).toContain("they took refuge.");
    expect(rendered).not.toContain("&lt;j&gt;");
  });
  it("returns ordinary source text unchanged for no markup, including RTL and blank lines", () => {
    const src = "سُبْحَانَ اللَّهِ\n\nאָמֵן";
    expect(renderSacredInline(src)).toBe(src);
  });
});
