-- Reverts only our exact URLs; does not erase later reviewed replacements.
BEGIN;
UPDATE public.books b SET cover_url=NULL FROM (VALUES
('SP-CAND-0058','A Honeymoon in Space','George Chetwynd Griffith','gutenberg:19476','https://seeparah.com/book-covers/premium-42/SP-CAND-0058_a-honeymoon-in-space.webp'),
('SP-CAND-0074','An Inquiry into the Nature and Causes of the Wealth of Nations','ADAM SMITH','gutenberg:3300','https://seeparah.com/book-covers/premium-42/SP-CAND-0074_an-inquiry-into-the-nature-and-causes-of-the-wealth-of-nations.webp'),
('SP-CAND-0333','Barchester Towers','Anthony Trollope','gutenberg:2432','https://seeparah.com/book-covers/premium-42/SP-CAND-0333_barchester-towers.webp'),
('SP-CAND-0320','Black Beauty','Anna Sewell','gutenberg:271','https://seeparah.com/book-covers/premium-42/SP-CAND-0320_black-beauty.webp'),
('SP-CAND-0229','Bouvard et Pécuchet','Gustave Flaubert','gutenberg:14157','https://seeparah.com/book-covers/premium-42/SP-CAND-0229_bouvard-et-pecuchet.webp'),
('SP-CAND-0306','Divina Commedia di Dante: Inferno','Dante Alighieri','gutenberg:997','https://seeparah.com/book-covers/premium-42/SP-CAND-0306_divina-commedia-di-dante-inferno.webp'),
('SP-CAND-0308','Divina Commedia di Dante: Paradiso','Dante Alighieri','gutenberg:999','https://seeparah.com/book-covers/premium-42/SP-CAND-0308_divina-commedia-di-dante-paradiso.webp'),
('SP-CAND-0307','Divina Commedia di Dante: Purgatorio','Dante Alighieri','gutenberg:998','https://seeparah.com/book-covers/premium-42/SP-CAND-0307_divina-commedia-di-dante-purgatorio.webp'),
('SP-CAND-0411','Erewhon; Or, Over the Range','Samuel Butler','gutenberg:1906','https://seeparah.com/book-covers/premium-42/SP-CAND-0411_erewhon-or-over-the-range.webp'),
('SP-CAND-0183','Essays on Work and Culture','Hamilton Wright Mabie','gutenberg:6143','https://seeparah.com/book-covers/premium-42/SP-CAND-0183_essays-on-work-and-culture.webp'),
('SP-CAND-0399','Ivanhoe: A Romance','Sir Walter Scott','gutenberg:82','https://seeparah.com/book-covers/premium-42/SP-CAND-0399_ivanhoe-a-romance.webp'),
('SP-CAND-0360','King Solomon''s Mines','H. Rider Haggard','gutenberg:2166','https://seeparah.com/book-covers/premium-42/SP-CAND-0360_king-solomon-s-mines.webp'),
('SP-CAND-0226','La Chartreuse De Parme','Stendhal','gutenberg:796','https://seeparah.com/book-covers/premium-42/SP-CAND-0226_la-chartreuse-de-parme.webp'),
('SP-CAND-0059','Manon Lescaut','Abbé Prévost','gutenberg:17983','https://seeparah.com/book-covers/premium-42/SP-CAND-0059_manon-lescaut.webp'),
('SP-CAND-0329','Martin Chuzzlewit','Charles Dickens','gutenberg:968','https://seeparah.com/book-covers/premium-42/SP-CAND-0329_martin-chuzzlewit.webp'),
('SP-CAND-0413','Nostromo: A Tale of the Seaboard','Joseph Conrad','gutenberg:2021','https://seeparah.com/book-covers/premium-42/SP-CAND-0413_nostromo-a-tale-of-the-seaboard.webp'),
('SP-CAND-0125','On the Economy of Machinery and Manufactures','Charles Babbage','gutenberg:4238','https://seeparah.com/book-covers/premium-42/SP-CAND-0125_on-the-economy-of-machinery-and-manufactures.webp'),
('SP-CAND-0304','Orlando Furioso','Ludovico Ariosto','gutenberg:3747','https://seeparah.com/book-covers/premium-42/SP-CAND-0304_orlando-furioso.webp'),
('SP-CAND-0280','Pepita Jiménez','Juan Valera','gutenberg:17223','https://seeparah.com/book-covers/premium-42/SP-CAND-0280_pepita-jimenez.webp'),
('SP-CAND-0405','Rasselas, Prince of Abyssinia','Samuel Johnson','gutenberg:652','https://seeparah.com/book-covers/premium-42/SP-CAND-0405_rasselas-prince-of-abyssinia.webp'),
('SP-CAND-0419','The Adventures of Peregrine Pickle','Tobias Smollett','gutenberg:4084','https://seeparah.com/book-covers/premium-42/SP-CAND-0419_the-adventures-of-peregrine-pickle.webp'),
('SP-CAND-0383','The Coming Race','Edward Bulwer-Lytton','gutenberg:1951','https://seeparah.com/book-covers/premium-42/SP-CAND-0383_the-coming-race.webp'),
('SP-CAND-0408','The Diary of a Nobody','George & Weedon Grossmith','gutenberg:1026','https://seeparah.com/book-covers/premium-42/SP-CAND-0408_the-diary-of-a-nobody.webp'),
('SP-CAND-0163','The Essays or Counsels, Civil and Moral','Francis Bacon','gutenberg:575','https://seeparah.com/book-covers/premium-42/SP-CAND-0163_the-essays-or-counsels-civil-and-moral.webp'),
('SP-CAND-0323','The Further Adventures of Robinson Crusoe','Daniel Defoe','gutenberg:561','https://seeparah.com/book-covers/premium-42/SP-CAND-0323_the-further-adventures-of-robinson-crusoe.webp'),
('SP-CAND-0063','The Mystery of Edwin Drood','Charles Dickens','gutenberg:564','https://seeparah.com/book-covers/premium-42/SP-CAND-0063_the-mystery-of-edwin-drood.webp'),
('SP-CAND-0385','The Pathfinder; Or, The Inland Sea','James Fenimore Cooper','gutenberg:1880','https://seeparah.com/book-covers/premium-42/SP-CAND-0385_the-pathfinder-or-the-inland-sea.webp'),
('SP-CAND-0327','The Pickwick Papers','Charles Dickens','gutenberg:580','https://seeparah.com/book-covers/premium-42/SP-CAND-0327_the-pickwick-papers.webp'),
('SP-CAND-0415','The Private Memoirs and Confessions of a Justified Sinner','James Hogg','gutenberg:2276','https://seeparah.com/book-covers/premium-42/SP-CAND-0415_the-private-memoirs-and-confessions-of-a-justified-sinner.webp'),
('SP-CAND-0387','The Tragical History of Doctor Faustus From the Quarto of 1616','Christopher Marlowe','gutenberg:811','https://seeparah.com/book-covers/premium-42/SP-CAND-0387_the-tragical-history-of-doctor-faustus-from-the-quarto-of-1616.webp'),
('SP-CAND-0404','The Unbearable Bassington','Saki','gutenberg:555','https://seeparah.com/book-covers/premium-42/SP-CAND-0404_the-unbearable-bassington.webp'),
('SP-CAND-0353','Through the Looking-Glass','Lewis Carroll','gutenberg:12','https://seeparah.com/book-covers/premium-42/SP-CAND-0353_through-the-looking-glass.webp'),
('SP-CAND-0069','Under the Red Dragon','James Grant','gutenberg:53874','https://seeparah.com/book-covers/premium-42/SP-CAND-0069_under-the-red-dragon.webp'),
('SP-CAND-0167','Valerius Terminus: Of the Interpretation of Nature','Francis Bacon','gutenberg:3290','https://seeparah.com/book-covers/premium-42/SP-CAND-0167_valerius-terminus-of-the-interpretation-of-nature.webp'),
('SP-CAND-0281','Vida de Lazarillo de Tormes y de sus fortunas y adversidades','Anónimo','gutenberg:320','https://seeparah.com/book-covers/premium-42/SP-CAND-0281_vida-de-lazarillo-de-tormes-y-de-sus-fortunas-y-adversidades.webp'),
('SP-CAND-0246','Voyage au Centre de la Terre','Jules Verne','gutenberg:4791','https://seeparah.com/book-covers/premium-42/SP-CAND-0246_voyage-au-centre-de-la-terre.webp'),
('SP-CAND-0407','Wieland; Or, The Transformation: An American Tale','Charles Brockden Brown','gutenberg:792','https://seeparah.com/book-covers/premium-42/SP-CAND-0407_wieland-or-the-transformation-an-american-tale.webp')
) AS t(import_key,title,author,source_id,url) WHERE b.import_key=t.import_key AND b.cover_url=t.url;
UPDATE public.books b SET cover_url=NULL FROM (VALUES
('e0c836a6-6d04-5914-9196-aeb9871776e9','Bhagavad Gita','Sanskrit','gita-gita-sanskrit-c6fce3959544','gita-gita-sanskrit-c6fce3959544','https://seeparah.com/book-covers/premium-42/sacred/sacred-bhagavad-gita-sanskrit.webp'),
('83acc105-30e9-58f5-9db4-8bcc35b7ab4b','Dao De Jing — Wang Bi Commentary','Chinese','zh-wikisource-wangbi-dao-de-jing-rev2354026','zh-wikisource-wangbi-dao-de-jing-rev2354026','https://seeparah.com/book-covers/premium-42/sacred/sacred-dao-de-jing-wang-bi-chinese.webp'),
('3e2c1103-36a9-5a44-987c-259d27dea072','Dhammapada','Pali','suttacentral-bilara-dhp-06ab1b50b259','bilara-root-pli-ms-dhp','https://seeparah.com/book-covers/premium-42/sacred/sacred-dhammapada-pali.webp'),
('85eb2806-8964-5fb7-9236-0f8ac79a4ca2','禮記 (Li Ji — Book of Rites)','Chinese','gutenberg:liji:24048','gutenberg:liji:24048','https://seeparah.com/book-covers/premium-42/sacred/sacred-li-ji-chinese.webp')
) AS t(book_id,title,language,book_source_id,edition_source_id,url) WHERE b.id=t.book_id::uuid AND b.cover_url=t.url;
UPDATE public.book_editions e SET cover_url=NULL,cover_attribution=NULL,cover_shared_artwork=false
FROM (VALUES
('e0c836a6-6d04-5914-9196-aeb9871776e9','Bhagavad Gita','Sanskrit','gita-gita-sanskrit-c6fce3959544','gita-gita-sanskrit-c6fce3959544','https://seeparah.com/book-covers/premium-42/sacred/sacred-bhagavad-gita-sanskrit.webp'),
('83acc105-30e9-58f5-9db4-8bcc35b7ab4b','Dao De Jing — Wang Bi Commentary','Chinese','zh-wikisource-wangbi-dao-de-jing-rev2354026','zh-wikisource-wangbi-dao-de-jing-rev2354026','https://seeparah.com/book-covers/premium-42/sacred/sacred-dao-de-jing-wang-bi-chinese.webp'),
('3e2c1103-36a9-5a44-987c-259d27dea072','Dhammapada','Pali','suttacentral-bilara-dhp-06ab1b50b259','bilara-root-pli-ms-dhp','https://seeparah.com/book-covers/premium-42/sacred/sacred-dhammapada-pali.webp'),
('85eb2806-8964-5fb7-9236-0f8ac79a4ca2','禮記 (Li Ji — Book of Rites)','Chinese','gutenberg:liji:24048','gutenberg:liji:24048','https://seeparah.com/book-covers/premium-42/sacred/sacred-li-ji-chinese.webp')
) AS t(book_id,title,language,book_source_id,edition_source_id,url) WHERE e.book_id=t.book_id::uuid AND e.language=t.language AND e.source_edition_id=t.edition_source_id AND e.cover_url=t.url;
COMMIT;
