# Seeparah SP-01 — Live Mobile QA Execution (5 November 2026)

**Production target:** https://seeparah.com  
**Execution:** Authorized Windows workstation via VS Code-compatible Node/Playwright test runner and locally installed Android SDK Pixel_7 emulator.  
**Policy:** Read-only testing of public routes. No account writes, sacred text edits, Supabase configuration changes, Cloudflare binding changes, or deployment manually initiated by the QA scripts.

## Completed observations

| Test | Result | Evidence |
| --- | --- | --- |
| Desktop Google Chrome with 320, 375, 390 and 430 CSS px touch viewports | **18 / 18 passed** | Library; Jekyll & Hyde; Qur'an Arabic and Urdu; Genesis Hebrew; Matthew Greek; Analects Chinese; only selected editions repeated at each viewport; no document-level horizontal overflow; original text present after waiting for content (not loading UI). |
| Real Google Chrome for Android on SDK Pixel_7 emulator | **5 / 5 passed** | Arabic, Urdu, Hebrew, Greek and Chinese source labels and glyph boxes present at 411 CSS px; no overflow; English source metadata unaffected; Android user agent confirmed. |
| Browser Study-mode inspect at 390 CSS px | **4 / 4 passed** | Qur'an Arabic, Qur'an Urdu, Genesis Hebrew, Matthew Greek; English reference/copy controls had effective `lang="en"` and each control measured at least 24×24 CSS pixels. |
| Native Android TalkBack service | **Installed and enabled** | `dumpsys accessibility` showed `com.google.android.marvin.talkback.TalkBackService` in enabled and binding services. This alone does not verify announced speech. |
| Multiscript web font loading | **Observed** | Noto Naskh Arabic, Noto Nastaliq Urdu and Noto Serif Hebrew loaded in Chromium and Android Chrome; source RTL direction correct for Arabic, Urdu and Hebrew. Greek and Chinese source sections rendered inside the available width, but no dedicated downloadable font was reported for those samples. |

The initial smoke pass captured transitional "Loading sacred-text section…" screens, which would have caused **false failures**. The corrected pass explicitly waits for the original-language DOM section or reader settings before inspecting and capturing screenshots.

**Local output:** `C:\Users\LOQ\develop\Seeparah-42-browser-qa\mobile-evidence-20261105\` includes 18 screenshots, `results.json`, and `study-results.json`. These files are local QA evidence and are not deployed or uploaded to production.

## Repeatable GitHub validation

The repository already contains dedicated public reader checks for Chromium, WebKit, native browser zoom, Android Chrome emulator and iOS Safari Simulator. This change adds `scripts/qa/public-reader-language-parts.mjs` and wires it into `.github/workflows/public-reader-chromium.yml` to automatically test **eight cases** (four original-language editions × 320/390px), covering source-language preservation, Study controls' `lang="en"`, minimum 24px target geometry, and no horizontal overflow.

## Strict acceptance boundary

The above are **emulated-device/browser and Android accessibility-service** results. They do **not** establish correct spoken VoiceOver/TalkBack announcements or on-device typography on **physical iPhone and Android hardware**. A physical iPhone Safari VoiceOver pass and a physical Android Chrome TalkBack pass, including live language switching and announcement pronunciation on representative samples, remain required before closing SP-01.

**Original 36-item audit register:** remain **35/36 accepted; SP-01 is open pending physical-device speech and font acceptance.** Do not represent an emulator, Safari simulator, or running TalkBack service as physical-device acceptance.
