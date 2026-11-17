import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';
import 'local_library.dart';
import 'models.dart' as sp;
import 'reader.dart';

const brandGreen=Color(0xFF174F41);
const brandGold=Color(0xFFB48A49);
const canvas=Color(0xFFFAF8F1);

Future<void> openOfficialLink(String raw)async{
  final u=Uri.tryParse(raw);
  if(u==null||u.scheme!='https')return;
  await launchUrl(u,mode:LaunchMode.externalApplication);
}
String oneLine(String value)=>value.replaceAll(RegExp(r'\s+'),' ').trim();

class HomeShell extends StatefulWidget {
  const HomeShell({super.key,required this.api,required this.library});
  final SeeparahApi api;
  final LocalLibrary library;
  @override State<HomeShell> createState()=>_HomeShellState();
}

class _HomeShellState extends State<HomeShell>{
  int selected=0;
  static const titles=['Discover','Sacred texts','My library','Settings'];
  static const icons=[Icons.auto_stories_outlined,Icons.menu_book_outlined,
    Icons.bookmark_border,Icons.tune];
  @override Widget build(BuildContext context){
    final tabs=[
      CatalogueView(api:widget.api,library:widget.library,kind:'all'),
      CatalogueView(api:widget.api,library:widget.library,kind:'sacred'),
      SavedView(api:widget.api,library:widget.library),
      SettingsView(library:widget.library),
    ];
    final wide=MediaQuery.sizeOf(context).width>=900;
    final view=IndexedStack(index:selected,children:tabs);
    return Scaffold(
      appBar:AppBar(
        title:Row(mainAxisSize:MainAxisSize.min,children:[
          Image.asset('assets/brand/favicon.png',width:36,height:36,
            semanticLabel:'Seeparah logo'),
          const SizedBox(width:9),
          const Text('Seeparah',style:TextStyle(fontFamily:'serif',
            fontSize:25,fontWeight:FontWeight.w700,color:brandGreen)),
          if(wide)...[const SizedBox(width:16),const Text('READ FREELY',
            style:TextStyle(fontSize:10,letterSpacing:2,color:brandGold))],
        ]),
        actions:[IconButton(tooltip:'About Seeparah',icon:const Icon(Icons.info_outline),
          onPressed:()=>showAboutDialog(context:context,
            applicationName:'Seeparah',applicationVersion:'1.0.0',
            applicationLegalese:'A free multilingual reading library.'))],
      ),
      body:SafeArea(child:wide?Row(children:[
        NavigationRail(
          extended:true,selectedIndex:selected,
          onDestinationSelected:(i)=>setState(()=>selected=i),
          indicatorColor:const Color(0xFFE3EBE3),
          destinations:List.generate(4,(i)=>NavigationRailDestination(
            icon:Icon(icons[i]),label:Text(titles[i]),
          )),
        ),
        const VerticalDivider(width:1),
        Expanded(child:view),
      ]):view),
      bottomNavigationBar:wide?null:NavigationBar(
        selectedIndex:selected,onDestinationSelected:(i)=>setState(()=>selected=i),
        height:70,
        destinations:List.generate(4,(i)=>NavigationDestination(
          icon:Icon(icons[i]),label:titles[i],
        )),
      ),
    );
  }
}

class CatalogueView extends StatefulWidget {
  const CatalogueView({super.key,required this.api,required this.library,
    required this.kind});
  final SeeparahApi api;
  final LocalLibrary library;
  final String kind;
  @override State<CatalogueView> createState()=>_CatalogueViewState();
}

