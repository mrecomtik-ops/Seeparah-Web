import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:seeparah_reader/models.dart';
import 'package:seeparah_reader/api.dart';
import 'package:seeparah_reader/local_library.dart';

void main(){
  const data={
    'id':'book-id','title':'Example','author':'Dickens, Charles',
    'sourceLanguage':'English','languages':['English','Urdu'],
    'chunkCount':2,'kind':'general','description':'A sourced edition',
    'categories':['Classics']
  };
  test('multilingual model round-trips without altering book identity',(){
    final b=Book.fromJson(data);
    expect(b.readableLanguages,['English','Urdu']);
    expect(Book.fromJson(b.toJson()).title,'Example');
    expect(displayAuthor(b.author),'Charles Dickens');
    expect(rtl('Urdu'),isTrue);
  });
  test('API parses real catalogue envelope and rejects insecure hosts',()async{
    final mock=MockClient((request)async{
      expect(request.url.queryParameters['kind'],'sacred');
      return http.Response('{"page":1,"total":1,"hasMore":false,"books":[]}',200);
    });
    final api=SeeparahApi(baseUrl:'https://seeparah.com',client:mock);
    final result=await api.list(kind:'sacred');
    expect(result.total,1);
    expect(()=>SeeparahApi(baseUrl:'http://insecure.com',client:mock).path('/books'),
      throwsA(isA<AppNetworkError>()));
    api.close();
  });
  test('unpublished book response is never displayed',()async{
    final api=SeeparahApi(client:MockClient((_)async=>
      http.Response('{"error":"Not published"}',404)));
    await expectLater(api.book('x'),throwsA(isA<AppNetworkError>()));
  });
  test('bookmarks and progress are persisted locally',()async{
    SharedPreferences.setMockInitialValues({});
    final pref=await SharedPreferences.getInstance();
    final local=LocalLibrary(pref);
    final b=Book.fromJson(data);
    await local.star(b,true);
    await local.progress(b.id,'Urdu',1);
    expect(LocalLibrary(pref).starred(b.id),true);
    expect(LocalLibrary(pref).lastPage(b.id,'Urdu'),1);
    expect(LocalLibrary(pref).remembered(b.id)?.title,'Example');
  });
}
