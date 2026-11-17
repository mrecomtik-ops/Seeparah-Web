import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:seeparah_reader/api.dart';
import 'package:seeparah_reader/local_library.dart';
import 'package:seeparah_reader/models.dart' as sp;
import 'package:seeparah_reader/reader.dart';

class OfflineTestPaths extends PathProviderPlatform {
  OfflineTestPaths(this.base);
  final String base;
  @override
  Future<String?> getApplicationSupportPath() async => base;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('offline reader opens, navigates and keeps the same page count',
      (tester) async {
    final folder = await Directory.systemTemp.createTemp('seeparah-reader-');
    final original = PathProviderPlatform.instance;
    PathProviderPlatform.instance = OfflineTestPaths(folder.path);
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final local = LocalLibrary(prefs);
    final book = sp.Book.fromJson({
      'id': 'f244d4fb-5b52-4678-a8d1-270a6fb5aa42',
      'title': 'Offline Reader Test',
      'author': 'Author',
      'sourceLanguage': 'Urdu',
      'languages': ['Urdu'],
      'chunkCount': 2,
    });
    await local.storeOffline(sp.OfflineCopy(
      book, 'Urdu',
      [const sp.Page(0, 'پہلا صفحہ'),
       const sp.Page(1, 'دوسرا صفحہ')],
      [const sp.TocItem(0, 'ابتدا')],
      '2026-11-17T00:00:00Z',
    ));
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
      await tester.pumpAndSettle();
      expect(find.text('Page 1 of 2'), findsOneWidget);
      expect(find.text('پہلا صفحہ'), findsOneWidget);
      expect(networkRequests, 0);

      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      expect(find.text('Page 2 of 2'), findsOneWidget);
      expect(find.text('دوسرا صفحہ'), findsOneWidget);
      expect(local.lastPage(book.id, 'Urdu'), 1);

      await tester.drag(find.byType(Slider), const Offset(65, 0));
      await tester.pumpAndSettle();
      expect(find.text('Page 2 of 2'), findsOneWidget);
      expect(networkRequests, 0);

      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(MaterialApp(
        home: ReaderScreen(
          api: api, library: LocalLibrary(prefs),
          book: book, language: 'Urdu',
        ),
      ));
      await tester.pump();
      await tester.pumpAndSettle();
      expect(find.text('Page 2 of 2'), findsOneWidget);
      expect(networkRequests, 0);
    } finally {
      api.close();
      await tester.pumpWidget(const SizedBox());
      PathProviderPlatform.instance = original;
      if (await folder.exists()) await folder.delete(recursive: true);
    }
  });
}
