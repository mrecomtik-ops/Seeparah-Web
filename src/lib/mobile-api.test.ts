import {describe,expect,it} from 'vitest';
import {asMobileBook,parseMobileListQuery,MOBILE_CONTENT_PAGE_LIMIT} from './mobile-api.server';

describe('Native app catalogue contract remains public, bounded and safe',()=>{
  it('limits page and search filters without PostgREST grammar injection',()=>{
    expect(parseMobileListQuery(new URLSearchParams('q=Charles%20Dickens&kind=sacred')))
      .toMatchObject({page:1,query:'Charles Dickens',kind:'sacred'});
    for(const q of ['q=x%25','q=x%2Cy','q=x%28foo%29','page=-1','page=0','kind=secret','language=x%25']){
      expect(()=>parseMobileListQuery(new URLSearchParams(q))).toThrow();
    }
    // Do not accept user-supplied glob/extglob patterns. picomatch's
    // unpatched ReDoS advisory must not become reachable from native queries.
    for(const q of [
      'q=%2A%2A%28a%29', 'q=%21%28a%7Cb%29',
      'q=%2A%28%2A%28a%29%29',
      'language=%2A%28Urdu%7CArabic%29',
    ]){
      expect(()=>parseMobileListQuery(new URLSearchParams(q))).toThrow();
    }
    expect(MOBILE_CONTENT_PAGE_LIMIT).toBeLessThanOrEqual(24);
  });
  it('never sends admin, rights, reviewer or review-note columns',()=>{
    const row={id:'abc',title:'Example',author:'Author',description:'Real summary',
      source_language:'English',available_languages:['English'],total_chunks:100,
      content_classification:'religious',source_url:'https://www.gutenberg.org/ebooks/10',
      review_notes:'PRIVATE',rights_basis:'PRIVATE',reviewed_by:'PRIVATE',rights_evidence_url:'PRIVATE'};
    const result=asMobileBook(row);
    expect(result).toMatchObject({kind:'sacred',sourceLanguage:'English',chunkCount:100});
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
});
