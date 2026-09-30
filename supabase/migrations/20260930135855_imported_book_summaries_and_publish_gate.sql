-- Replace acquisition-review placeholders with reader-facing summaries and
-- prevent future publication while that placeholder remains.
begin;

update public.books as b
set description = v.description
from (values
  ('SP-CAND-0001', 'Captain Ahab drives the whaling ship Pequod on an obsessive pursuit of the white whale Moby Dick, drawing his crew into a voyage that explores fate, obsession, nature, knowledge, and the limits of human control.'),
  ('SP-CAND-0005', 'In Verona, Romeo Montague and Juliet Capulet fall in love despite the bitter feud between their families. Their secret marriage and a chain of violence, miscommunication, and haste lead the young lovers toward tragedy.'),
  ('SP-CAND-0006', 'A collection of twelve cases featuring Sherlock Holmes and Dr. John Watson, ranging from mysterious disappearances and coded clues to blackmail and theft, all solved through Holmes''s close observation and deductive reasoning.'),
  ('SP-CAND-0007', 'Jane Eyre recounts her journey from an orphaned and mistreated childhood to independence as a governess, where her relationship with Edward Rochester tests her principles, self-respect, and desire for love.'),
  ('SP-CAND-0008', 'Alice follows a white rabbit into Wonderland, a world of shifting size, strange rules, wordplay, and unforgettable characters. Her encounters turn everyday logic upside down in a playful exploration of identity and imagination.'),
  ('SP-CAND-0009', 'Sisters Elinor and Marianne Dashwood face reduced circumstances, family pressures, and difficult romances. Their contrasting approaches to reason and emotion shape a story about love, judgment, loyalty, and social expectations.'),
  ('SP-CAND-0010', 'London lawyer Gabriel Utterson investigates the disturbing connection between his respected friend Dr. Henry Jekyll and the violent Edward Hyde, uncovering an experiment that exposes the divided impulses within a single human personality.'),
  ('SP-CAND-0016', 'Orphaned Pip receives an unexpected fortune and leaves his modest upbringing to become a gentleman. His changing ambitions and relationships force him to reconsider class, loyalty, gratitude, and what makes a life worthwhile.'),
  ('SP-CAND-0020', 'A Victorian inventor travels far into Earth''s future and encounters the gentle Eloi and subterranean Morlocks. His journey becomes a speculative examination of class division, evolution, technological confidence, and humanity''s distant fate.'),
  ('SP-CAND-0022', 'On Christmas Eve, miserly Ebenezer Scrooge is visited by the ghost of his former partner and three spirits who confront him with his past, present, and possible future, challenging him to change how he treats others.'),
  ('SP-CAND-0024', 'The four March sisters—Meg, Jo, Beth, and Amy—grow toward adulthood while their family faces financial strain and wartime separation. Their ambitions, disagreements, losses, and affections shape a story of family, work, creativity, and maturity.'),
  ('SP-CAND-0028', 'Huckleberry Finn escapes an abusive home and travels down the Mississippi River with Jim, an enslaved man seeking freedom. Their journey mixes adventure and satire while confronting social hypocrisy, prejudice, friendship, and moral choice.'),
  ('SP-CAND-0029', 'John Milton''s epic poem recounts the rebellion and fall of Satan, the creation of the world, and the temptation and fall of Adam and Eve, exploring free will, obedience, ambition, loss, and humanity''s place in a divine order.'),
  ('SP-CAND-0030', 'Ship''s surgeon Lemuel Gulliver voyages to extraordinary societies, including tiny Lilliput, giant Brobdingnag, the speculative island of Laputa, and the land of the Houyhnhnms, in a satire of politics, learning, pride, and human behavior.'),
  ('SP-CAND-0031', 'Orphan Oliver Twist grows up amid a harsh workhouse system before being drawn into London''s criminal underworld. His search for safety and identity exposes poverty, exploitation, corruption, and the possibility of compassion.'),
  ('SP-CAND-0032', 'When technologically advanced Martians invade southern England, an unnamed narrator struggles to survive as familiar social order collapses. The novel combines suspense with reflections on imperialism, evolution, vulnerability, and humanity''s place in nature.'),
  ('SP-CAND-0033', 'Years after being persuaded to reject naval officer Frederick Wentworth, Anne Elliot meets him again when their circumstances have changed. Their renewed acquaintance explores regret, constancy, family pressure, social status, and the possibility of a second chance.'),
  ('SP-CAND-0034', 'Imaginative orphan Anne Shirley is mistakenly sent to live with siblings Marilla and Matthew Cuthbert at Green Gables. Her mistakes, friendships, ambitions, and affection gradually transform both her own life and the community around her.'),
  ('SP-CAND-0035', 'Victor Frankenstein creates a living being and recoils from what he has made. Creator and creature become locked in a cycle of isolation, rejection, revenge, and responsibility that raises enduring questions about ambition and the consequences of creation.'),
  ('SP-CAND-0037', 'Catherine Morland, an enthusiastic reader of Gothic fiction, visits Bath and Northanger Abbey, where imagination leads her to misread people and events. Her experiences form a playful coming-of-age story about reading, judgment, friendship, and romance.'),
  ('SP-CAND-0038', 'Young Jim Hawkins discovers a treasure map and joins a sea voyage to a distant island, where he encounters mutiny, danger, and the charismatic Long John Silver in a classic adventure of courage, greed, and divided loyalties.'),
  ('SP-CAND-0064', 'In the provincial town of Middlemarch, several intertwined lives and marriages unfold around ambitions for reform, scholarship, wealth, and social standing. The novel examines how private choices and social institutions shape one another.'),
  ('SP-CAND-0073', 'Sailor Charles Marlow travels into the Congo to find the ivory agent Kurtz. His journey through the machinery of European colonial exploitation becomes an unsettling meditation on power, violence, moral disorientation, and the stories people tell about civilization.'),
  ('SP-CAND-0075', 'In Puritan New England, Hester Prynne is publicly punished for adultery and forced to wear the scarlet letter. Her life, her daughter Pearl, and the concealed identities around her explore guilt, judgment, secrecy, and individual conscience.'),
  ('SP-CAND-0319', 'Young soldier Henry Fleming enters the American Civil War dreaming of courage, then flees his first major battle. His attempts to understand fear, shame, comradeship, and bravery follow the psychological confusion of a soldier under fire.'),
  ('SP-CAND-0322', 'Buck, a powerful domestic dog, is stolen from California and sold into the harsh world of Klondike sled teams. Survival awakens increasingly wild instincts as he adapts to violence, loyalty, leadership, and the pull of the wilderness.'),
  ('SP-CAND-0328', 'At the isolated estates of Wuthering Heights and Thrushcross Grange, the intense bond between Catherine Earnshaw and Heathcliff shapes two generations. Love, resentment, inheritance, revenge, and social difference drive the families'' intertwined histories.'),
  ('SP-CAND-0337', 'Becky Sharp and Amelia Sedley move through British society during and after the Napoleonic era, pursuing security, love, and status along very different paths. The novel satirizes ambition, vanity, money, reputation, and social performance.'),
  ('SP-CAND-0338', 'David Copperfield narrates his life from childhood hardship through education, work, friendship, love, and authorship. His encounters with a large cast of memorable figures trace a gradual search for maturity, stability, and self-understanding.'),
  ('SP-CAND-0357', 'A young governess caring for two children at a remote country house becomes convinced that supernatural figures threaten them. The story''s deliberate ambiguity leaves open unsettling questions about perception, innocence, secrecy, and psychological fear.'),
  ('SP-CAND-0358', 'After the death of his father, young David Balfour is betrayed by his uncle, kidnapped, and swept into dangerous adventures in eighteenth-century Scotland. His alliance with Alan Breck Stewart turns survival into a struggle for freedom and inheritance.'),
  ('SP-CAND-0364', 'Mole leaves his spring cleaning and discovers life along the river with Rat, Badger, and the impulsive Toad. Their adventures blend friendship, home, nature, mischief, and the consequences of Toad''s fascination with motorcars.')
) as v(import_key, description)
where b.import_key = v.import_key;

