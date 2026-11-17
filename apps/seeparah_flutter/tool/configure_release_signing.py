#!/usr/bin/env python3
"""Configure a *generated* Flutter Android Gradle Kotlin project for release signing.

Invoked only by the protected Play Store upload workflow after Flutter
generates its platform runners. Never writes credentials into source files.
Fails if the Flutter template changes rather than shipping a debug-signed AAB.
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GRADLE = ROOT / "android" / "app" / "build.gradle.kts"
REQUIRED = (
    "SEEPARAH_ANDROID_KEYSTORE_PATH",
    "SEEPARAH_ANDROID_STORE_PASSWORD",
    "SEEPARAH_ANDROID_KEY_ALIAS",
    "SEEPARAH_ANDROID_KEY_PASSWORD",
)

def configure(text: str) -> str:
    anchor = "    buildTypes {"
    debug_line = 'signingConfig = signingConfigs.getByName("debug")'
    if text.count(anchor) != 1 or text.count(debug_line) != 1:
        raise ValueError("Unsupported Flutter Android Gradle template; release signing not configured")
    config = '''    signingConfigs {
        create("seeparahRelease") {
            storeFile = file(System.getenv("SEEPARAH_ANDROID_KEYSTORE_PATH")
                ?: error("Missing Android upload keystore"))
            storePassword = System.getenv("SEEPARAH_ANDROID_STORE_PASSWORD")
                ?: error("Missing store password")
            keyAlias = System.getenv("SEEPARAH_ANDROID_KEY_ALIAS")
                ?: error("Missing upload key alias")
            keyPassword = System.getenv("SEEPARAH_ANDROID_KEY_PASSWORD")
                ?: error("Missing upload key password")
        }
    }

'''
    return text.replace(anchor, config + anchor, 1).replace(
        debug_line,
        'signingConfig = signingConfigs.getByName("seeparahRelease")', 1,
    )

def main() -> None:
    missing = [name for name in REQUIRED if not os.environ.get(name)]
    if missing:
        raise SystemExit("Missing release signing inputs: " + ", ".join(missing))
    keystore = Path(os.environ["SEEPARAH_ANDROID_KEYSTORE_PATH"])
    if not keystore.is_file() or keystore.stat().st_size == 0:
        raise SystemExit("Android upload keystore not present")
    if not GRADLE.is_file():
        raise SystemExit("Flutter Android Kotlin Gradle runner was not generated")
    try:
        modified = configure(GRADLE.read_text(encoding="utf-8"))
    except ValueError as error:
        raise SystemExit(str(error)) from error
    GRADLE.write_text(modified, encoding="utf-8")
    print("Configured Android release signing (no credentials written to source)")

if __name__ == "__main__":
    main()
