# Seeparah — native app store release runbook

**Status (17 November 2026):** Native Flutter app code and multi-platform CI
exist. There are **no verified public store listings or signed public installers**.
The website's /download page therefore correctly labels all native apps
"Not released yet." Do not add placeholder or guessed store URLs.

## Public distribution plan

| Platform | First release channel | Additional channel | Current prerequisite |
| --- | --- | --- | --- |
| Android / compatible ChromeOS | Google Play | Galaxy Store, signed APK on Seeparah (optional) | Play developer account, app, release signing, testing |
| iPhone / iPad | Apple App Store | TestFlight for QA | Apple Developer Program, signing, review |
| macOS | Mac App Store | signed/notarized DMG via Seeparah | separate macOS app identity, signing, sandbox + notarization |
| Windows | Microsoft Store **and** signed direct `.exe` | Same tested installer via Seeparah download page | Partner Center; per-user Inno Setup installer; publisher signing and review |
| Linux | Flathub **and** direct `.AppImage` / `.deb` | Official Linux-native downloads on Seeparah | Flatpak manifest/review; verified and tested AppImage/deb packages |

The browser/PWA continues to serve ChromeOS and other browsers; **PWA
installation currently does not save full book editions offline**. Mobile
guest-first app saves its complete edition, highlights/notes/handwriting and
progress to the local device. Cross-device sync is not shipped. Store marketing
must not claim full website feature parity.

## 1. Google Play

