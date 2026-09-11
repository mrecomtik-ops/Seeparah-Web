create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  author_id uuid,
  cover_url text,
  available_languages text[] not null default '{English}',
  total_chunks int not null default 0,
  source_language text not null default 'English',
  description text not null default '',
  status text not null default 'published',
  access_type text not null default 'free',
  subscription_price_usd numeric(10,2),
  created_at timestamptz not null default now()
);
grant select on public.books to anon;
grant select, insert, update, delete on public.books to authenticated;
grant all on public.books to service_role;
alter table public.books enable row level security;
create policy "Books are publicly readable" on public.books for select to anon, authenticated using (true);
create policy "Authors can publish books" on public.books for insert to authenticated with check (auth.uid() = author_id);
create policy "Authors can update their own books" on public.books for update to authenticated using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy "Authors can delete their own books" on public.books for delete to authenticated using (auth.uid() = author_id);

create table public.book_chunks (
  book_id uuid not null references public.books(id) on delete cascade,
  language text not null,
  chunk_index int not null,
  content text not null,
  primary key (book_id, language, chunk_index)
);
grant select on public.book_chunks to anon;
grant select, insert on public.book_chunks to authenticated;
grant all on public.book_chunks to service_role;
alter table public.book_chunks enable row level security;
create policy "Chunks are publicly readable" on public.book_chunks for select to anon, authenticated using (true);
create policy "Book authors can add chunks" on public.book_chunks for insert to authenticated with check (exists (select 1 from public.books b where b.id = book_id and b.author_id = auth.uid()));

create table public.reading_progress (
  user_id uuid not null,
  book_id uuid not null references public.books(id) on delete cascade,
  language text not null,
  last_chunk_index int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id, language)
);
grant select, insert, update, delete on public.reading_progress to authenticated;
grant all on public.reading_progress to service_role;
alter table public.reading_progress enable row level security;
create policy "Progress is personal" on public.reading_progress for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.book_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  book_id uuid not null references public.books(id) on delete cascade,
  language text not null,
  chunk_index int not null,
  highlight_text text not null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.book_highlights to authenticated;
grant all on public.book_highlights to service_role;
alter table public.book_highlights enable row level security;
create policy "Highlights are personal" on public.book_highlights for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  book_id uuid not null references public.books(id) on delete cascade,
  status text not null default 'active',
  monthly_price_usd numeric(10,2) not null default 0,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  renewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, book_id)
);
grant select, insert, update, delete on public.user_subscriptions to authenticated;
grant all on public.user_subscriptions to service_role;
alter table public.user_subscriptions enable row level security;
create policy "Subscriptions are private" on public.user_subscriptions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into public.books (id, title, author, cover_url, available_languages, total_chunks, source_language, description, access_type, subscription_price_usd) values
('11111111-1111-1111-1111-111111111111', 'Pride and Prejudice', 'Jane Austen', null, '{English,Urdu,Hindi,Arabic,French,German,Spanish,Russian,Chinese,Pashto}', 10, 'English', 'The beloved comedy of manners following Elizabeth Bennet as she navigates society, family, and the proud Mr Darcy. A public-domain classic, translated page by page.', 'free', null),
('22222222-2222-2222-2222-222222222222', 'The Lantern in the Rain', 'Amina Rahman', null, '{English,Urdu,French,Arabic}', 10, 'English', 'A luminous debut novel about a lighthouse keeper''s daughter who finds a mysterious lantern that only glows when it rains. Sample manuscript published through Seeparah.', 'paid', 4.99),
('33333333-3333-3333-3333-333333333333', 'Moby-Dick', 'Herman Melville', null, '{English,French,Spanish}', 4, 'English', 'Captain Ahab''s obsessive hunt for the white whale — one of the great American novels, in the public domain.', 'free', null),
('44444444-4444-4444-4444-444444444444', 'The Prophet', 'Kahlil Gibran', null, '{English,Arabic,Urdu,French}', 4, 'English', 'Twenty-six poetic essays on love, work, freedom and sorrow, spoken by the prophet Almustafa. A public-domain treasure.', 'free', null);

