import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:seeparah_reader/api.dart';
import 'package:seeparah_reader/local_library.dart';
import 'package:seeparah_reader/main.dart';
import 'package:seeparah_reader/screens.dart';

/// Captures Microsoft Store screenshots from the REAL app running against the
/// live seeparah.com catalogue. Nothing is mocked or drawn by hand: each PNG is
/// the app's own rendered frame at 1920x1080 (logical px, pixel ratio 1).
///
/// Run: flutter test integration_test/store_screenshots_test.dart -d windows
///        --dart-define=SCREENSHOT_DIR=<absolute output dir>
const _outDir = String.fromEnvironment('SCREENSHOT_DIR');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('capture store screenshots from the live app', (tester) async {
    expect(_outDir, isNotEmpty, reason: 'Pass --dart-define=SCREENSHOT_DIR');
    Directory(_outDir).createSync(recursive: true);

    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final boundaryKey = GlobalKey();
    final library = await LocalLibrary.open();
    final api = SeeparahApi();
    addTearDown(api.close);

    Future<void> settle([int seconds = 4]) async {
      for (var i = 0; i < seconds * 4; i++) {
        await tester.pump(const Duration(milliseconds: 250));
      }
    }

    Future<void> waitFor(Finder finder, {int seconds = 40}) async {
      for (var i = 0; i < seconds * 4; i++) {
        await tester.pump(const Duration(milliseconds: 250));
        if (finder.evaluate().isNotEmpty) return;
      }
      expect(finder, findsWidgets);
    }

    Future<void> shot(String name) async {
      await settle(3); // let network images and transitions finish
      await tester.runAsync(() async {
        final boundary = boundaryKey.currentContext!.findRenderObject()!
            as RenderRepaintBoundary;
        final image = await boundary.toImage(pixelRatio: 1.0);
        final data = await image.toByteData(format: ui.ImageByteFormat.png);
        File('$_outDir/$name.png').writeAsBytesSync(data!.buffer.asUint8List());
        // ignore: avoid_print
        print('SCREENSHOT $name ${image.width}x${image.height}');
      });
    }

    await tester.pumpWidget(RepaintBoundary(
      key: boundaryKey,
      child: SeeparahApp(api: api, library: library),
    ));

    // 1. Discover: live catalogue.
    await waitFor(find.byType(BookCard));
    await shot('01-discover');

    // 2. Sacred texts tab.
    await tester.tap(find.text('Sacred texts').first);
    await settle(1);
    await waitFor(find.text('SACRED TEXT'));
    await shot('02-sacred-texts');

    // 3. Book details for the first sacred text.
    await tester.tap(find.text('SACRED TEXT').first);
    await waitFor(find.text('Start reading'));
    await shot('03-book-details');

    // 4. Save the edition offline (real download from the live API).
    final saveButton = find.text('Save full book offline');
    if (saveButton.evaluate().isNotEmpty) {
      await tester.tap(saveButton);
      await waitFor(find.text('Saved offline'), seconds: 120);
    }

    // 5. Reader.
    await tester.tap(find.text('Start reading'));
    await waitFor(find.textContaining('Page 1 of'));
    await shot('04-reader');

    // 6. Sepia theme via the real Reader theme menu.
    await tester.tap(find.byTooltip('Reader theme'));
    await settle(1);
    await tester.tap(find.text('Sepia').last);
    await shot('05-reader-sepia');

    // 7. My library shows the offline copy.
    await tester.pageBack();
    await settle(1);
    await tester.pageBack();
    await settle(1);
    await tester.tap(find.text('My library').first);
    await shot('06-my-library-offline');
  });
}
