/**
 * Seeparah native reader API v1: read-only, versioned, bounded.
 *
 * Trust boundary: only this Worker invokes the service-role database client.
 * Never return operator metadata or unpublished drafts. Each content response
 * reuses the website's exact resolveReaderAccess / published-source gate.
 * Native clients need no database credentials to read public books.
 */
export const MOBILE_PAGE_LIMIT = 24;
export const MOBILE_CONTENT_PAGE_LIMIT = 12;
const BOOK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SIMPLE_SEARCH = /^[\p{L}\p{N}\s.'’:\-]+$/u;
const CATALOG_FIELDS = [
  'id','title','author','cover_url','available_languages','total_chunks',
  'source_language','description','genre','categories','created_at',
  'content_classification','typography_profile','source_url','attribution',
].join(',');

type PublicRow = Record<string, unknown>;
export function asMobileBook(row: PublicRow) {
  const strings = (key: string): string[] =>
    Array.isArray(row[key]) ? (row[key] as unknown[]).filter(
      (x): x is string => typeof x === 'string'
    ) : [];
  return {
    id: String(row['id'] ?? ''),
    title: String(row['title'] ?? ''),
    author: String(row['author'] ?? ''),
    coverUrl: typeof row['cover_url'] === 'string' ? row['cover_url'] : null,
    description: typeof row['description'] === 'string' ? row['description'] : '',
    languages: strings('available_languages'),
    sourceLanguage: String(row['source_language'] ?? ''),
    chunkCount: Math.max(0, Number(row['total_chunks']) || 0),
    categories: strings('categories'),
    genre: typeof row['genre'] === 'string' ? row['genre'] : null,
    kind: row['content_classification'] === 'religious' ? 'sacred' : 'general',
    typography: typeof row['typography_profile'] === 'string' ? row['typography_profile'] : 'standard',
    sourceUrl: typeof row['source_url'] === 'string' ? row['source_url'] : null,
    attribution: typeof row['attribution'] === 'string' ? row['attribution'] : null,
  };
}

export function parseMobileListQuery(input: URLSearchParams) {
  const rawPage = input.get('page') ?? '1';
  const rawQ = (input.get('q') ?? '').trim().replace(/\s+/gu,' ');
  const kind = input.get('kind') ?? 'all';
  const language = (input.get('language') ?? '').trim();
  if (!/^[1-9]\d{0,3}$/u.test(rawPage) || Number(rawPage) > 4000 ||
      rawQ.length > 80 || (rawQ.length > 0 && !SIMPLE_SEARCH.test(rawQ)) ||
      !['all','general','sacred'].includes(kind) ||
      language.length > 80 || (language && !SIMPLE_SEARCH.test(language))) {
    throw new Error('Invalid mobile catalogue filters');
  }
  return { page: Number(rawPage), query: rawQ, kind, language };
}

function json(value: unknown, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(value),{
    status,
    headers: {
      'content-type':'application/json; charset=utf-8',
      'cache-control':cache,
      'access-control-allow-origin':'*',
      'x-content-type-options':'nosniff',
      'x-robots-tag':'noindex',
    }
  });
}

export async function serveMobileApi(request: Request): Promise<Response> {
  if(request.method !== 'GET') return json({error:'Method not allowed'},405);
  const url = new URL(request.url);
  const path=url.pathname;
  if(path==='/api/mobile/v1/health'){
    return json({status:'ok',apiVersion:1,application:'Seeparah'});
  }
  const match=/^\/api\/mobile\/v1\/books(?:\/([0-9a-f-]+)(?:\/pages)?)?$/iu.exec(path);
  if(!match) return json({error:'Unknown mobile API path'},404);
  const bookId=match[1];
  if(bookId && !BOOK_ID.test(bookId)) return json({error:'Invalid book ID'},400);
  const isPages=path.endsWith('/pages');
  if(isPages && !bookId) return json({error:'Invalid book ID'},400);

  try {
    if(!bookId){
      let filters: ReturnType<typeof parseMobileListQuery>;
      try {filters=parseMobileListQuery(url.searchParams);}
      catch {return json({error:'Invalid catalogue filters'},400);}
      const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
      const db=supabaseAdmin as any;
      let q=db.from('books').select(CATALOG_FIELDS,{count:'exact'})
        .eq('status','published');
      if(filters.kind==='sacred') q=q.eq('content_classification','religious');
      if(filters.kind==='general') q=q.eq('content_classification','general');
      if(filters.language) q=q.contains('available_languages',[filters.language]);
      if(filters.query) {
        // q only permits text-safe letters/digits/punctuation (never PostgREST
        // filter delimiters such as commas/parentheses/percent/underscores).
        const term=filters.query;
        q=q.or('title.ilike.%'+term+'%,author.ilike.%'+term+'%');
      }
      const offset=(filters.page-1)*MOBILE_PAGE_LIMIT;
      const {data,error,count}=await q
        .order('created_at',{ascending:false})
        .order('id',{ascending:true})
        .range(offset,offset+MOBILE_PAGE_LIMIT-1);
      if(error) throw new Error('Mobile catalogue read failed: '+error.message);
      return json({
        page:filters.page,
        total:count??0,
        hasMore:offset+(data?.length??0)<(count??0),
        books:(data??[]).map((row:PublicRow)=>asMobileBook(row)),
      },200,'public, max-age=30');
    }

    // The existing public projection strips false bibliographic claims.
    const {getPublicBook}=await import('@/lib/public-catalog.server');
    const publicBook=await getPublicBook(bookId);
    if(!publicBook) return json({error:'Book not published or unavailable'},404);
    if(!isPages) return json({book:asMobileBook(publicBook as unknown as PublicRow)},200,'public, max-age=30');

    const offsetRaw=url.searchParams.get('offset')??'0';
    const limitRaw=url.searchParams.get('limit')??String(MOBILE_CONTENT_PAGE_LIMIT);
    const language=url.searchParams.get('language')??publicBook.source_language;
    if(!/^(?:0|[1-9]\d{0,4})$/u.test(offsetRaw) || Number(offsetRaw)>50000 ||
       !/^[1-9]\d?$/u.test(limitRaw) || Number(limitRaw)>MOBILE_CONTENT_PAGE_LIMIT ||
       language.length>100 ||
       !(publicBook.available_languages??[]).includes(language)) {
      return json({error:'Invalid page request or unavailable language'},400);
    }
    const {getReaderBookPayload}=await import('@/lib/reader.server');
    const result=await getReaderBookPayload({bookId,language,userId:null});
    if(result.content.locked){
      return json({error:'Edition is not available for guest readers',
        reason:result.content.reason??'not_available'},403);
    }
    const offset=Number(offsetRaw), limit=Number(limitRaw);
    const all=result.content.chunks;
    return json({
      bookId,language,offset,limit,total:all.length,
      nextOffset:offset+limit<all.length?offset+limit:null,
      typography:result.content.typographyProfile??'standard',
      // Send a TOC only on the first page; avoid duplicate large payloads.
      navigation:offset===0?result.navigation:undefined,
      pages:all.slice(offset,offset+limit).map(
        (chunk)=>({index:chunk.chunkIndex,text:chunk.content})
      ),
    });
  } catch(error){
    // Never expose DB schema, failed privilege checks or internal SQL to apps.
    console.error('[mobile-api] read-only request failed',path,error);
    return json({error:'Seeparah is temporarily unavailable'},503);
  }
}
