import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:seeparah_reader/api.dart';
import 'package:seeparah_reader/models.dart' as sp;
import 'package:seeparah_reader/offline_download.dart';

void main() {
  final book = sp.Book.fromJson({
    'id': '572c3210-8011-41c6-8128-4a0ea8b2e76e',
    'title': 'Offline test book',
    'author': 'Test Author',
    'sourceLanguage': 'English',
    'languages': ['English', 'Urdu'],
    'chunkCount': 3,
  });

  Map<String, dynamic> batch({
    required int total,
    required List<int> indices,
    int? nextOffset,
    bool withNavigation = false,
  }) => {
    'total': total,
    'nextOffset': nextOffset,
    'navigation': withNavigation ? [{'index': 0, 'title': 'Chapter one'}] : [],
    'pages': indices.map((i) => {'index': i, 'text': 'Page $i'}).toList(),
  };

  SeeparahApi apiFor(Map<int, Map<String, dynamic>> responses) =>
    SeeparahApi(client: MockClient((request) async {
      final offset = int.parse(request.url.queryParameters['offset'] ?? '0');
      return http.Response(
        jsonEncode(responses[offset] ?? batch(total: 3, indices: [])),
        200, headers: {'content-type': 'application/json'},
      );
    }));

  test('downloads complete paginated edition, TOC, and progress', () async {
    final values = <double>[];
    final api = apiFor({
      0: batch(total: 3, indices: [0, 1], nextOffset: 2,
        withNavigation: true),
      2: batch(total: 3, indices: [2]),
    });
    final copy = await fetchFullOfflineEdition(
      api, book, 'English', onProgress: values.add,
    );
    expect(copy.book.id, book.id);
    expect(copy.pages.map((p) => p.text).toList(),
      ['Page 0', 'Page 1', 'Page 2']);
    expect(copy.toc.single.title, 'Chapter one');
    expect(values, [closeTo(2 / 3, 0.001), 1.0]);
    api.close();
  });

  test('rejects duplicate page indexes instead of saving bad content', () async {
    final api = apiFor({
      0: batch(total: 3, indices: [0, 1], nextOffset: 2),
      2: batch(total: 3, indices: [1]),
    });
    await expectLater(
      fetchFullOfflineEdition(api, book, 'English'),
      throwsA(isA<AppNetworkError>()),
    );
    api.close();
  });

  test('rejects a non-progressing empty response', () async {
    final api = apiFor({
      0: batch(total: 3, indices: [], nextOffset: 0),
    });
    await expectLater(fetchFullOfflineEdition(api, book, 'English'),
      throwsA(isA<AppNetworkError>()));
    api.close();
  });

  test('rejects a skipped page or bad next offset', () async {
    final api = apiFor({
      0: batch(total: 3, indices: [0], nextOffset: 2),
      2: batch(total: 3, indices: [2]),
    });
    await expectLater(fetchFullOfflineEdition(api, book, 'English'),
      throwsA(isA<AppNetworkError>()));
    api.close();
  });

  test('rejects edition changes during paginated download', () async {
    final api = apiFor({
      0: batch(total: 3, indices: [0, 1], nextOffset: 2),
      2: batch(total: 4, indices: [2, 3]),
    });
    await expectLater(fetchFullOfflineEdition(api, book, 'English'),
      throwsA(isA<AppNetworkError>()));
    api.close();
  });

  test('rejects server saying there are more pages without nextOffset', () async {
    final api = apiFor({
      0: batch(total: 3, indices: [0]),
    });
    await expectLater(fetchFullOfflineEdition(api, book, 'English'),
      throwsA(isA<AppNetworkError>()));
    api.close();
  });

  test('rejects missing and unavailable editions with a 404', () async {
    final api = SeeparahApi(client: MockClient((_) async =>
      http.Response(jsonEncode({'error': 'Unpublished'}), 404)));
    await expectLater(fetchFullOfflineEdition(api, book, 'English'),
      throwsA(isA<AppNetworkError>().having(
        (e) => e.statusCode, 'statusCode', 404,
      )));
    api.close();
  });

  test('does not make a second request for a complete one-page edition', () async {
    var requests = 0;
    final api = SeeparahApi(client: MockClient((_) async {
      requests++;
      return http.Response(jsonEncode(batch(total: 1, indices: [0])), 200);
    }));
    final copy = await fetchFullOfflineEdition(api, book, 'Urdu');
    expect(copy.pages.length, 1);
    expect(copy.language, 'Urdu');
    expect(requests, 1);
    api.close();
  });
}
