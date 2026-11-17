import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'models.dart';

class Mark {
  const Mark(this.bookId,this.language,this.index,this.start,this.end,this.text,this.note);
  final String bookId,language,text,note;
  final int index,start,end;
  Map<String,dynamic> toJson()=>{
    'bookId':bookId,'language':language,'index':index,'start':start,
    'end':end,'text':text,'note':note};
  factory Mark.fromJson(Map<String,dynamic> x)=>Mark(
    str(x['bookId']),str(x['language']),numInt(x['index']),
    numInt(x['start']),numInt(x['end']),str(x['text']),str(x['note']));
}

class LocalLibrary{
  LocalLibrary(this.prefs);
  final SharedPreferences prefs;
  static Future<LocalLibrary> open()async=>
    LocalLibrary(await SharedPreferences.getInstance());
  static String id(String bookId,String language)=>bookId+'|'+language;

  Set<String> get favorites=>prefs.getStringList('favorites')?.toSet()??<String>{};
  Set<String> get downloaded=>prefs.getStringList('downloaded')?.toSet()??<String>{};
  bool starred(String bookId)=>favorites.contains(bookId);
  Future<void> star(Book book,bool enabled)async{
    final next=favorites;
    if(enabled){next.add(book.id);}else{next.remove(book.id);}
    await prefs.setStringList('favorites',next.toList());
    await remember(book);
  }
  Future<void> remember(Book book)=>
    prefs.setString('metadata-'+book.id,jsonEncode(book.toJson()));
  Book? remembered(String bookId){
    final value=prefs.getString('metadata-'+bookId);
    if(value==null)return null;
    try{return Book.fromJson(Map<String,dynamic>.from(jsonDecode(value) as Map));}
    catch(_){return null;}
  }

  int lastPage(String bookId,String language)=>
    prefs.getInt('progress-'+id(bookId,language))??0;
  Future<void> progress(String bookId,String language,int page)=>
    prefs.setInt('progress-'+id(bookId,language),page);
  double get fontSize=>(prefs.getDouble('font-size')??19).clamp(15,32).toDouble();
  Future<void> font(double value)=>prefs.setDouble('font-size',value.clamp(15,32));
  String get theme=>prefs.getString('reader-theme')??'paper';
  Future<void> setTheme(String value)=>prefs.setString('reader-theme',value);

  List<Mark> marks(String bookId,String language,int index){
    final output=<Mark>[];
    for(final line in prefs.getStringList('marks')??<String>[]){
      try{
        final mark=Mark.fromJson(Map<String,dynamic>.from(jsonDecode(line) as Map));
        if(mark.bookId==bookId&&mark.language==language&&mark.index==index){
          output.add(mark);
        }
      }catch(_){/* discard corrupt local preference */}
    }
    return output;
  }
  Future<void> saveMark(Mark mark)async{
    final old=prefs.getStringList('marks')??<String>[];
    final next=[...old,jsonEncode(mark.toJson())];
    await prefs.setStringList('marks',
      next.length>300?next.sublist(next.length-300):next);
  }

  Future<File> _file(String bookId,String language)async{
    final base=await getApplicationSupportDirectory();
    final dir=Directory(base.path+Platform.pathSeparator+'seeparah-offline');
    await dir.create(recursive:true);
    final safe=(bookId+'-'+language)
      .replaceAll(RegExp(r'[^a-zA-Z0-9._-]'),'_');
    return File(dir.path+Platform.pathSeparator+safe+'.json.gz');
  }
  Future<OfflineCopy?> getOffline(String bookId,String language)async{
    if(!downloaded.contains(id(bookId,language)))return null;
    try{
      final f=await _file(bookId,language);
      if(!await f.exists()||await f.length()>35*1024*1024)return null;
      final json=jsonDecode(utf8.decode(gzip.decode(await f.readAsBytes())));
      final copy=OfflineCopy.fromJson(Map<String,dynamic>.from(json as Map));
      if(copy.book.id!=bookId||copy.language!=language)return null;
      return copy;
    }catch(_){return null;}
  }
  Future<void> storeOffline(OfflineCopy copy)async{
    if(copy.pages.isEmpty)throw const FileSystemException('Empty books cannot be saved');
    final encoded=utf8.encode(copy.encode());
    if(encoded.length>50*1024*1024){
      throw const FileSystemException('Book exceeds offline storage limit');
    }
    final file=await _file(copy.book.id,copy.language);
    final temp=File(file.path+'.tmp');
    try{
      await temp.writeAsBytes(gzip.encode(encoded),flush:true);
      if(await file.exists())await file.delete();
      await temp.rename(file.path);
      final keys=downloaded..add(id(copy.book.id,copy.language));
      await prefs.setStringList('downloaded',keys.toList());
      await remember(copy.book);
    }finally{
      if(await temp.exists())await temp.delete();
    }
  }
  Future<void> removeOffline(String bookId,String language)async{
    final f=await _file(bookId,language);
    if(await f.exists())await f.delete();
    final keys=downloaded..remove(id(bookId,language));
    await prefs.setStringList('downloaded',keys.toList());
  }
  Future<void> withdraw(String bookId)async{
    // When the server confirms a rights withdrawal or unpublishing,
    // remove offline copies. Do not expose deliberately-unpublished books.
    for(final item in downloaded.toList()){
      if(item.startsWith(bookId+'|')){
        await removeOffline(bookId,item.substring(bookId.length+1));
      }
    }
    final fav=favorites..remove(bookId);
    await prefs.setStringList('favorites',fav.toList());
    await prefs.remove('metadata-'+bookId);
  }
}
