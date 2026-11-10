-- Expand Seeparah's existing admin-managed category vocabulary and classify
-- verified Gutenberg books from Project Gutenberg's actual catalogue subjects.
-- No scripture, reader content, user data or rights status is modified.
-- Generic "Literature" is removed only when a grounded specific topic exists.
-- User/editor-assigned non-generic categories are preserved.

update public.content_settings
set value = '["Religious","Literature","Classics","Fiction","Literary Fiction","Romance","Mystery & Detective","Thriller & Suspense","Adventure","Historical Fiction","Science Fiction","Fantasy","Horror & Gothic","Humor & Satire","Short Stories","Poetry","Drama & Plays","Comics & Graphic Novels","Children & Young Readers","Young Adult","Biography & Memoir","History","Philosophy","Psychology","Personal Development & Self-Improvement","Habits & Productivity","Leadership & Management","Business & Economics","Entrepreneurship","Personal Finance & Investing","Science & Nature","Mathematics & Logic","Technology & Engineering","Medicine & Health","Wellness & Mindfulness","Religion & Spirituality","Politics & Society","Law & Justice","Education & Learning","Essays & Criticism","Travel & Exploration","Nature & Environment","Art & Architecture","Music & Performing Arts","Food & Cooking","Home & Gardening","Sports & Outdoors","Crafts & Hobbies","Parenting & Family","Relationships & Communication","Reference & Language","Cultural Studies","True Crime"]'::jsonb, updated_at=now()
where key='categories';

create or replace function public.seeparah_classify_book_topics(
  p_title text,
  p_subjects text,
  p_existing text[] default '{}'::text[]
) returns text[]
language plpgsql immutable security invoker
set search_path = ''
as $$
declare
  subjects text := lower(coalesce(p_subjects,''));
  title_norm text := lower(coalesce(p_title,''));
  inferred text[] := '{}'::text[];
  existing text[] := coalesce(p_existing,'{}'::text[]);
  categories text[];
  answer text[];
  fiction boolean;
  entry text;
