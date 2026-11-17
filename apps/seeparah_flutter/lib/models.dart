import 'dart:convert';

String str(Object? x,[String otherwise=''])=>x is String?x:otherwise;
int numInt(Object? x,[int otherwise=0])=>x is int?x:otherwise;
List<String> words(Object? x)=>x is List?x.whereType<String>().toList():<String>[];

class Book {
  const Book({required this.id,required this.title,required this.author,
    required this.language,required this.languages,required this.chunkCount,
    required this.summary,required this.kind,required this.categories,
    this.coverUrl,this.sourceUrl,this.attribution,this.typography='standard'});
  final String id,title,author,language,summary,kind,typography;
  final String? coverUrl,sourceUrl,attribution;
  final List<String> languages,categories;
  final int chunkCount;
  bool get sacred=>kind=='sacred';
  List<String> get readableLanguages=>
    <String>{language,...languages}.where((x)=>x.trim().isNotEmpty).toList();

  factory Book.fromJson(Map<String,dynamic> x)=>Book(
    id:str(x['id']),title:str(x['title']),author:str(x['author'],'Author not listed'),
    language:str(x['sourceLanguage'],'English'),languages:words(x['languages']),
    chunkCount:numInt(x['chunkCount']),summary:str(x['description']),
    kind:str(x['kind'],'general'),categories:words(x['categories']),
    coverUrl:x['coverUrl'] is String?x['coverUrl'] as String:null,
    sourceUrl:x['sourceUrl'] is String?x['sourceUrl'] as String:null,
    attribution:x['attribution'] is String?x['attribution'] as String:null,
    typography:str(x['typography'],'standard'));
  Map<String,dynamic> toJson()=>{
    'id':id,'title':title,'author':author,'sourceLanguage':language,
    'languages':languages,'chunkCount':chunkCount,'description':summary,
    'kind':kind,'categories':categories,'coverUrl':coverUrl,'sourceUrl':sourceUrl,
    'attribution':attribution,'typography':typography,
  };
}

class Catalogue {
  const Catalogue(this.books,this.total,this.page,this.hasMore);
  final List<Book> books;
  final int total,page;
  final bool hasMore;
  factory Catalogue.fromJson(Map<String,dynamic> x)=>Catalogue(
    (x['books'] as List<dynamic>? ?? []).map(
      (v)=>Book.fromJson(Map<String,dynamic>.from(v as Map))).toList(),
    numInt(x['total']),numInt(x['page'],1),x['hasMore']==true);
}

class Page {
  const Page(this.index,this.text);
  final int index;
  final String text;
  factory Page.fromJson(Map<String,dynamic> x)=>Page(
    numInt(x['index']),str(x['text']));
  Map<String,dynamic> toJson()=>{'index':index,'text':text};
}
class TocItem {
  const TocItem(this.index,this.title);
  final int index;
  final String title;
  factory TocItem.fromJson(Map<String,dynamic> x)=>TocItem(
    numInt(x['index']),str(x['title']));
  Map<String,dynamic> toJson()=>{'index':index,'title':title};
}

class PageBatch {
  const PageBatch(this.pages,this.total,this.nextOffset,this.toc);
  final List<Page> pages;
  final int total;
  final int? nextOffset;
  final List<TocItem> toc;
  factory PageBatch.fromJson(Map<String,dynamic> x)=>PageBatch(
    (x['pages'] as List<dynamic>? ?? []).map(
      (p)=>Page.fromJson(Map<String,dynamic>.from(p as Map))).toList(),
    numInt(x['total']),
    x['nextOffset'] is int ? x['nextOffset'] as int:null,
    (x['navigation'] as List<dynamic>? ?? []).map(
      (p)=>TocItem.fromJson(Map<String,dynamic>.from(p as Map))).toList(),
  );
}

class OfflineCopy {
  const OfflineCopy(this.book,this.language,this.pages,this.toc,this.savedAt);
  final Book book;
  final String language,savedAt;
  final List<Page> pages;
  final List<TocItem> toc;
  Map<String,dynamic> toJson()=>{
    'book':book.toJson(),'language':language,
    'pages':pages.map((p)=>p.toJson()).toList(),
    'toc':toc.map((p)=>p.toJson()).toList(),'savedAt':savedAt};
  factory OfflineCopy.fromJson(Map<String,dynamic> x)=>OfflineCopy(
    Book.fromJson(Map<String,dynamic>.from(x['book'] as Map)),
    str(x['language']),
    (x['pages'] as List<dynamic>? ?? []).map(
      (v)=>Page.fromJson(Map<String,dynamic>.from(v as Map))).toList(),
    (x['toc'] as List<dynamic>? ?? []).map(
      (v)=>TocItem.fromJson(Map<String,dynamic>.from(v as Map))).toList(),
    str(x['savedAt']));
  String encode()=>jsonEncode(toJson());
}

bool rtl(String language)=>const {'Arabic','Urdu','Persian','Pashto','Hebrew'}.contains(language);
String displayAuthor(String author){
  final parts=author.split(',').map((x)=>x.trim()).toList();
  return parts.length==2?parts[1]+' '+parts[0]:author;
}