1. Owner registers/verifies a [Play Console](https://play.google.com/console/)
   developer account, accepts its terms and pays any applicable fees.
2. Create a **free app** named Seeparah with Android package
   **`com.seeparah.reader`**. Complete app access, data safety, content
   rating, target audience, ads, privacy policy and required declarations.
3. Enroll in Play App Signing. Owner creates and **retains a backup** of the
   unique upload keystore and records its alias/password in a secure manager.
   Configure Google Play to recognize this upload key. NEVER commit the
   keystore, private keys, Play service-account JSON or passwords.
4. Grant a purpose-limited Play Console service account the minimum release
   permissions for the app and internal testing. In GitHub, create protected
   environment `seeparah-store-internal` with required reviewers; add these
   environment secrets:
   - `SEEPARAH_ANDROID_KEYSTORE_B64` (base64 of the upload .jks)
   - `SEEPARAH_ANDROID_STORE_PASSWORD`
   - `SEEPARAH_ANDROID_KEY_ALIAS`
   - `SEEPARAH_ANDROID_KEY_PASSWORD`
   - `SEEPARAH_PLAY_SERVICE_ACCOUNT_JSON`
5. For the first-ever release, create and upload the app package in Play Console
   manually if needed to establish the package before Android Publisher API
   uploads are accepted. Then on the **main** branch, run
   `.github/workflows/android-play-internal.yml` manually with increasing
   numeric `version_code` and release `version_name`. The workflow fails
   closed without signing, tests Flutter, builds a signed AAB, and uploads
   to the **internal testing** track, not production. Only enable it after
   Play Console has registered the app and granted the service-account access.
6. Check the upload in Play Console and test on physical Android devices.
   Resolve all errors and any required closed-testing eligibility before
   promoting the approved build to production. New personal accounts may
   have additional closed testing requirements.

## 2. iOS App Store and macOS App Store

1. Owner enrolls an Apple Developer Program team and sets up
   [App Store Connect](https://appstoreconnect.apple.com/).
2. Reserve Seeparah and register iOS bundle ID `com.seeparah.reader`,
   macOS bundle ID `com.seeparah.reader.macos` (subject to App Store
   Connect identity availability); associate signing and capabilities.
3. Generate a proper iOS **distribution** archive and an Apple-signed IPA
   using Xcode/Flutter plus team provisioning. The repo's current CI compiles
   iOS **without signing**, which is NOT an uploadable App Store release.
   Submit signed test builds to TestFlight, carry out real-device QA, then
   complete the App Store listing, privacy disclosures and review.
4. macOS additionally requires appropriate sandbox entitlements and
   distribution signing for Mac App Store; for direct distribution, use
   Developer ID signing and notarization. Current raw macOS CI output
   is not a publicly distributable notarized release.
5. When an authorized App Store Connect session or narrowly scoped API
   access is available, automate uploads using an approved release workflow.
   Never store an Apple private key in Git or an unprotected CI variable.

## 3. Microsoft Store **and** Windows direct EXE

1. Owner verifies a Microsoft Partner Center developer account and reserves
   Seeparah. The Microsoft Store accepts both MSIX and compatible signed
   MSI/EXE Win32 installers; Seeparah's chosen desktop path is a **signed
   Inno Setup `.exe` installer** that can be offered directly and submitted
   as an unpackaged Win32 app, once store-specific requirements are met.
2. Repository `apps/seeparah_flutter/packaging/windows/Seeparah.iss` builds
   the full Flutter Windows distribution into
   `Seeparah-<version>-Windows-x64-Setup.exe`. Windows Flutter's original
   `seeparah_reader.exe` is **not** a standalone installer: it needs bundled
   data and DLLs, which the setup package includes.
3. The `.github/workflows/desktop-installers.yml` workflow produces a
   **QA-only, currently unsigned** EXE setup artifact. Sign the Windows
   application/installer using an authorized publisher certificate, then
   test installation, silent installation, launch, reading offline, update,
   and uninstall on clean Windows machines. Do not distribute the unsigned
   QA artifact as the production installer.
4. Complete Microsoft Store listing, age/privacy disclosures and Win32
   installer certification, including silent install behavior. Submit
   through Partner Center and obtain approval.
5. Publish the **same fully tested signed installer** directly on
   `seeparah.com/download` using a versioned HTTPS URL, SHA-256 checksum
   and publisher information. Do not expose any installation link until
   the release is verified. A separate MSIX build can be considered later,
   but is not a prerequisite for the direct EXE.

## 4. Linux Flathub **and** direct download

1. Linux does not natively use Windows `.exe` installers. Use an
   executable `.AppImage` for a one-file download (Linux equivalent), and
   a native `.deb` for Ubuntu/Debian systems.
2. Repository `apps/seeparah_flutter/tool/package_linux.py` assembles
   a Debian package and an AppImage staging directory from the **complete**
   Flutter Linux bundle. `.github/workflows/desktop-installers.yml`
   builds the `.deb` and attempts to assemble the `.AppImage` using
   appimagetool. These are QA artifacts, not verified public releases.
3. Validate both on real clean supported Linux distributions, including
   shared-library compatibility, GTK, offline start, fonts, storage and
   installer/uninstaller behavior. Provide SHA-256 and minimum OS/runtime
   requirements. Test AppImage from a downloaded location (with executable
   permissions) rather than only inside the CI runner.
4. Separately prepare a reproducible Flatpak manifest, metadata, icons,
   screenshots and the required runtime dependencies. Submit for official
   Flathub review and approval.
5. Once each channel is verified, include Flathub listing and two direct
   buttons, **Download AppImage** and **Download .deb**, on
   `seeparah.com/download`. The direct packages do not have to wait for
   Flathub's approval, but must pass the same release QA and rights checks.

## Release acceptance checks (all platforms)

- Verify guest flows, full-book **offline** download and restart in airplane
  mode, language-specific edition download, complete TOC and every book page.
- Verify highlight, note, pen/eraser and progress durability across force-close,
  restart and device reboot, and removal of saved copies.
- Validate long books, memory/disk limits, Arabic/Urdu RTL, Indic and CJK
  fonts, TalkBack/VoiceOver, physical phone and tablet layouts.
- Confirm all exposed source editions may lawfully be *redistributed offline*;
  handle reported rights-risk books and any edition withdrawal/updates.
- Audit app network data and storage to complete Apple privacy / Google
  Data Safety fields accurately. The current app contacts `seeparah.com`
  for catalogue and pages, and stores notes locally. Do **not** infer that
  "no data is collected" merely from local persistence.
- Confirm version and identity, store-compliant screenshot assets and icon,
  app review credentials if ever required (guest mode currently works),
  ratings, listing text and contact/support/privacy URLs.
- Record published product/listing IDs and reviewed URL destinations in the
  website application. Deploy and verify /download only **after** they work.

## Submission owner actions

To progress past CI compilation, the owner must activate developer accounts,
accept store contracts, provide signing/authorization through protected
account settings and approve any paid enrollment, certification or submission.
The repository by itself cannot create an approved store listing or bypass
store review.

Reference official guidance:
- [Google Play create app](https://support.google.com/googleplay/android-developer/answer/9859152)
- [Google Play release](https://support.google.com/googleplay/android-developer/answer/9859348)
- [Apple submit for review](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/)
- [Microsoft Store distribution](https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store)
- [Flathub submission](https://docs.flathub.org/docs/for-app-authors/submission)
