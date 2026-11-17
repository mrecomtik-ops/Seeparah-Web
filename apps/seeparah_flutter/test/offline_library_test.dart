import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:seeparah_reader/ink.dart';
import 'package:seeparah_reader/local_library.dart';
import 'package:seeparah_reader/models.dart' as sp;

class TemporaryPathProvider extends PathProviderPlatform {
  TemporaryPathProvider(this.root);
  final String root;
  @override
  Future<String?> getApplicationSupportPath() async => root;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory folder;
  late PathProviderPlatform originalProvider;
  late SharedPreferences prefs;
  late LocalLibrary library;

  final book = sp.Book.fromJson({
    'id': 'a11c2e5d-4678-4390-97cc-c83ca4014aa4',
    'title': 'Offline storage test book',
    'author': 'Sample, Author',
    'sourceLanguage': 'English',
    'languages': ['English', 'Urdu'],
    'chunkCount': 2,
  });

  sp.OfflineCopy edition(String language) => sp.OfflineCopy(
    book, language,
    [sp.Page(0, language == 'Urdu' ? 'پہلا صفحہ' : 'First page'),
      sp.Page(1, language == 'Urdu' ? 'دوسرا صفحہ' : 'Second page')],
    [const sp.TocItem(0, 'Start')],
    '2026-11-17T00:00:00Z',
  );

  setUp(() async {
    folder = await Directory.systemTemp.createTemp('seeparah-offline-qa-');
    originalProvider = PathProviderPlatform.instance;
    PathProviderPlatform.instance = TemporaryPathProvider(folder.path);
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    library = LocalLibrary(prefs);
  });

  tearDown(() async {
    PathProviderPlatform.instance = originalProvider;
    if (await folder.exists()) await folder.delete(recursive: true);
  });

  test('English and Urdu editions survive reopening the library', () async {
    await library.storeOffline(edition('English'));
    await library.storeOffline(edition('Urdu'));
    final restarted = LocalLibrary(prefs);
    expect(restarted.downloaded.length, 2);
    expect((await restarted.getOffline(book.id, 'English'))!.pages[1].text,
      'Second page');
    expect((await restarted.getOffline(book.id, 'Urdu'))!.pages.first.text,
      'پہلا صفحہ');
    expect((await restarted.getOffline(book.id, 'Arabic')), isNull);
    expect(restarted.remembered(book.id)!.title, book.title);
  });

  test('removing one edition preserves the other language', () async {
    await library.storeOffline(edition('English'));
    await library.storeOffline(edition('Urdu'));
    await library.removeOffline(book.id, 'English');
    expect(await library.getOffline(book.id, 'English'), isNull);
    expect(await library.getOffline(book.id, 'Urdu'), isNotNull);
  });

  test('corrupted offline archive is never shown as book content', () async {
    await library.storeOffline(edition('English'));
    final file = File(
      '${folder.path}/seeparah-offline/${book.id}-English.json.gz',
    );
    expect(await file.exists(), isTrue);
    await file.writeAsString('not a gzipped book', flush: true);
    expect(await library.getOffline(book.id, 'English'), isNull);
  });

  test('rejects empty editions without listing them as downloaded', () async {
    final empty = sp.OfflineCopy(
      book, 'English', [], [], '2026-11-17T00:00:00Z',
    );
    await expectLater(library.storeOffline(empty),
      throwsA(isA<FileSystemException>()));
    expect(library.downloaded, isEmpty);
  });

  test('rights withdrawal clears offline editions and saved metadata', () async {
    await library.storeOffline(edition('Urdu'));
    await library.storeOffline(edition('English'));
    await library.star(book, true);
    await library.withdraw(book.id);
    expect(library.downloaded, isEmpty);
    expect(library.starred(book.id), isFalse);
    expect(library.remembered(book.id), isNull);
    expect(await library.getOffline(book.id, 'Urdu'), isNull);
  });

  test('highlights, notes, progress and settings persist per language', () async {
    await library.progress(book.id, 'Urdu', 1);
    await library.progress(book.id, 'English', 0);
    await library.saveMark(
      Mark(book.id, 'Urdu', 1, 0, 5, 'دوسرا', 'Remember this page'),
    );
    await library.font(25);
    await library.setTheme('night');

    final restarted = LocalLibrary(prefs);
    expect(restarted.lastPage(book.id, 'Urdu'), 1);
    expect(restarted.lastPage(book.id, 'English'), 0);
    expect(restarted.marks(book.id, 'Urdu', 1).single.note,
      'Remember this page');
    expect(restarted.marks(book.id, 'English', 1), isEmpty);
    expect(restarted.fontSize, 25);
    expect(restarted.theme, 'night');
  });

  testWidgets('handwritten stroke saves across a reader-page rebuild',
      (tester) async {
    Widget board() => MaterialApp(
      home: Scaffold(body: Center(child: SizedBox(
        width: 350, height: 310,
        child: InkBoard(
          local: library, bookId: book.id, language: 'Urdu', index: 1,
          child: const SizedBox(
            height: 225, width: 350,
            child: Text('صفحة پڑھنے کا متن'),
          ),
        ),
      ))),
    );

    await tester.pumpWidget(board());
    await tester.tap(find.byTooltip('Write or draw on this page'));
    await tester.pump();
    final center = tester.getCenter(find.byType(InkBoard));
    await tester.dragFrom(center + const Offset(0, 25),
      const Offset(22, 17));
    await tester.pumpAndSettle();

    final key = 'ink:${book.id}:Urdu:1';
    final encoded = prefs.getString(key);
    expect(encoded, isNotNull);
    expect((jsonDecode(encoded!) as List<dynamic>).length, 1);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(board());
    await tester.pump();
    expect(
      (jsonDecode(prefs.getString(key)!) as List<dynamic>).length,
      1,
    );
    final restore = InkStroke.fromJson(
      Map<String, dynamic>.from(
        (jsonDecode(prefs.getString(key)!) as List<dynamic>).single as Map,
      ),
    );
    expect(restore.points.length, greaterThan(1));
    expect(find.byTooltip('Undo last stroke'), findsOneWidget);
  });
}