class _CatalogueViewState extends State<CatalogueView>{
  final search=TextEditingController();
  final scroll=ScrollController();
  final books=<sp.Book>[];
  bool loading=false,hasMore=true;
  String? error;
  String language='';
  int page=0,requestId=0;
  @override void initState(){
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {if(mounted)load(reset:true);});
    scroll.addListener((){
      if(scroll.hasClients &&
         scroll.position.pixels>=scroll.position.maxScrollExtent-450 &&
         !loading&&hasMore)load();
    });
  }
  @override void dispose(){search.dispose();scroll.dispose();super.dispose();}

  Future<void> load({bool reset=false})async{
    if(reset){
      requestId++;
      setState((){books.clear();page=0;hasMore=true;error=null;loading=false;});
    }
    if(loading||!hasMore)return;
    final active=requestId;
    setState(()=>loading=true);
    try{
      final result=await widget.api.list(page:page+1,
        kind:widget.kind,query:search.text.trim(),language:language);
      if(!mounted||active!=requestId)return;
      setState((){
        books.addAll(result.books);page=result.page;
        hasMore=result.hasMore;error=null;
      });
    }catch(e){
      if(mounted&&active==requestId)setState(()=>error=e.toString());
    }finally{
      if(mounted&&active==requestId)setState(()=>loading=false);
    }
  }
  Future<void> openBook(sp.Book book)async{
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder:(_)=>BookDetail(api:widget.api,library:widget.library,initial:book)));
    if(mounted)setState((){});
  }

  @override Widget build(BuildContext context){
    final sacred=widget.kind=='sacred';
    final title=sacred?'Sacred texts':'A world of stories';
    final subtitle=sacred
      ?'Read verified source editions across traditions.'
      :'Explore classics and original-language literature, completely free.';
    final languages=['','English','Urdu','Arabic','Hindi','German',
      'French','Chinese','Spanish','Hebrew','Greek','Pali'];
    return Center(child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:1260),
      child:CustomScrollView(controller:scroll,slivers:[
        SliverPadding(padding:const EdgeInsets.fromLTRB(20,18,20,8),
          sliver:SliverToBoxAdapter(child:Column(
            crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text(sacred?'SACRED LIBRARY':'THE SEEPARAH LIBRARY',
                style:const TextStyle(fontSize:11,fontWeight:FontWeight.w700,
                  color:brandGold,letterSpacing:2)),
              const SizedBox(height:8),
              Text(title,style:Theme.of(context).textTheme.headlineMedium?.copyWith(
                color:brandGreen,fontFamily:'serif',fontWeight:FontWeight.w700)),
              const SizedBox(height:6),
              Text(subtitle,style:TextStyle(color:Colors.grey.shade700)),
              const SizedBox(height:20),
              Row(children:[
                Expanded(child:TextField(
                  controller:search,textInputAction:TextInputAction.search,
                  onSubmitted:(_)=>load(reset:true),
                  decoration:InputDecoration(
                    prefixIcon:const Icon(Icons.search),
                    hintText:'Search by title or author',
                    filled:true,fillColor:Colors.white,
                    border:OutlineInputBorder(borderRadius:BorderRadius.circular(16)),
                    suffixIcon:IconButton(tooltip:'Search',
                      icon:const Icon(Icons.arrow_forward),
                      onPressed:()=>load(reset:true)),
                  ),
                )),
              ]),
              const SizedBox(height:10),
              Wrap(spacing:8,runSpacing:8,children:[
                FilterChip(
                  label:Text(language.isEmpty?'All languages':language),
                  selected:language.isNotEmpty,
                  onSelected:(_)async{
                    final picked=await showModalBottomSheet<String>(context:context,
                      builder:(ctx)=>SafeArea(child:ListView(
                        shrinkWrap:true,children:languages.map((name)=>ListTile(
                          title:Text(name.isEmpty?'All languages':name),
                          trailing:name==language?const Icon(Icons.check):null,
                          onTap:()=>Navigator.pop(ctx,name),
                        )).toList())));
                    if(picked!=null&&picked!=language){language=picked;load(reset:true);}
                  }),
                if(search.text.trim().isNotEmpty)
                  ActionChip(label:const Text('Clear search'),avatar:const Icon(Icons.close,size:16),
                    onPressed:(){search.clear();load(reset:true);}),
              ]),
            ]))),
        ),
        if(books.isNotEmpty)
          SliverPadding(padding:const EdgeInsets.fromLTRB(16,8,16,12),
            sliver:SliverLayoutBuilder(builder:(ctx,constraints){
              final width=constraints.crossAxisExtent;
              final columns=(width/315).floor().clamp(1,4);
              return SliverGrid(
                gridDelegate:SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount:columns,mainAxisExtent:180,
                  mainAxisSpacing:12,crossAxisSpacing:12),
                delegate:SliverChildBuilderDelegate(
                  (ctx,i)=>BookCard(book:books[i],library:widget.library,
                    onTap:()=>openBook(books[i])),
                  childCount:books.length,
                ),
              );
            }),
          ),
        SliverToBoxAdapter(child:Padding(
          padding:const EdgeInsets.fromLTRB(24,8,24,28),
          child:Column(children:[
            if(loading)const CircularProgressIndicator(),
            if(error!=null)...[
              Text(error!,textAlign:TextAlign.center,
                style:const TextStyle(color:Colors.redAccent)),
              const SizedBox(height:8),
              OutlinedButton.icon(onPressed:()=>load(),
                icon:const Icon(Icons.refresh),label:const Text('Retry')),
            ],
            if(!loading&&error==null&&books.isEmpty)
              const Padding(padding:EdgeInsets.all(24),
                child:Text('No published titles match this search.')),
            if(!loading&&hasMore&&books.isNotEmpty)
              OutlinedButton(onPressed:()=>load(),child:const Text('Load more books')),
          ]),
        )),
      ])));
  }
}

