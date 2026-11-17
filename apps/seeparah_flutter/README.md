# Seeparah native reader

Flutter 3.50 app for Android, iOS, Windows, macOS and Linux. It shares the
published catalogue and source/rights/reader access gates with the Cloudflare
website (seeparah.com). This is a native, offline-capable app, NOT a WebView.

## Implemented

- Native published-book search, sacred filter, multilingual reader.
- Local favorites, reading history, reading progress, and offline editions.
- Reader fonts, paper/sepia/night reading themes, saved text highlights/notes.
- Page-local ink pens, eraser, undo, colors, and source-based navigation.
- Published-only public API: /api/mobile/v1/books, /books/:id, and /pages.
- No store purchases, paid content, injected Supabase secret or subscription UI.

Guest-first launch: account syncing, push, inline Quran comparison, and
authenticated author/admin publishing are NOT included. Full website features
remain available on seeparah.com. Do not claim identical feature parity yet.

## Development build

Flutter 3.50.0 stable is supported. No private API keys are needed.

1. Install Flutter SDK, Android Studio (Android) and/or Xcode (iOS/macOS).
2. In this folder: python tool/generate_icons.py (requires Pillow).
3. flutter create --platforms=android,ios,macos,windows,linux --org com.seeparah --project-name seeparah_reader .
4. python tool/configure_platforms.py
5. flutter pub get
6. dart run flutter_launcher_icons
7. flutter analyze && flutter test
8. flutter run --dart-define=SEEPARAH_API_ORIGIN=https://seeparah.com

GitHub workflow flutter-multiplatform.yml compiles and tests on all five
platforms, and uploads an Android debug APK. Debug APKs are for testing only.

For actual store submission, see [the app store release runbook](../../docs/app-store-release.md)
and [listing copy](../../docs/app-store-listing-copy.md). A separate manually triggered
`android-play-internal.yml` workflow can upload a **signed AAB** to the Google
Play internal test track, once the app, owner-managed keystore and protected
store credentials are configured. It does not publish directly to production.

## Store account and signing requirements

Apple: owner Apple Developer Program membership, App Store Connect app
creation, App Distribution certificate and provisioning profile, device tests
and privacy answers. Google: Play Console developer account, Play App Signing,
release upload keystore, signed AAB, listing, Data Safety, screenshots and
test track (including closed test where applicable). Do not put any signing
certificate or passwords into Git.

Android applicationId / iOS bundleId: com.seeparah.reader. App version 1.0.0,
build 1. For review, unauthenticated demo mode is the full reader experience.

Other platforms: Windows will offer both a signed direct `.exe` setup
installer and Microsoft Store listing (Microsoft accepts compliant signed
Win32 EXE/MSI submissions). Linux will offer both Flathub and tested direct
`.AppImage` / `.deb` downloads; a Windows `.exe` does not natively run
on Linux. macOS is distributed through the Mac App Store. QA-only desktop
installers can be built using `.github/workflows/desktop-installers.yml`,
but must not be published before signing/compatibility/release review.
Android APK may be submitted separately to Galaxy Store or other compatible
stores after their requirements are met. Existing website supports browsers and
ChromeOS; native Flutter web is not deployed to replace it.

## Protected desktop production release

QA assets are not public downloads. After the owner has obtained a trusted
Windows code-signing certificate, configured the protected GitHub environment,
approved rights and completed real-device QA, the manually triggered
`desktop-production-release.yml` workflow signs all Windows executables,
verifies the signed setup installer, tests native Windows/Linux packages,
and creates a **draft** GitHub release with SHA-256 checksums. Only the owner
may publish that draft and activate website download links.
See [desktop release instructions](../../docs/app-store-release.md).

## Store listing draft

Title: Seeparah — Free Books & Reading

Short description: Free classics and sacred texts in their available
languages, with an offline reader, highlights and notes.

Full description:
Discover literature, world classics and sacred source texts in Seeparah's
free multilingual library. Browse published books, choose an available
language, and read in a comfortable native reader with adjustable font,
light/sepia/night themes, chapter navigation and persistent progress.
Download a full edition for reading offline. Save favorites, highlight
passages, keep notes and write on pages in different ink colors.
No subscription required. Source attributions are linked to original
editions. Books and languages are added over time.

Privacy policy: https://seeparah.com/legal#privacy
Support: https://seeparah.com/legal#support
Terms: https://seeparah.com/legal#terms
Website: https://seeparah.com

## Publication release gate

- No store submission or approval is claimed by this build.
- Confirm copyright/source rights and document each release provenance.
- Confirm actual platform build outputs from GitHub Actions.
- Validate on physical phones and tablets: TalkBack, VoiceOver, RTL and CJK
  text, long content, offline recovery, high-contrast and responsive layout.
- Verify app/website store privacy policy, accessibility and device data
  handling, screenshots, brand rights and local regulations.
- Obtain owner authorization for store-account enrollments, any required
  fees, terms, signed binaries and final public submission.