insert into public.book_chunks (book_id, language, chunk_index, content) values
('11111111-1111-1111-1111-111111111111','English',0,'Chapter 1

It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.

However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.'),
('11111111-1111-1111-1111-111111111111','English',1,'"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"

Mr. Bennet replied that he had not.

"But it is," returned she; "for Mrs. Long has just been here, and she told me all about it."

Mr. Bennet made no answer.

"Do you not want to know who has taken it?" cried his wife impatiently.

"You want to tell me, and I have no objection to hearing it."'),
('11111111-1111-1111-1111-111111111111','English',2,'This was invitation enough.

"Why, my dear, you must know, Mrs. Long says that Netherfield is taken by a young man of large fortune from the north of England; that he came down on Monday in a chaise and four to see the place, and was so much delighted with it, that he agreed with Mr. Morris immediately; that he is to take possession before Michaelmas, and some of his servants are to be in the house by the end of next week."'),
('11111111-1111-1111-1111-111111111111','English',3,'"What is his name?"

"Bingley."

"Is he married or single?"

"Oh! Single, my dear, to be sure! A single man of large fortune; four or five thousand a year. What a fine thing for our girls!"

"How so? How can it affect them?"

"My dear Mr. Bennet," replied his wife, "how can you be so tiresome! You must know that I am thinking of his marrying one of them."'),
('11111111-1111-1111-1111-111111111111','English',4,'"Is that his design in settling here?"

"Design! Nonsense, how can you talk so! But it is very likely that he may fall in love with one of them, and therefore you must visit him as soon as he comes."

"I see no occasion for that. You and the girls may go, or you may send them by themselves, which perhaps will be still better, for as you are as handsome as any of them, Mr. Bingley may like you the best of the party."'),
('11111111-1111-1111-1111-111111111111','English',5,'"My dear, you flatter me. I certainly have had my share of beauty, but I do not pretend to be anything extraordinary now. When a woman has five grown-up daughters, she ought to give over thinking of her own beauty."

"In such cases, a woman has not often much beauty to think of."

"But, my dear, you must indeed go and see Mr. Bingley when he comes into the neighbourhood."'),
('11111111-1111-1111-1111-111111111111','English',6,'"It is more than I engage for, I assure you."

"But consider your daughters. Only think what an establishment it would be for one of them. Sir William and Lady Lucas are determined to go, merely on that account, for in general, you know, they visit no newcomers. Indeed you must go, for it will be impossible for us to visit him if you do not."'),
('11111111-1111-1111-1111-111111111111','English',7,'"You are over-scrupulous, surely. I dare say Mr. Bingley will be very glad to see you; and I will send a few lines by you to assure him of my hearty consent to his marrying whichever he chooses of the girls; though I must throw in a good word for my little Lizzy."

"I desire you will do no such thing. Lizzy is not a bit better than the others; and I am sure she is not half so handsome as Jane, nor half so good-humoured as Lydia. But you are always giving her the preference."'),
('11111111-1111-1111-1111-111111111111','English',8,'"They have none of them much to recommend them," replied he; "they are all silly and ignorant like other girls; but Lizzy has something more of quickness than her sisters."

"Mr. Bennet, how can you abuse your own children in such a way? You take delight in vexing me. You have no compassion for my poor nerves."

"You mistake me, my dear. I have a high respect for your nerves. They are my old friends. I have heard you mention them with consideration these last twenty years at least."'),
('11111111-1111-1111-1111-111111111111','English',9,'"Ah, you do not know what I suffer."

"But I hope you will get over it, and live to see many young men of four thousand a year come into the neighbourhood."

"It will be no use to us, if twenty such should come, since you will not visit them."

"Depend upon it, my dear, that when there are twenty, I will visit them all."

Mr. Bennet was so odd a mixture of quick parts, sarcastic humour, reserve, and caprice, that the experience of three-and-twenty years had been insufficient to make his wife understand his character.');

insert into public.book_chunks (book_id, language, chunk_index, content) values
('11111111-1111-1111-1111-111111111111','Urdu',0,'باب اول

یہ ایک مسلمہ حقیقت ہے کہ اچھی دولت کا مالک کنوارا مرد ضرور بیوی چاہتا ہوگا۔

ایسے شخص کے جذبات یا نظریات کتنے ہی پوشیدہ کیوں نہ ہوں، جب وہ کسی محلے میں پہلی بار قدم رکھتا ہے تو یہ حقیقت اردگرد کے خاندانوں کے ذہنوں میں اتنی پککی ہوتی ہے کہ اسے ان کی بیٹیوں میں سے کسی نہ کسی کی جائیداد سمجھا جاتا ہے۔'),
('11111111-1111-1111-1111-111111111111','Hindi',0,'अध्याय १

यह सर्वमान्य सत्य है कि अच्छी संपत्ति वाला अविवाहित पुरुष निश्चय ही पत्नी चाहता होगा।

ऐसे व्यक्ति की भावनाएँ या विचार कितने भी अज्ञात क्यों न हों, जब वह पहली बार किसी मोहल्ले में आता है, तो यह सत्य आसपास के परिवारों के मन में इतना गहरा बैठा होता है कि उसे उनकी बेटियों में से किसी की संपत्ति मान लिया जाता है।'),
('11111111-1111-1111-1111-111111111111','Arabic',0,'الفصل الأول

من الحقائق المسلَّم بها عالميًا أن الرجل الأعزب صاحب الثروة الطائلة لا بد أن يكون باحثًا عن زوجة.

ومهما كانت مشاعر مثل هذا الرجل أو آراؤه مجهولة عند وصوله الأول إلى حيٍّ جديد، فإن هذه الحقيقة راسخة في أذهان العائلات المجاورة لدرجة أنه يُعدّ ملكًا شرعيًا لواحدة أو أخرى من بناتها.'),
('11111111-1111-1111-1111-111111111111','French',0,'Chapitre 1

C''est une vérité universellement reconnue qu''un célibataire pourvu d''une belle fortune doit avoir envie de se marier.

Si peu que l''on connaisse les sentiments ou les vues d''un tel homme à son arrivée dans un voisinage, cette vérité est si bien fixée dans l''esprit des familles d''alentour qu''il est considéré comme la propriété légitime de l''une ou l''autre de leurs filles.'),
('11111111-1111-1111-1111-111111111111','German',0,'Kapitel 1

Es ist eine allgemein anerkannte Wahrheit, dass ein alleinstehender Mann im Besitz eines schönen Vermögens eine Frau suchen muss.

Wie wenig auch immer die Gefühle oder Absichten eines solchen Mannes bekannt sein mögen, wenn er zum ersten Mal eine Nachbarschaft betritt — diese Wahrheit ist in den Köpfen der umliegenden Familien so fest verankert, dass er als rechtmäßiges Eigentum einer ihrer Töchter betrachtet wird.'),
('11111111-1111-1111-1111-111111111111','Spanish',0,'Capítulo 1

Es una verdad universalmente reconocida que un hombre soltero en posesión de una buena fortuna debe necesitar una esposa.

Por poco que se conozcan los sentimientos o las intenciones de tal hombre al llegar por primera vez a un vecindario, esta verdad está tan arraigada en la mente de las familias cercanas que se le considera propiedad legítima de alguna de sus hijas.'),
('11111111-1111-1111-1111-111111111111','Russian',0,'Глава 1

Всем известная истина: молодой человек, располагающий состоянием, должен нуждаться в жене.

Как бы мало ни были известны чувства и намерения такого человека при его первом появлении в округе, эта истина настолько прочно укоренилась в умах окрестных семей, что он считается законной собственностью той или иной из их дочерей.'),
('11111111-1111-1111-1111-111111111111','Chinese',0,'第一章

凡是有钱的单身汉，总想娶位太太，这是一条举世公认的真理。

这样的男人初到某地时，人们纵然对他的性情和见解知之甚少，这条真理也早已在邻里各家人心中根深蒂固，以至于大家都把他看作自己某个女儿应得的一份财产。'),
('11111111-1111-1111-1111-111111111111','Pashto',0,'لومړی څپرکی

دا یوه ټوله منل شوې حقیقت ده چې یو مجرد سړی چې ښه شتمني ولري، باید د ښځې په لټه کې وي.

هرومړي چې داسې سړی لومړی ځل کومې سیمې ته راشي، که چیرې د هغه احساسات یا نظرونه هم ناڅرګنده وي، دا حقیقت د ګاونډیانو کورنیو په ذهنونو کې دومره ټینګه وي چې هغه د دوی د لورونو په یوه یا بله ملکیت ګڼل کېږي.');

insert into public.book_chunks (book_id, language, chunk_index, content) values
('22222222-2222-2222-2222-222222222222','English',0,'Chapter 1 — The Keeper''s Daughter

The rain came to Qamar''s island the way letters come to the lonely: suddenly, and all at once. She stood at the lighthouse door with her father''s oilskin over her shoulders and watched the sea turn the colour of pewter.

Her father had been keeper for thirty-one years. He knew every mood of the water, he liked to say, the way a scholar knows the margins of a favourite book. But he had never seen anything like the lantern.'),
('22222222-2222-2222-2222-222222222222','English',1,'Chapter 2 — What the Tide Brought In

She found it at dawn, half-buried in the wrack line, tangled in kelp the colour of old bottles. A storm lantern of green glass and tarnished brass, quite dry inside though the sea had clearly carried it for miles.

Qamar turned it over in her hands. There was no maker''s mark, only a line of tiny script around the base, worn almost smooth: Light me when it rains, and I will show you what the water remembers.'),
('22222222-2222-2222-2222-222222222222','English',2,'Chapter 3 — The First Lighting

She waited three weeks. The island went dry, the cistern sank, her father complained about the dust in the logbooks. Then, one October night, the sky opened.

Qamar struck a match with shaking hands. The wick caught — and the flame was not gold but green, a deep underwater green, and in its light the rain on the windows turned to handwriting. Hundreds of tiny letters, running down the glass like a letter being written very fast.'),
('22222222-2222-2222-2222-222222222222','English',3,'Chapter 4 — The Language of Water

It took her a month to learn to read the rain. The writing on the glass was not any alphabet she knew, but the lantern was patient. Night after night it showed her the same shapes until they settled into meaning the way stones settle into a riverbed.

The water remembered ships. That was the first thing she understood. Every wreck within a hundred miles of the island was written down somewhere in the rain, and the lantern had been keeping the accounts.'),
('22222222-2222-2222-2222-222222222222','English',4,'Chapter 5 — Her Father''s Secret

She should have told him. She knew that even then. But her father had begun to talk of retiring to the mainland, of leaving the light to a keeper from the shipping authority, and Qamar could not bear to give him a reason to stay that was also a reason to worry.

So she kept the lantern in the boathouse, under a sailcloth, and lit it only when he was asleep and the rain was loud enough to cover her footsteps.'),
('22222222-2222-2222-2222-222222222222','English',5,'Chapter 6 — The Name in the Rain

On the first night of the winter storms, the rain wrote her own name.

Qamar stood very still while the letters spelled it out against the dark, again and again, patient as a tide. Beneath her name the rain wrote a date — a date three weeks in the future — and beneath the date, a single word she had learned early, because the water used it often: wreck.'),
('22222222-2222-2222-2222-222222222222','English',6,'Chapter 7 — Twenty-One Days

She had twenty-one days to understand why the water had written her name beside a sinking.

Her father noticed she was not sleeping. He made her the cardamom tea her mother used to make and did not ask questions, which was his way of asking. Qamar almost told him then, over the steaming cups, while the lighthouse lamp turned above them like a slow, patient star.'),
('22222222-2222-2222-2222-222222222222','English',7,'Chapter 8 — What the Lantern Wanted

The night before the date, the rain came down harder than she had ever known it, and the lantern burned so brightly the boathouse glowed like a green coal.

On the glass the water wrote a ship''s name — the Gulshan, a coastal steamer — and a position twelve miles north-east of the island. And then, in letters that ran and blurred and rewrote themselves, it wrote the one thing Qamar had not dared to guess: You are the only light it will see.'),
('22222222-2222-2222-2222-222222222222','English',8,'Chapter 9 — The Night of the Gulshan

They never found the official log of that night, because her father tore the pages out and burned them. What is known is this: the lighthouse''s great lamp failed at midnight, and some other light — green, impossible, low to the water — burned in its place until dawn.

The Gulshan came safe into harbour with all souls. The captain swore to his dying day that he had followed a lantern carried along the shore by a girl who walked on the rain.'),
('22222222-2222-2222-2222-222222222222','English',9,'Chapter 10 — Keeper of Two Lights

In the spring, her father signed the retirement papers, and the shipping authority sent a letter asking who would take over the light.

Qamar wrote back in her careful hand: The keeper''s daughter. She has kept two lights for a year already.

The lantern sits on her desk to this day. It only glows when it rains. But on this island, the rain comes the way letters come to the lonely — suddenly, and all at once, and always when it is needed most.');

insert into public.book_chunks (book_id, language, chunk_index, content) values
('22222222-2222-2222-2222-222222222222','Urdu',0,'باب اول — چراغاں رکھنے والے کی بیٹی

بارش قمر کے جزیرے پر اس طرح آئی جیسے خط تنہا لوگوں کے پاس آتے ہیں: اچانک، اور سب ایک دم۔ وہ چراغ گھر کے دروازے پر اپنے والد کی تیل چڑھا چادر اوڑھے کھڑی تھی اور سمندر کو سسے جیسا رنگ لیتے دیکھ رہی تھی۔

اس کے والد اکتیس سال سے رکھوالے تھے۔ وہ پانی کے ہر مزاج کو جانتے تھے، جیسے کوئی عالم اپنے پسندیدہ کتاب کے حاشیے جانتا ہے۔ مگر انہوں نے اس لالٹین جیسی چیز کبھی نہیں دیکھی تھی۔'),
('22222222-2222-2222-2222-222222222222','French',0,'Chapitre 1 — La fille du gardien

La pluie arriva sur l''île de Qamar comme les lettres arrivent aux gens seuls : soudainement, et tout à la fois. Elle se tenait à la porte du phare, la ciré de son père sur les épaules, et regardait la mer prendre la couleur de l''étain.

Son père était gardien depuis trente et un ans. Il connaissait chaque humeur de l''eau, aimait-il dire, comme un érudit connaît les marges d''un livre favori. Mais il n''avait jamais rien vu de tel que la lanterne.'),
('22222222-2222-2222-2222-222222222222','Arabic',0,'الفصل الأول — ابنة حارس المنارة

جاء المطر إلى جزيرة قمر كما تأتي الرسائل إلى الوحيدين: فجأة، ودفعة واحدة. وقفت عند باب المنارة وعلى كتفيها معطف أبيها المشمّع، تراقب البحر وهو يتحول إلى لون القصدير.

كان والدها حارسًا للمنارة منذ إحدى وثلاثين سنة. كان يعرف كل مزاج للماء، كما كان يحب أن يقول، كما يعرف عالِمٌ هوامش كتابه المفضل. لكنه لم يرَ قط شيئًا كالفانوس.');

insert into public.book_chunks (book_id, language, chunk_index, content) values
('33333333-3333-3333-3333-333333333333','English',0,'Chapter 1 — Loomings

Call me Ishmael. Some years ago — never mind how long precisely — having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.'),
('33333333-3333-3333-3333-333333333333','English',1,'It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul — then, I account it high time to get to sea as soon as I can.'),
('33333333-3333-3333-3333-333333333333','English',2,'There is nothing surprising in this. If they but knew it, almost all men in their degree, some time or other, cherish very nearly the same feelings towards the ocean with me.'),
('33333333-3333-3333-3333-333333333333','English',3,'There now is your insular city of the Manhattoes, belted round by wharves as Indian isles by coral reefs — commerce surrounds it with her surf. Right and left, the streets take you waterward.'),
('44444444-4444-4444-4444-444444444444','English',0,'On Love

Then said Almitra, Speak to us of Love.

And he raised his head and looked upon the people, and there fell a stillness upon them. And with a great voice he said:

When love beckons to you, follow him, though his ways are hard and steep.'),
('44444444-4444-4444-4444-444444444444','English',1,'And when his wings enfold you yield to him, though the sword hidden among his pinions may wound you.

And when he speaks to you believe in him, though his voice may shatter your dreams as the north wind lays waste the garden.'),
('44444444-4444-4444-4444-444444444444','English',2,'For even as love crowns you so shall he crucify you. Even as he is for your growth so is he for your pruning.

Even as he ascends to your height and caresses your tenderest branches that quiver in the sun, so shall he descend to your roots and shake them in their clinging to the earth.'),
('44444444-4444-4444-4444-444444444444','English',3,'On Work

Then a ploughman said, Speak to us of Work.

And he answered, saying:

You work that you may keep pace with the earth and the soul of the earth. For to be idle is to become a stranger unto the seasons, and to step out of life''s procession.');