class BookCard extends StatefulWidget{
  const BookCard({super.key,required this.book,required this.library,required this.onTap});
  final sp.Book book;
  final LocalLibrary library;
  final VoidCallback onTap;
  @override State<BookCard> createState()=>_BookCardState();
}
class _BookCardState extends State<BookCard>{
  @override Widget build(BuildContext context){
    final b=widget.book;
    final cover=b.coverUrl;
    return Card(clipBehavior:Clip.antiAlias,child:InkWell(
      onTap:widget.onTap,
      child:Padding(padding:const EdgeInsets.all(12),child:Row(children:[
        SizedBox(width:94,height:140,child:DecoratedBox(
          decoration:BoxDecoration(color:const Color(0xFFE1ECE5),
            borderRadius:BorderRadius.circular(8)),
          child:cover!=null&&Uri.tryParse(cover)?.scheme=='https'
            ?ClipRRect(borderRadius:BorderRadius.circular(8),
                child:Image.network(cover,fit:BoxFit.cover,
                  errorBuilder:(_,__,___)=>const Icon(Icons.auto_stories,
                    color:brandGreen,size:40)))
            :const Icon(Icons.auto_stories,color:brandGreen,size:40))),
        const SizedBox(width:12),
        Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text(b.sacred?'SACRED TEXT':'BOOK',style:const TextStyle(
            fontSize:10,color:brandGold,fontWeight:FontWeight.w800,letterSpacing:1.4)),
          const SizedBox(height:6),
          Text(b.title,maxLines:3,overflow:TextOverflow.ellipsis,
            style:const TextStyle(fontFamily:'serif',fontWeight:FontWeight.w700,
              color:brandGreen,fontSize:17,height:1.13)),
          const SizedBox(height:6),
          Text(sp.displayAuthor(b.author),maxLines:1,
            overflow:TextOverflow.ellipsis,
            style:TextStyle(color:Colors.grey.shade700,fontSize:12)),
          const Spacer(),
          Row(children:[
            Expanded(child:Text(b.language,maxLines:1,
              overflow:TextOverflow.ellipsis,
              style:const TextStyle(fontSize:11,color:brandGold))),
            IconButton(tooltip:widget.library.starred(b.id)
              ?'Remove favorite':'Save to favorites',
              visualDensity:VisualDensity.compact,
              icon:Icon(widget.library.starred(b.id)?Icons.bookmark:Icons.bookmark_border,
                color:brandGreen),
              onPressed:()async{
                await widget.library.star(b,!widget.library.starred(b.id));
                if(mounted)setState((){});
              }),
          ]),
        ])),
      ]))),
    );
  }
}

class SavedView extends StatefulWidget{
  const SavedView({super.key,required this.api,required this.library});
  final SeeparahApi api;
  final LocalLibrary library;
  @override State<SavedView> createState()=>_SavedViewState();
}
class _SavedViewState extends State<SavedView>{
  @override Widget build(BuildContext context){
    final ids=<String>{
      ...widget.library.favorites,
      ...widget.library.downloaded.map((x)=>x.split('|').first),
    };
    final books=ids.map(widget.library.remembered)
      .whereType<sp.Book>().toList();
    return Center(child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:1000),
      child:ListView(padding:const EdgeInsets.all(20),children:[
        Text('My library',style:Theme.of(context).textTheme.headlineMedium?.copyWith(
          color:brandGreen,fontFamily:'serif')),
        const SizedBox(height:8),
        const Text('Favorites, saved editions and your last reading position stay on this device.'),
        const SizedBox(height:18),
        if(books.isEmpty)const Card(child:Padding(padding:EdgeInsets.all(25),
          child:Text('Nothing saved yet. Explore a book and tap the bookmark.'))),
        ...books.map((b)=>Padding(padding:const EdgeInsets.only(bottom:12),
          child:SizedBox(height:175,child:BookCard(book:b,library:widget.library,
            onTap:()async{
              try{
                final available=await widget.api.book(b.id);
                if(!context.mounted)return;
                await Navigator.of(context).push(MaterialPageRoute<void>(
                  builder:(_)=>BookDetail(api:widget.api,library:widget.library,
                    initial:available)));
              }on AppNetworkError catch(e){
                if(e.statusCode==404)await widget.library.withdraw(b.id);
                if(!context.mounted)return;
                final local=widget.library.downloaded.any(
                  (entry)=>entry.startsWith(b.id+'|'));
                if(local&&e.statusCode!=404){
                  await Navigator.of(context).push(MaterialPageRoute<void>(
                    builder:(_)=>BookDetail(api:widget.api,library:widget.library,
                      initial:b,offlineOnly:true)));
                }else{
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content:Text(e.message)));
                }
              }
              if(mounted)setState((){});
            }))),
        ),
      ])));
  }
}

