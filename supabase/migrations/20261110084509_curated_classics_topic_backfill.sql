-- Human-readable, original-source-ID-specific curation for independently
-- acquired Seeparah classics not represented in the fast-import queue.
-- Enrich only the topic arrays. Preserve all prior editorial tags, rights,
-- text, covers, translation data and sacred collection metadata.
with editorial(source_id,topic_tags) as (
  values
('gutenberg:46',ARRAY['Fiction','Fantasy' ]::text[]),
('gutenberg:19476',ARRAY['Fiction','Science Fiction','Adventure' ]::text[]),
('gutenberg:76',ARRAY['Fiction','Adventure' ]::text[]),
('gutenberg:11',ARRAY['Fiction','Fantasy' ]::text[]),
('gutenberg:3300',ARRAY['Business & Economics' ]::text[]),
('gutenberg:45',ARRAY['Fiction' ]::text[]),
('gutenberg:2432',ARRAY['Fiction','Literary Fiction' ]::text[]),
('gutenberg:271',ARRAY['Fiction','Children & Young Readers' ]::text[]),
('gutenberg:14157',ARRAY['Fiction','Humor & Satire' ]::text[]),
('gutenberg:766',ARRAY['Fiction','Literary Fiction' ]::text[]),
('gutenberg:997',ARRAY['Poetry','Religion & Spirituality' ]::text[]),
('gutenberg:998',ARRAY['Poetry','Religion & Spirituality' ]::text[]),
('gutenberg:999',ARRAY['Poetry','Religion & Spirituality' ]::text[]),
('gutenberg:1906',ARRAY['Fiction','Science Fiction','Humor & Satire' ]::text[]),
('gutenberg:6143',ARRAY['Essays & Criticism' ]::text[]),
('gutenberg:84',ARRAY['Fiction','Science Fiction','Horror & Gothic' ]::text[]),
('gutenberg:829',ARRAY['Fiction','Adventure','Humor & Satire','Fantasy' ]::text[]),
('gutenberg:219',ARRAY['Fiction','Literary Fiction' ]::text[]),
('gutenberg:82',ARRAY['Fiction','Historical Fiction','Adventure','Romance' ]::text[]),
('gutenberg:1260',ARRAY['Fiction','Romance' ]::text[]),
('gutenberg:421',ARRAY['Fiction','Adventure' ]::text[]),
('gutenberg:2166',ARRAY['Fiction','Adventure' ]::text[]),
('gutenberg:796',ARRAY['Fiction','Romance','Historical Fiction' ]::text[]),
('gutenberg:514',ARRAY['Fiction','Children & Young Readers' ]::text[]),
('gutenberg:17983',ARRAY['Fiction','Romance' ]::text[]),
('gutenberg:968',ARRAY['Fiction','Humor & Satire' ]::text[]),
('gutenberg:145',ARRAY['Fiction','Literary Fiction' ]::text[]),
('gutenberg:121',ARRAY['Fiction','Romance' ]::text[]),
('gutenberg:2021',ARRAY['Fiction','Literary Fiction','Adventure' ]::text[]),
('gutenberg:730',ARRAY['Fiction','Literary Fiction' ]::text[]),
('gutenberg:4238',ARRAY['Technology & Engineering','Business & Economics' ]::text[]),
('gutenberg:3747',ARRAY['Poetry','Fantasy','Adventure' ]::text[]),
('gutenberg:20',ARRAY['Poetry' ]::text[]),
('gutenberg:17223',ARRAY['Fiction','Romance' ]::text[]),
('gutenberg:105',ARRAY['Fiction','Romance' ]::text[]),
('gutenberg:652',ARRAY['Fiction','Philosophy' ]::text[]),
('gutenberg:1513',ARRAY['Drama & Plays','Romance' ]::text[]),
('gutenberg:161',ARRAY['Fiction','Romance' ]::text[]),
('gutenberg:4084',ARRAY['Fiction','Adventure','Humor & Satire' ]::text[]),
('gutenberg:1661',ARRAY['Fiction','Mystery & Detective','Short Stories' ]::text[]),
('gutenberg:215',ARRAY['Fiction','Adventure' ]::text[]),
('gutenberg:1951',ARRAY['Fiction','Science Fiction' ]::text[]),
('gutenberg:1026',ARRAY['Fiction','Humor & Satire' ]::text[]),
('gutenberg:575',ARRAY['Essays & Criticism','Philosophy' ]::text[]),
('gutenberg:561',ARRAY['Fiction','Adventure' ]::text[]),
('gutenberg:564',ARRAY['Fiction','Mystery & Detective' ]::text[]),
('gutenberg:1880',ARRAY['Fiction','Adventure' ]::text[]),
('gutenberg:580',ARRAY['Fiction','Humor & Satire' ]::text[]),
('gutenberg:2276',ARRAY['Fiction','Horror & Gothic' ]::text[]),
('gutenberg:73',ARRAY['Fiction','Historical Fiction' ]::text[]),
('gutenberg:25344',ARRAY['Fiction','Historical Fiction' ]::text[]),
('gutenberg:43',ARRAY['Fiction','Horror & Gothic' ]::text[]),
('gutenberg:35',ARRAY['Fiction','Science Fiction' ]::text[]),
('gutenberg:811',ARRAY['Drama & Plays' ]::text[]),
('gutenberg:209',ARRAY['Fiction','Horror & Gothic' ]::text[]),
('gutenberg:555',ARRAY['Fiction','Humor & Satire' ]::text[]),
('gutenberg:36',ARRAY['Fiction','Science Fiction' ]::text[]),
('gutenberg:289',ARRAY['Fiction','Fantasy','Children & Young Readers' ]::text[]),
('gutenberg:12',ARRAY['Fiction','Fantasy','Children & Young Readers' ]::text[]),
('gutenberg:120',ARRAY['Fiction','Adventure' ]::text[]),
('gutenberg:3290',ARRAY['Philosophy','Science & Nature' ]::text[]),
('gutenberg:599',ARRAY['Fiction','Humor & Satire' ]::text[]),
('gutenberg:320',ARRAY['Fiction','Humor & Satire' ]::text[]),
('gutenberg:4791',ARRAY['Fiction','Science Fiction','Adventure' ]::text[]),
('gutenberg:792',ARRAY['Fiction','Horror & Gothic' ]::text[]),
('gutenberg:768',ARRAY['Fiction','Romance','Horror & Gothic' ]::text[])
), proposed as (
  select b.id,
    (select coalesce(array_agg(tag order by first_position),'{}'::text[])
     from (
       select tag,min(ordinality) first_position
       from unnest(b.categories||e.topic_tags)
         with ordinality as u(tag,ordinality)
       where tag is not null and btrim(tag)<>''
       group by tag
     ) ordered)
    as categories
  from public.books b
  join editorial e on e.source_id=b.source_scan_id
  where b.content_classification='general'
    and b.status='published'
    and not exists (select 1 from public.gutenberg_import_jobs j where j.book_id=b.id)
)
update public.books b set categories=p.categories
from proposed p where b.id=p.id and b.categories is distinct from p.categories;
