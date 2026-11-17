import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:integration_test/integration_test.dart';
import 'package:seeparah_reader/api.dart';
import 'package:seeparah_reader/local_library.dart';
import 'package:seeparah_reader/models.dart' as sp;
import 'package:seeparah_reader/reader.dart';

/// Actual Android emulator/iOS simulator file and UI integration coverage.
/// It uses a local test fixture, never modifies public Seeparah books.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('native offline Urdu reading survives restart without internet',
      (tester) async {
    final book = sp.Book.fromJson({
      'id': '2873a48a-0b37-4fa6-8835-fc6ba07c140c',
      'title': 'Local Device Test Edition',
      'author': 'Seeparah QA',
      'sourceLanguage': 'Urdu',
      'languages': ['Urdu'],
      'chunkCount': 2,
    });
    final library = await LocalLibrary.open();
    await library.removeOffline(book.id, 'Urdu');
    final copy = sp.OfflineCopy(
      book, 'Urdu',
      [const sp.Page(0, 'پہلا صفحہ'),
       const sp.Page(1, 'دوسرا صفحہ')],
      [const sp.TocItem(0, 'ابتدا')],
      '2026-11-17T00:00:00Z',
    );
    await library.storeOffline(copy);
    await library.progress(book.id, 'Urdu', 0);

    var networkRequests = 0;
    final api = SeeparahApi(client: MockClient((_) async {
      networkRequests++;
      return http.Response('{"error":"Simulated airplane mode"}', 503);
    }));

    Future<void> loadedPage(int page) async {
      final expected = 'Page $page of 2';
      for (var tries = 0; tries < 15; tries++) {
        await tester.pump(const Duration(milliseconds: 300));
        if (find.text(expected).evaluate().isNotEmpty) return;
      }
      expect(find.text(expected), findsOneWidget);
    }

    try {
      await tester.pumpWidget(MaterialApp(home: ReaderScreen(
        api: api, library: library, book: book, language: 'Urdu',
      )));
      await loadedPage(1);
      expect(find.text('پہلا صفحہ'), findsOneWidget);
      expect(networkRequests, 0);

      await tester.tap(find.text('Next'));
      await loadedPage(2);
      expect(find.text('دوسرا صفحہ'), findsOneWidget);
      expect(library.lastPage(book.id, 'Urdu'), 1);

      await tester.pumpWidget(const SizedBox.shrink());
      final reopened = await LocalLibrary.open();
      expect((await reopened.getOffline(book.id, 'Urdu'))!.pages.length, 2);
      await tester.pumpWidget(MaterialApp(home: ReaderScreen(
        api: api, library: reopened, book: book, language: 'Urdu',
      )));
      await loadedPage(2);
      expect(networkRequests, 0);
    } finally {
      api.close();
      await tester.pumpWidget(const SizedBox.shrink());
      await library.removeOffline(book.id, 'Urdu');
    }
  });
}