class SettingsView extends StatelessWidget{
  const SettingsView({super.key,required this.library});
  final LocalLibrary library;
  @override Widget build(BuildContext context)=>Center(child:ConstrainedBox(
    constraints:const BoxConstraints(maxWidth:760),
    child:ListView(padding:const EdgeInsets.all(22),children:[
      Text('Settings',style:Theme.of(context).textTheme.headlineMedium?.copyWith(
        color:brandGreen,fontFamily:'serif')),
      const SizedBox(height:12),
      const Text('Free reading, no account required. Downloaded books and reading marks are saved on this device.'),
      const SizedBox(height:24),
      Card(child:Column(children:[
        ListTile(leading:const Icon(Icons.language,color:brandGreen),
          title:const Text('Seeparah website'),
          subtitle:const Text('Full translation comparison, research and support'),
          trailing:const Icon(Icons.open_in_new),
          onTap:()=>openOfficialLink('https://seeparah.com')),
        const Divider(height:1),
        ListTile(leading:const Icon(Icons.privacy_tip_outlined,color:brandGreen),
          title:const Text('Privacy policy'),
          trailing:const Icon(Icons.open_in_new),
          onTap:()=>openOfficialLink('https://seeparah.com/legal#privacy')),
        const Divider(height:1),
        ListTile(leading:const Icon(Icons.gavel,color:brandGreen),
          title:const Text('Terms and source attribution'),
          trailing:const Icon(Icons.open_in_new),
          onTap:()=>openOfficialLink('https://seeparah.com/legal#terms')),
        const Divider(height:1),
        ListTile(leading:const Icon(Icons.support_agent,color:brandGreen),
          title:const Text('Help and content concerns'),
          trailing:const Icon(Icons.open_in_new),
          onTap:()=>openOfficialLink('https://seeparah.com/legal#support')),
      ])),
      const SizedBox(height:16),
      Text('Seeparah for Android, iOS, macOS, Windows and Linux',
        style:TextStyle(color:Colors.grey.shade700,fontSize:12)),
    ]),
  ));
}