begin
  -- Sacred texts have canonical traditions and explicitly verified taxonomy.
  if 'Religious' = any(existing) then
    return existing;
  end if;
  -- Preserve established labels, but normalize the previous master synonym.
  if 'Self-Development' = any(existing) then
    existing := array_remove(existing,'Self-Development') ||
      array['Personal Development & Self-Improvement'];
  end if;
  fiction := subjects ~ '(fiction|novels|romances|stories --|tales --|drama -- fiction)';

  if subjects ~ '(juvenile|children''s stories|children''s literature|childrens stories|boys --|girls --|school stories)' then
    inferred := array_append(inferred, 'Children & Young Readers');
  end if;
  if subjects ~ '(young adult|teenagers -- fiction|adolescents -- fiction)' then inferred := array_append(inferred, 'Young Adult'); end if;
  if subjects ~ '(historical fiction|history -- fiction|historical romances|historical novels)' then
    inferred := array_append(inferred, 'Historical Fiction');
  end if;
  if subjects ~ '(detective|mystery fiction|mystery stories|crime stories|police -- fiction|private investigators)' then
    inferred := array_append(inferred, 'Mystery & Detective');
  end if;
  if subjects ~ '(thrillers|suspense fiction|spy stories|espionage -- fiction|political thrillers)' then
    inferred := array_append(inferred, 'Thriller & Suspense');
  end if;
  if subjects ~ '(science fiction|space travel -- fiction|time travel -- fiction|utopias -- fiction|dystopias -- fiction)' then
    inferred := array_append(inferred, 'Science Fiction');
  end if;
  if subjects ~ '(fantasy fiction|fairy tales|fairy stories|fantasy literature|magic -- fiction)' then
    inferred := array_append(inferred, 'Fantasy');
  end if;
  if subjects ~ '(gothic fiction|ghost stories|horror tales|horror fiction|vampires -- fiction|supernatural -- fiction)' then
    inferred := array_append(inferred, 'Horror & Gothic');
  end if;
  if subjects ~ '(love stories|romance fiction|romantic fiction|courtship -- fiction|marriage -- fiction|romances --)' then
    inferred := array_append(inferred, 'Romance');
  end if;
  if subjects ~ '(adventure stories|adventure and adventurers -- fiction|sea stories|pirates -- fiction|survival -- fiction|western stories)' then
    inferred := array_append(inferred, 'Adventure');
  end if;
  if subjects ~ '(satire|humorous stories|humor|humour|comic fiction|parodies|wit and humor)' then
    inferred := array_append(inferred, 'Humor & Satire');
  end if;
  if subjects ~ '(short stories|short story|short fiction|short narrative)' then
    inferred := array_append(inferred, 'Short Stories');
  end if;
  if subjects ~ '(poetry|poems|verse|sonnets|ballads|lyric poetry)' then inferred := array_append(inferred, 'Poetry'); end if;
  if subjects ~ '(drama|plays|theater|theatre|tragedies|comedies)' then inferred := array_append(inferred, 'Drama & Plays'); end if;
  if subjects ~ '(graphic novels|comic books|comics)' then inferred := array_append(inferred, 'Comics & Graphic Novels'); end if;

  -- Do not mistake "Conduct of life -- Juvenile fiction" for a self-help book.
  -- Likewise "United States -- History -- Fiction" is historical fiction,
  -- not a nonfiction historical study.
  if not fiction then
    if subjects ~ '(biography|biographies|autobiograph|memoirs|reminiscences|personal narratives)' then
      inferred := array_append(inferred, 'Biography & Memoir');
    end if;
    if subjects ~ '(history|historical accounts|civilization|archaeology)' then
      inferred := array_append(inferred, 'History');
    end if;
    if subjects ~ '(philosophy|ethics|logic -- early works|metaphysics|epistemology|stoicism)' then
      inferred := array_append(inferred, 'Philosophy');
    end if;
    if subjects ~ '(psychology|human behavior|mental processes|unconscious|personality|psychological)' then
      inferred := array_append(inferred, 'Psychology');
    end if;
    if subjects ~ '(self-help|self help|self-improvement|self improvement|personal development|self-culture|character building|conduct of life|personal success|personal efficiency|self-reliance)' then
      inferred := array_append(inferred, 'Personal Development & Self-Improvement');
    end if;
    if subjects ~ '(time management|habits|productivity|personal efficiency)' then
      inferred := array_append(inferred, 'Habits & Productivity');
    end if;
    if subjects ~ '(leadership|management|business administration|executives|organizational behavior)' then
      inferred := array_append(inferred, 'Leadership & Management');
    end if;
    if subjects ~ '(business|economics|political economy|commerce|trade|economic history|industries)' then
      inferred := array_append(inferred, 'Business & Economics');
    end if;
    if subjects ~ '(entrepreneurship|entrepreneurs|small business|business startups)' then
      inferred := array_append(inferred, 'Entrepreneurship');
    end if;
    if subjects ~ '(personal finance|investments|investing|stock exchange|household finance|thrift|savings)' then
      inferred := array_append(inferred, 'Personal Finance & Investing');
    end if;
    if subjects ~ '(natural history|physics|chemistry|biology|geology|botany|zoology|astronomy|science)' then
      inferred := array_append(inferred, 'Science & Nature');
    end if;
    if subjects ~ '(mathematics|algebra|geometry|arithmetic|probability|calculus|mathematical logic)' then
      inferred := array_append(inferred, 'Mathematics & Logic');
    end if;
    if subjects ~ '(technology|engineering|inventions|mechanics|electricity|computers|telegraph|manufacturing)' then
      inferred := array_append(inferred, 'Technology & Engineering');
    end if;
    if subjects ~ '(medicine|medical|anatomy|diseases|public health|pharmacology|nursing|physiology)' then
      inferred := array_append(inferred, 'Medicine & Health');
    end if;
    if subjects ~ '(mindfulness|meditation|wellness|mental health|healthy living|hygiene|exercise)' then
      inferred := array_append(inferred, 'Wellness & Mindfulness');
    end if;
    if subjects ~ '(religion|theology|spiritual life|devotional literature|christian life|buddhism|hinduism|sufism)' then
      inferred := array_append(inferred, 'Religion & Spirituality');
    end if;
    if subjects ~ '(politics|political science|social conditions|sociology|society|social reform|women -- social conditions)' then
      inferred := array_append(inferred, 'Politics & Society');
    end if;
    if subjects ~ '(law|jurisprudence|justice|jurisdiction|criminology|legal history)' then
      inferred := array_append(inferred, 'Law & Justice');
    end if;
    if subjects ~ '(education|teaching|learning|schools|pedagogy|educational psychology)' then
      inferred := array_append(inferred, 'Education & Learning');
    end if;
    if subjects ~ '(essays|literary criticism|criticism and interpretation|book reviews)' then
      inferred := array_append(inferred, 'Essays & Criticism');
    end if;
    if subjects ~ '(travel|voyages|journeys|description and travel|expeditions|exploration)' then
      inferred := array_append(inferred, 'Travel & Exploration');
    end if;
    if subjects ~ '(ecology|environment|conservation|wildlife|forests|plants|natural resources)' then
      inferred := array_append(inferred, 'Nature & Environment');
    end if;
    if subjects ~ '(art|architecture|sculpture|painting|design|drawing)' then
      inferred := array_append(inferred, 'Art & Architecture');
    end if;
    if subjects ~ '(music|musicians|musical|performing arts|opera)' then
      inferred := array_append(inferred, 'Music & Performing Arts');
    end if;
    if subjects ~ '(cooking|cookery|recipes|food preparation|gastronomy)' then
      inferred := array_append(inferred, 'Food & Cooking');
    end if;
    if subjects ~ '(gardening|horticulture|home economics|household|homemaking)' then
      inferred := array_append(inferred, 'Home & Gardening');
    end if;
    if subjects ~ '(sports|athletics|hunting|fishing|mountaineering|camping)' then
      inferred := array_append(inferred, 'Sports & Outdoors');
    end if;
    if subjects ~ '(crafts|needlework|woodwork|handicraft|hobbies)' then
      inferred := array_append(inferred, 'Crafts & Hobbies');
    end if;
    if subjects ~ '(parenting|child rearing|parenthood|family relationships)' then
      inferred := array_append(inferred, 'Parenting & Family');
    end if;
    if subjects ~ '(communication|interpersonal relations|marriage|friendship|social skills)' then
      inferred := array_append(inferred, 'Relationships & Communication');
    end if;
    if subjects ~ '(dictionaries|grammar|encyclopedias|language and languages|linguistics|reference works)' then
      inferred := array_append(inferred, 'Reference & Language');
    end if;
    if subjects ~ '(ethnology|anthropology|folklore|customs|cultural history|civilization)' then
      inferred := array_append(inferred, 'Cultural Studies');
    end if;
    if subjects ~ '(true crime|crime -- history|criminals -- biography|criminal trials)' then
      inferred := array_append(inferred, 'True Crime');
    end if;
  end if;

  if fiction then
    inferred := array_append(inferred, 'Fiction');
    if subjects ~ '(literary fiction|domestic fiction|psychological fiction|social problems -- fiction|bildungsromans)' then
      inferred := array_append(inferred, 'Literary Fiction');
    end if;
  end if;
  -- Preserve a generic category only for records where no verified subject
  -- permits a more useful assignment.
  if cardinality(inferred)>0 then
    existing:=array_remove(existing,'Literature');
  end if;
  categories:=existing||inferred;
  if cardinality(categories)=0 then
    categories:=array['Literature'];
  end if;
  select coalesce(array_agg(value order by earliest),'{}'::text[])
    into answer from (
      select value,min(position) as earliest
      from unnest(categories) with ordinality as x(value,position)
      where nullif(btrim(value),'') is not null
      group by value
    ) deduplicated;
  return answer;
end;
$$;
revoke all on function public.seeparah_classify_book_topics(text,text,text[]) from public,anon,authenticated;
grant execute on function public.seeparah_classify_book_topics(text,text,text[]) to service_role;

-- Apply exact subject-aware categories to the existing Gutenberg corpus,
-- including in-review drafts; never touch sacred works or unrelated authors.
with proposed as (
  select b.id,
    public.seeparah_classify_book_topics(
      b.title,coalesce(j.metadata->>'subjects',''),b.categories
    ) as categories
  from public.books b
  join public.gutenberg_import_jobs j on j.book_id=b.id
  where b.content_classification='general'
    and b.status in ('published','in_review','approved','draft')
)
update public.books b
set categories=p.categories
from proposed p
where b.id=p.id and b.categories is distinct from p.categories;
