import 'api.dart';
import 'models.dart' as sp;

/// Download a complete public edition before committing it to device storage.
///
/// The source endpoint can change or fail while a large edition downloads.
/// Never persist partial, duplicated, or non-progressing page responses.
Future<sp.OfflineCopy> fetchFullOfflineEdition(
  SeeparahApi api,
  sp.Book book,
  String language, {
  void Function(double value)? onProgress,
}) async {
  final pages = <sp.Page>[];
  final toc = <sp.TocItem>[];
  final seenIndices = <int>{};
  var offset = 0;
  var expectedTotal = -1;

  while (true) {
    final batch = await api.pages(book.id, language, offset);
    if (expectedTotal < 0) {
      expectedTotal = batch.total;
      if (expectedTotal <= 0 || expectedTotal > 20000) {
        throw const AppNetworkError(
          'This edition is not eligible for offline storage.',
        );
      }
    } else if (batch.total != expectedTotal) {
      throw const AppNetworkError(
        'This edition changed during download. Retry from the beginning.',
      );
    }

    if (batch.pages.isEmpty || batch.pages.length > 12 ||
        pages.length + batch.pages.length > expectedTotal) {
      throw const AppNetworkError(
        'The downloaded edition is incomplete or invalid.',
      );
    }
    for (final page in batch.pages) {
      if (page.index < 0 || !seenIndices.add(page.index)) {
        throw const AppNetworkError(
          'The downloaded edition contains repeated or invalid pages.',
        );
      }
    }
    pages.addAll(batch.pages);
    if (offset == 0) toc.addAll(batch.toc);
    onProgress?.call(pages.length / expectedTotal);

    if (pages.length == expectedTotal) {
      if (batch.nextOffset != null && batch.nextOffset! < expectedTotal) {
        throw const AppNetworkError('Invalid final page offset.');
      }
      return sp.OfflineCopy(
        book, language, pages, toc, DateTime.now().toUtc().toIso8601String(),
      );
    }
    final next = batch.nextOffset;
    if (next == null || next != offset + batch.pages.length ||
        next <= offset || next >= expectedTotal) {
      throw const AppNetworkError(
        'This edition returned an invalid next page. Try again.',
      );
    }
    offset = next;
  }
}
