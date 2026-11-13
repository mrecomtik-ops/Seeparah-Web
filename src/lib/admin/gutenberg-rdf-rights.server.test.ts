import { describe, expect, it } from "vitest";
import { parseGutenbergRdfUsRights } from "./gutenberg-rdf-rights.server";

const rdf = (id: number, rights: string) =>
  `<rdf:RDF><pgterms:ebook rdf:about="ebooks/${id}"><dcterms:title>A Book</dcterms:title><dcterms:rights>${rights}</dcterms:rights></pgterms:ebook></rdf:RDF>`;

describe("Project Gutenberg official RDF rights extraction", () => {
  it("recognizes verified U.S. public-domain declaration only for exact ebook ID", () => {
    expect(parseGutenbergRdfUsRights(rdf(43019, "Public domain in the USA."),43019))
      .toEqual({copyright:false,rights:"Public domain in the USA."});
    expect(parseGutenbergRdfUsRights(rdf(43019, "Public domain in the USA."),43020)).toBeNull();
  });
  it("never converts copyrighted or unknown text to unrestricted", () => {
    expect(parseGutenbergRdfUsRights(rdf(43019, "Copyrighted. Read the license."),43019)?.copyright).toBe(true);
    expect(parseGutenbergRdfUsRights(rdf(43019, "Unknown"),43019)).toBeNull();
    expect(parseGutenbergRdfUsRights(rdf(43019, "Copyrighted. Read the license."),43020)).toBeNull();
  });
  it("rejects generic licence boilerplate outside the matching ebook record", () => {
    const fake = rdf(99,"Public domain in the USA.") +
      "<license>Public domain in the USA.</license>";
    expect(parseGutenbergRdfUsRights(fake,43019)).toBeNull();
    expect(parseGutenbergRdfUsRights("",43019)).toBeNull();
    expect(parseGutenbergRdfUsRights(rdf(43019,"Public domain in the USA."),0)).toBeNull();
  });
});
