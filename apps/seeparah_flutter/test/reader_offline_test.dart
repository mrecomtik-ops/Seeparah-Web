import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:seeparah_reader/api.dart';
import 'package:seeparah_reader/local_library.dart';
import 'package:seeparah_reader/models.dart' as sp;
import 'package:seeparah_reader/reader.dart';

/// In-memory offline copy avoids real asynchronous filesystem I/O in the
/// Flutter widget-test FakeAsync zone. Disk persistence is tested separately.
class MemoryOfflineLibrary extends LocalLibrary {
  MemoryOfflineLibrary(super.prefs, this.copy);
  final sp.OfflineCopy copy;

  @override
  Future<sp.OfflineCopy?> getOffline(String bookId, String language) async =>
    copy.book.id == bookId && copy.language == language ? copy : null;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('offline Urdu reader navigates, saves progress, never contacts API',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final book = sp.Book.fromJson({
      'id': 'f244d4fb-5b52-4678-a8d1-270a6fb5aa42',
      'title': 'Offline Reader Test',
      'author': 'Author',
      'sourceLanguage': 'Urdu',
      'languages': ['Urdu'],
      'chunkCount': 2,
    });
    final copy = sp.OfflineCopy(
      book, 'Urdu',
      [const sp.Page(0, 'پہلا صفحہ'),
       const sp.Page(1, 'دوسرا صفحہ')],
      [const sp.TocItem(0, 'ابتدا')],
      '2026-11-17T00:00:00Z',
    );
    final local = MemoryOfflineLibrary(prefs, copy);
    var networkRequests = 0;
    final api = SeeparahApi(client: MockClient((_) async {
      networkRequests++;
      return http.Response('{"error":"No internet"}', 503);
    }));

    try {
      await tester.pumpWidget(MaterialApp(
        home: ReaderScreen(
          api: api, library: local, book: book, language: 'Urdu',
        ),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Page 1 of 2'), findsOneWidget);
      expect(find.text('پہلا صفحہ'), findsOneWidget);
      expect(networkRequests, 0);

      await tester.tap(find.text('Next'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Page 2 of 2'), findsOneWidget);
      expect(find.text('دوسرا صفحہ'), findsOneWidget);
      expect(local.lastPage(book.id, 'Urdu'), 1);

      await tester.drag(find.byType(Slider), const Offset(65, 0));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Page 2 of 2'), findsOneWidget);
      expect(networkRequests, 0);

      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(MaterialApp(
        home: ReaderScreen(
          api: api, library: MemoryOfflineLibrary(prefs, copy),
          book: book, language: 'Urdu',
        ),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Page 2 of 2'), findsOneWidget);
      expect(networkRequests, 0);
    } finally {
      api.close();
      await tester.pumpWidget(const SizedBox());
    }
  });
}
