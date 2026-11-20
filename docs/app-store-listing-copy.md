# Seeparah app listings — English master copy, v1.0.0

Status: **draft for store review**, not a claim of live store availability.
Do not use screenshots or promises not supported by tested native builds.

## Shared identity

- Display name: **Seeparah — Free Books**
- Developer/publisher: **Seeparah** (use the verified legal name of the registered store account)
- Android/iOS bundle: `com.seeparah.reader`
- Classification: Books / Education (select one depending on store taxonomy)
- Price: Free, no in-app purchase in this native build
- Support: https://seeparah.com/legal#support
- Privacy: https://seeparah.com/legal#privacy
- Website: https://seeparah.com
- Terms / content attribution: https://seeparah.com/legal#terms
- Current app version in source: 1.0.0+1
- Languages: list only those verified in released editions and UI; the UI is currently English-first.

## Short store description (Google Play)

Read free books and sacred texts offline, with highlights, notes and drawings.

## Promotional text (Apple, optional)

Discover multilingual books, save editions to read offline, and keep highlights, notes and handwritten marks on your device.

## Full description

Discover world literature, classics, and available sacred texts in Seeparah's free multilingual reading library.

Explore published books, browse by topic and language, and open a clean, comfortable reader. Adjust text size, switch between paper, sepia and night themes, and navigate chapters and reading pages.

Download a complete available edition while connected, then read it offline in the Seeparah app. Keep reading progress, select and highlight text, attach notes, and write or draw on the page with colored pens and an eraser. Your saved books and annotations remain on the device so you can continue without an internet connection.

Seeparah is free to use. Available languages and titles vary by book. Source and edition details are provided where available. More titles and editions may be added over time.

## Feature bullets

- Free book and sacred-text catalogue
- Multilingual editions where available
- Full-edition download for offline reading
- Reading history, bookmarks and progress saved locally
- Highlights, text notes and colored handwriting on pages
- Comfortable fonts and light, sepia or night themes

## Store review notes (draft)

- No login is required to use the core native reader.
- Internet is required to browse and download a new edition; previously downloaded
  editions can be read without internet.
- Full website-only features (e.g., verse-aligned translation comparison, author
  publishing and admin functions) are not available in the first native version.
- Any book or source complaints can be sent through the Seeparah support site.
- Editions may be withdrawn after content or licensing review.

## Required assets still to capture from the running native builds

- Real Android phone screenshots at supported store sizes (home/catalogue,
  book details, reading view, highlighted text, offline library, handwriting)
- Real iPhone/iPad screenshots, and macOS screenshots where applicable
- Microsoft Store screenshots and logo assets
- Flathub/AppStream screenshots
- Any platform-specific feature graphics or store icons
- Content/age rating and data safety/privacy forms completed from tested behavior

**Do not fabricate screenshots, ratings, store reviews, certifications,
supported languages or availability.** All submitted assets must depict the
actual application. User-owned accounts must review the required legal,
content, privacy and financial declarations.

## Free distribution channels — store-specific answers (verified from source, 2026-11-19)

Verified in `apps/seeparah_flutter/lib`: the native app only calls the public
read-only catalogue API on `https://seeparah.com` and opens seeparah.com/legal
links. No sign-in, analytics, crash reporting, ads, push, payments or Google
Mobile Services dependencies (`http`, `path_provider`, `shared_preferences`,
`url_launcher` only). Annotations, progress and offline editions stay on device.

- **Data collection / data safety:** the app itself collects no personal data
  and shares none. Network requests to seeparah.com carry standard IP/user-agent
  connection data handled under https://seeparah.com/legal#privacy.
- **Age rating questionnaire (IARC):** no violence, sexual content, gambling,
  user-to-user communication, location sharing or purchases. Religious texts are
  reference content, not user-generated. Expect an "Everyone / 3+" rating; answer the
  questionnaire honestly rather than targeting a rating.
- **Permissions:** Internet only (MSIX capability `internetClient`; Snap plug `network`).
- **Microsoft Store:** product "Seeparah", Store ID `9NWM8PBXLZ46`
  (https://apps.microsoft.com/detail/9NWM8PBXLZ46 — live only after certification).
  Identity `Seeparah.Seeparah`, publisher `CN=D42BED1A-28F5-49EA-A73D-85C8F53BA774`,
  publisher display name `Seeparah`. Package from `microsoft-store-msix.yml`
  (unsigned; Microsoft signs Store packages for free). Category: Books & reference.
  Name reservation lapses if not submitted within 3 months (by ~2027-02-19).
- **Huawei AppGallery:** no GMS code paths, so no HMS replacement work is needed;
  still requires a real-device test on a Huawei phone before claiming compatibility.
- **Samsung Galaxy Store:** requires commercial seller status with a D-U-N-S number
  even for free apps; not available to an individual publisher.
- **F-Droid:** not eligible — the repository has no free/open-source licence.
- **Flathub / Snap:** AppStream metadata in `packaging/linux/`; Snap in
  `packaging/snap/`; Flathub manifest template in `packaging/flathub/` (needs a
  public release tarball URL + SHA-256 before submission).