class BookDetail extends StatefulWidget{
  const BookDetail({super.key,required this.api,required this.library,
    required this.initial,this.offlineOnly=false});
  final SeeparahApi api;
  final LocalLibrary library;
  final sp.Book initial;
  final bool offlineOnly;
  @override State<BookDetail> createState()=>_BookDetailState();
}
class _BookDetailState extends State<BookDetail>{
  late String language;
  bool saving=false,saved=false;
  double progress=0;
  @override void initState(){
    super.initState();
    language=widget.initial.language;
    _refreshOffline();
    widget.library.remember(widget.initial);
  }
  Future<void> _refreshOffline()async{
    final available=await widget.library.getOffline(widget.initial.id,language);
    if(mounted)setState(()=>saved=available!=null);
  }
  Future<void> _save()async{
    if(saving)return;
    setState((){saving=true;progress=0;});
    try{
      final book=widget.initial;
      final pages=<sp.Page>[];
      final toc=<sp.TocItem>[];
      var offset=0;
      var expectedTotal=-1;
      do{
        final batch=await widget.api.pages(book.id,language,offset);
        if(expectedTotal<0)expectedTotal=batch.total;
        if(expectedTotal!=batch.total)throw const AppNetworkError(
          'This edition changed during download. Retry from the beginning.');
        if(expectedTotal<=0||expectedTotal>20000)throw const AppNetworkError(
          'This edition is not eligible for offline storage.');
        pages.addAll(batch.pages);
        if(offset==0)toc.addAll(batch.toc);
        offset=batch.nextOffset??expectedTotal;
        if(!mounted)return;
        setState(()=>progress=pages.length/expectedTotal);
        if(pages.length>expectedTotal || pages.length>20000){
          throw const AppNetworkError('Invalid edition length');
        }
      }while(pages.length<expectedTotal);
      if(pages.length!=expectedTotal){
        throw const AppNetworkError('The downloaded edition is incomplete');
      }
      await widget.library.storeOffline(sp.OfflineCopy(book,language,pages,toc,
        DateTime.now().toUtc().toIso8601String()));
      if(mounted)setState(()=>saved=true);
    }on AppNetworkError catch(e){
      if(e.statusCode==404)await widget.library.withdraw(widget.initial.id);
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text(e.message)));
    }catch(e){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('Unable to save the full edition. Try again.')));
    }finally{if(mounted)setState(()=>saving=false);}
  }
  @override Widget build(BuildContext context){
    final b=widget.initial;
    return Scaffold(appBar:AppBar(title:const Text('Book details')),
      body:Center(child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:820),
        child:ListView(padding:const EdgeInsets.all(24),children:[
          Align(alignment:Alignment.centerLeft,child:Card(
            color:const Color(0xFFE4ECE6),
            child:Padding(padding:const EdgeInsets.all(22),
              child:Icon(b.sacred?Icons.menu_book:Icons.auto_stories,
                size:76,color:brandGreen)))),
          const SizedBox(height:20),
          Text(b.sacred?'SACRED TEXT':'LITERATURE',
            style:const TextStyle(letterSpacing:2,color:brandGold,
              fontSize:11,fontWeight:FontWeight.w800)),
          const SizedBox(height:6),
          Text(b.title,style:Theme.of(context).textTheme.headlineMedium?.copyWith(
            fontFamily:'serif',color:brandGreen,fontWeight:FontWeight.bold)),
          const SizedBox(height:7),
          Text(sp.displayAuthor(b.author),style:const TextStyle(fontSize:16)),
          const SizedBox(height:16),
          Text(b.summary.isNotEmpty?b.summary:'Source-preserved reading edition.',
            style:const TextStyle(fontSize:15,height:1.55)),
          const SizedBox(height:18),
          DropdownButtonFormField<String>(
            initialValue:language,
            decoration:const InputDecoration(labelText:'Available reading language',
              border:OutlineInputBorder()),
            items:b.readableLanguages.map((name)=>DropdownMenuItem(
              value:name,child:Text(name))).toList(),
            onChanged:(next){if(next!=null){setState(()=>language=next);_refreshOffline();}},
          ),
          const SizedBox(height:16),
          FilledButton.icon(icon:const Icon(Icons.chrome_reader_mode),
            label:const Text('Start reading'),
            onPressed:()async{
              if(widget.offlineOnly && !saved){
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                  content:Text('This language is not saved for offline reading.')));
                return;
              }
              await Navigator.of(context).push(MaterialPageRoute<void>(
                builder:(_)=>ReaderScreen(api:widget.api,library:widget.library,
                  book:b,language:language)));
            }),
          const SizedBox(height:8),
          if(saving)LinearProgressIndicator(value:progress.clamp(0.0,1.0)),
          OutlinedButton.icon(
            icon:Icon(saved?Icons.download_done:Icons.download_outlined),
            label:Text(saved?'Saved offline':saving?'Downloading…':'Save full book offline'),
            onPressed:saving||saved||widget.offlineOnly?null:_save,
          ),
          if(saved)TextButton.icon(
            icon:const Icon(Icons.delete_outline),
            label:const Text('Remove offline copy'),
            onPressed:()async{
              await widget.library.removeOffline(b.id,language);
              if(mounted)setState(()=>saved=false);
            }),
          const SizedBox(height:8),
          if(b.sourceUrl!=null)TextButton.icon(
            icon:const Icon(Icons.open_in_new),
            label:const Text('Original source and attribution'),
            onPressed:()=>openOfficialLink(b.sourceUrl!)),
          if(b.sacred)const Text(
            'For verse-aligned translation comparison, open the Seeparah website.',
            style:TextStyle(fontSize:12,color:brandGreen)),
        ]))));
  }
}
