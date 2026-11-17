import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'models.dart';

class AppNetworkError implements Exception {
  const AppNetworkError(this.message,[this.statusCode]);
  final String message;
  final int? statusCode;
  @override String toString()=>message;
}

class SeeparahApi {
  SeeparahApi({String? baseUrl,http.Client? client})
    : baseUrl=baseUrl??const String.fromEnvironment(
        'SEEPARAH_API_ORIGIN',defaultValue:'https://seeparah.com'),
      client=client??http.Client();
  final String baseUrl;
  final http.Client client;

  Uri path(String route,[Map<String,String>? query]){
    final root=Uri.parse(baseUrl);
    if(root.host.isEmpty ||
        (root.scheme!='https' &&
         !(root.scheme=='http' && (root.host=='localhost'||root.host=='127.0.0.1'))) ||
        root.userInfo.isNotEmpty){
      throw const AppNetworkError('Invalid Seeparah server');
    }
    return root.replace(path:'/api/mobile/v1'+route,
      queryParameters:query?.isEmpty==true?null:query,fragment:'');
  }

  Future<Map<String,dynamic>> _get(Uri url)async{
    http.Response response;
    try{
      response=await client.get(url,headers:{'accept':'application/json'})
        .timeout(const Duration(seconds:35));
    }on TimeoutException{
      throw const AppNetworkError('Connection timed out. Try again.');
    }catch(_){
      throw const AppNetworkError('Cannot reach Seeparah. Check your connection.');
    }
    Map<String,dynamic> data;
    try{
      data=Map<String,dynamic>.from(jsonDecode(utf8.decode(response.bodyBytes)) as Map);
    }catch(_){throw const AppNetworkError('Unexpected response from Seeparah');}
    if(response.statusCode<200||response.statusCode>=300){
      if(response.statusCode==404)throw const AppNetworkError(
        'Book not available or no longer published',404);
      if(response.statusCode==403)throw const AppNetworkError(
        'This edition is not available for guest readers',403);
      throw AppNetworkError(str(data['error'],'Seeparah temporarily unavailable'),
        response.statusCode);
    }
    return data;
  }

  Future<Catalogue> list({int page=1,String query='',String kind='all',
    String language=''})async{
    final value=await _get(path('/books',{
      'page':page.toString(),'q':query,'kind':kind,
      if(language.isNotEmpty)'language':language,
    }));
    return Catalogue.fromJson(value);
  }
  Future<Book> book(String id)async{
    final value=await _get(path('/books/'+Uri.encodeComponent(id)));
    return Book.fromJson(Map<String,dynamic>.from(value['book'] as Map));
  }
  Future<PageBatch> pages(String id,String language,int offset,{int limit=12})async{
    final value=await _get(path('/books/'+Uri.encodeComponent(id)+'/pages',{
      'language':language,'offset':offset.toString(),'limit':limit.toString(),
    }));
    return PageBatch.fromJson(value);
  }
  void close()=>client.close();
}