do $$
begin
  if exists (
    select 1 from public.books
    where import_key in (
      'SP-CAND-0001','SP-CAND-0005','SP-CAND-0006','SP-CAND-0007','SP-CAND-0008','SP-CAND-0009',
      'SP-CAND-0010','SP-CAND-0016','SP-CAND-0020','SP-CAND-0022','SP-CAND-0024','SP-CAND-0028',
      'SP-CAND-0029','SP-CAND-0030','SP-CAND-0031','SP-CAND-0032','SP-CAND-0033','SP-CAND-0034',
      'SP-CAND-0035','SP-CAND-0037','SP-CAND-0038','SP-CAND-0064','SP-CAND-0073','SP-CAND-0075',
      'SP-CAND-0319','SP-CAND-0322','SP-CAND-0328','SP-CAND-0337','SP-CAND-0338','SP-CAND-0357',
      'SP-CAND-0358','SP-CAND-0364'
    )
      and (
        description is null
        or btrim(description) = ''
        or description ilike '%awaiting Seeparah editorial review before publication%'
      )
  ) then
    raise exception 'Postcondition failed: imported-book placeholder summary remains';
  end if;
end $$;

create or replace function public.check_book_publish_gate()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status = 'published' and (old.status is distinct from 'published') then
    if new.rights_status <> 'approved' then raise exception 'Cannot publish: rights review is not approved'; end if;
    if new.edition_review_status <> 'approved' then raise exception 'Cannot publish: edition quality review is not approved'; end if;
    if new.structure_review_status <> 'approved' then raise exception 'Cannot publish: book structure review is not approved'; end if;
    if new.cleanup_review_status <> 'approved' then raise exception 'Cannot publish: text cleanup review is not approved'; end if;

    if new.description is null
       or length(btrim(new.description)) < 40
       or new.description ilike '%awaiting Seeparah editorial review before publication%'
    then
      raise exception 'Cannot publish: a real reader-facing book summary is required';
    end if;

    if new.rights_basis is null
       or length(btrim(new.rights_basis)) < 20
       or new.rights_basis ~* '\m(pending|do[[:space:]]+not[[:space:]]+approve|not[[:space:]]+verified|awaiting[[:space:]]+rights|rights[[:space:]]+unknown)\M'
    then raise exception 'Cannot publish: rights basis is unresolved or looks like placeholder/review text'; end if;
    if new.rights_evidence_url is null or new.rights_evidence_url !~* '^https?://' then
      raise exception 'Cannot publish: a valid rights evidence URL is required';
    end if;
    if new.edition_title is null or btrim(new.edition_title) = '' then raise exception 'Cannot publish: edition title is required'; end if;
    if new.edition_year is null then raise exception 'Cannot publish: edition year is required'; end if;
    if new.publisher is null or btrim(new.publisher) = '' then raise exception 'Cannot publish: publisher is required'; end if;
    if (new.isbn is null or btrim(new.isbn) = '') and (new.source_scan_id is null or btrim(new.source_scan_id) = '') then
      raise exception 'Cannot publish: ISBN or source edition ID is required';
    end if;
    if new.original_publication_year is null then raise exception 'Cannot publish: original publication year is required'; end if;
    if new.word_count is null or new.word_count <= 0 then raise exception 'Cannot publish: word count must be calculated'; end if;
    if new.estimated_reading_minutes is null or new.estimated_reading_minutes <= 0 then raise exception 'Cannot publish: estimated reading time must be calculated'; end if;

    if new.content_classification = 'religious' then
      if new.source_url is null or new.source_url !~* '^https?://' then
        raise exception 'Cannot publish Religious book: a valid reader-visible authentic source URL is required';
      end if;
      if (new.source_edition_id is null or btrim(new.source_edition_id) = '') and (new.source_scan_id is null or btrim(new.source_scan_id) = '') then
        raise exception 'Cannot publish Religious book: an authentic source edition identifier is required';
      end if;
      if not exists (
        select 1 from public.book_structure_nodes n
        where n.book_id = new.id
          and n.language = new.source_language
          and n.source_version = new.source_version
          and nullif(btrim(coalesce(n.metadata->>'canonical_ref','')), '') is not null
      ) then
        raise exception 'Cannot publish Religious book: canonical reference structure has not been imported';
      end if;
    end if;

    if public.book_has_rights_risk_signal(new.id) and new.rights_risk_acknowledged_at is null then
      raise exception 'Cannot publish: manuscript rights-risk clues have not been reviewed and acknowledged';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.check_book_publish_gate() from public, anon, authenticated;

commit;
