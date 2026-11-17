import 'package:flutter/material.dart';
import 'api.dart';
import 'local_library.dart';
import 'models.dart' as sp;
import 'ink.dart';

class ReaderScreen extends StatefulWidget{
  const ReaderScreen({super.key,required this.api,required this.library,
    required this.book,required this.language});
  final SeeparahApi api;
  final LocalLibrary library;
  final sp.Book book;
  final String language;
  @override State<ReaderScreen> createState()=>_ReaderScreenState();
}
class _ReaderScreenState extends State<ReaderScreen>{
  sp.Page? current;
  sp.OfflineCopy? offline;
  List<sp.TocItem> toc=[];
  String? error,selectedText;
  int selectedStart=0,selectedEnd=0,index=0,total=0;
  bool loading=false,checking=false;
  late double fontSize;
  late String readerTheme;

  @override void initState(){
    super.initState();
    fontSize=widget.library.fontSize;
    readerTheme=widget.library.theme;
    WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)initialize();});
  }

  Future<void> initialize()async{
    if(checking)return;
    checking=true;
    try{
      offline=await widget.library.getOffline(widget.book.id,widget.language);
      if(offline!=null){
        total=offline!.pages.length;toc=offline!.toc;
        final target=widget.library.lastPage(widget.book.id,widget.language)
          .clamp(0,total>0?total-1:0);
        await openPage(target);
      }else{
        final first=await widget.api.pages(widget.book.id,widget.language,0,limit:1);
        if(first.pages.isEmpty)throw const AppNetworkError('No readable text is available.');
        total=first.total;toc=first.toc;
        final target=widget.library.lastPage(widget.book.id,widget.language)
          .clamp(0,total>0?total-1:0);
        if(target==0){
          if(mounted)setState((){
            current=first.pages.first;index=0;error=null;loading=false;
          });
        }else{await openPage(target);}
      }
    }catch(e){
      if(mounted)setState(()=>error=e.toString());
    }finally{checking=false;}
  }

  Future<void> openPage(int target)async{
    if(loading||target<0||(total>0&&target>=total))return;
    if(!mounted)return;
    setState((){loading=true;error=null;selectedText=null;});
    try{
      final sp.Page? next;
      if(offline!=null){
        next=target<offline!.pages.length?offline!.pages[target]:null;
      }else{
        final batch=await widget.api.pages(widget.book.id,widget.language,target,limit:1);
        if(batch.total!=total&&total>0){
          throw const AppNetworkError('This edition changed. Reopen the book to refresh.');
        }
        total=batch.total;
        if(toc.isEmpty&&batch.toc.isNotEmpty)toc=batch.toc;
        next=batch.pages.isNotEmpty?batch.pages.first:null;
      }
      if(next==null)throw const AppNetworkError('This page is unavailable.');
      await widget.library.progress(widget.book.id,widget.language,target);
      if(mounted)setState((){current=next;index=target;});
    }on AppNetworkError catch(e){
      if(e.statusCode==404){
        await widget.library.withdraw(widget.book.id);
        offline=null;
      }
      if(mounted)setState(()=>error=e.message);
    }catch(_){
      if(mounted)setState(()=>error='Unable to load this page.');
    }finally{if(mounted)setState(()=>loading=false);}
  }

  Future<void> selectTheme(String value)async{
    await widget.library.setTheme(value);
    if(mounted)setState(()=>readerTheme=value);
  }
  Future<void> changeFont(double value)async{
    await widget.library.font(value);
    if(mounted)setState(()=>fontSize=value);
  }

  Color get paper=>switch(readerTheme){
    'night'=>const Color(0xFF15251F),
    'sepia'=>const Color(0xFFEDE0C2),
    _=>const Color(0xFFFFFEF9),
  };
  Color get ink=>readerTheme=='night'
    ?const Color(0xFFF4F1E4):const Color(0xFF26362D);

  void tocSheet(){
    showModalBottomSheet<void>(context:context,isScrollControlled:true,
      builder:(sheetContext)=>SafeArea(child:FractionallySizedBox(
        heightFactor:0.8,child:ListView(children:[
          const Padding(padding:EdgeInsets.all(18),child:Text('Contents',
            style:TextStyle(fontWeight:FontWeight.bold,fontSize:22))),
          if(toc.isEmpty)const Padding(padding:EdgeInsets.all(18),
            child:Text('This source has no verified chapter menu. Use Previous/Next to read the complete edition.')),
          ...toc.map((chapter)=>ListTile(
            title:Text(chapter.title,maxLines:2,overflow:TextOverflow.ellipsis),
            leading:const Icon(Icons.bookmark_outline),
            onTap:(){
              Navigator.pop(sheetContext);
              openPage(chapter.index.clamp(0,total-1));
            },
          )),
        ]))));
  }
  void highlightsSheet(){
    final marks=widget.library.marks(widget.book.id,widget.language,index);
    showModalBottomSheet<void>(context:context,
      builder:(_)=>SafeArea(child:ListView(shrinkWrap:true,children:[
        const Padding(padding:EdgeInsets.all(18),child:Text('Saved highlights',
          style:TextStyle(fontSize:20,fontWeight:FontWeight.bold))),
        if(marks.isEmpty)const Padding(padding:EdgeInsets.all(18),
          child:Text('Select a passage in the text to add a highlight or note.')),
        ...marks.map((m)=>ListTile(
          leading:const Icon(Icons.highlight,color:Color(0xFFD9A444)),
          title:Text(m.text,maxLines:3),
          subtitle:m.note.isEmpty?null:Text(m.note,maxLines:3),
        )),
      ])));
  }
  Future<void> saveHighlight()async{
    final selection=selectedText;
    if(selection==null||selection.isEmpty)return;
    final controller=TextEditingController();
    final note=await showDialog<String>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Save highlight'),
      content:Column(mainAxisSize:MainAxisSize.min,children:[
        Text(selection,maxLines:4,overflow:TextOverflow.ellipsis),
        const SizedBox(height:12),
        TextField(controller:controller,maxLines:3,
          decoration:const InputDecoration(labelText:'Optional note',
            border:OutlineInputBorder())),
      ]),
      actions:[
        TextButton(onPressed:()=>Navigator.pop(ctx),child:const Text('Cancel')),
        FilledButton(onPressed:()=>Navigator.pop(ctx,controller.text),
          child:const Text('Save')),
      ],
    ));
    controller.dispose();
    if(note==null)return;
    await widget.library.saveMark(Mark(widget.book.id,widget.language,index,
      selectedStart,selectedEnd,selection,note));
    if(mounted)setState(()=>selectedText=null);
  }

  @override Widget build(BuildContext context){
    final visible=current;
    final isRtl=sp.rtl(widget.language);
    return Scaffold(
      backgroundColor:paper,
      appBar:AppBar(
        backgroundColor:paper,foregroundColor:ink,
        title:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text(widget.book.title,maxLines:1,overflow:TextOverflow.ellipsis,
            style:TextStyle(fontSize:16,color:ink,fontFamily:'serif')),
          Text(widget.language,style:TextStyle(fontSize:11,color:ink.withValues(alpha:0.7))),
        ]),
        actions:[
          IconButton(tooltip:'Table of contents',onPressed:tocSheet,
            icon:const Icon(Icons.list)),
          IconButton(tooltip:'Highlights and notes',onPressed:highlightsSheet,
            icon:const Icon(Icons.auto_fix_high_outlined)),
          PopupMenuButton<String>(
            tooltip:'Reader theme',onSelected:selectTheme,
            itemBuilder:(_)=>const [
              PopupMenuItem(value:'paper',child:Text('Paper')),
              PopupMenuItem(value:'sepia',child:Text('Sepia')),
              PopupMenuItem(value:'night',child:Text('Night')),
            ],icon:const Icon(Icons.palette_outlined)),
        ],
      ),
      body:SafeArea(child:Center(child:ConstrainedBox(
        constraints:const BoxConstraints(maxWidth:850),
        child:Column(children:[
          LinearProgressIndicator(
            value:total>0?(index+1)/total:0,minHeight:3,
            backgroundColor:paper,
            color:const Color(0xFFB48A49)),
          if(error!=null)Padding(padding:const EdgeInsets.all(10),
            child:Column(children:[
              Text(error!,style:const TextStyle(color:Colors.redAccent)),
              TextButton(onPressed:initialize,child:const Text('Retry')),
            ])),
          if(loading)const LinearProgressIndicator(minHeight:2),
          Expanded(child:visible==null
            ?const Center(child:CircularProgressIndicator())
            :SingleChildScrollView(key:ValueKey('scroll-'+index),
              padding:const EdgeInsets.fromLTRB(22,18,22,25),
              child:InkBoard(key:ValueKey('ink-'+widget.book.id+'-'+widget.language+'-'+index),
                local:widget.library,bookId:widget.book.id,
                language:widget.language,index:index,
                child:Directionality(
                  textDirection:isRtl?TextDirection.rtl:TextDirection.ltr,
                  child:SelectableText(
                    visible.text,
                    textAlign:isRtl?TextAlign.right:TextAlign.start,
                    textDirection:isRtl?TextDirection.rtl:TextDirection.ltr,
                    selectionColor:const Color(0x99D8B85D),
                    style:TextStyle(color:ink,fontSize:fontSize,height:isRtl?2.0:1.75,
                      fontFamily:isRtl?'serif':'serif',letterSpacing:0.12),
                    onSelectionChanged:(selection,cause){
                      final content=visible.text;
                      final start=selection.start,end=selection.end;
                      if(start>=0&&end>start&&end<=content.length){
                        setState((){
                          selectedStart=start;selectedEnd=end;
                          selectedText=content.substring(start,end);
                        });
                      }
                    },
                  ),
                ),
              ),
            )),
          if(selectedText!=null)Padding(
            padding:const EdgeInsets.symmetric(horizontal:12),
            child:FilledButton.icon(onPressed:saveHighlight,
              icon:const Icon(Icons.format_color_fill),
              label:const Text('Highlight selected passage'))),
          Padding(padding:const EdgeInsets.fromLTRB(14,5,14,7),
            child:Row(children:[
              const Icon(Icons.text_fields,size:17),
              Expanded(child:Slider(min:15,max:32,value:fontSize,
                onChanged:(n)=>changeFont(n))),
              Text(fontSize.toStringAsFixed(0)),
            ])),
          Padding(padding:const EdgeInsets.fromLTRB(15,0,15,12),
            child:Row(children:[
              OutlinedButton.icon(
                onPressed:!loading&&index>0?()=>openPage(index-1):null,
                icon:const Icon(Icons.chevron_left),label:const Text('Previous')),
              Expanded(child:Text(
                total>0?'Page '+(index+1).toString()+' of '+total.toString():'',
                textAlign:TextAlign.center,
                style:TextStyle(fontSize:12,color:ink.withValues(alpha:0.7)))),
              FilledButton.icon(
                onPressed:!loading&&index+1<total?()=>openPage(index+1):null,
                icon:const Icon(Icons.chevron_right),label:const Text('Next')),
            ])),
        ]),
      ))),
    );
  }
}
