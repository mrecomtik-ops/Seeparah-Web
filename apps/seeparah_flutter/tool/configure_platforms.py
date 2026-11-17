#!/usr/bin/env python3
"""Idempotent app name/bundle identity patches for generated Flutter runners."""
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
def patch(path,old,new):
    file=ROOT/path
    if file.exists():
        text=file.read_text(encoding="utf-8")
        if old in text:file.write_text(text.replace(old,new),encoding="utf-8")
for path in ("android/app/build.gradle.kts","android/app/build.gradle"):
    patch(path,"com.seeparah.seeparah_reader","com.seeparah.reader")
android=ROOT/"android"
if android.exists():
    for activity in android.glob("**/MainActivity.kt"):
        text=activity.read_text(encoding="utf-8")
        activity.write_text(text.replace("com.seeparah.seeparah_reader",
                                         "com.seeparah.reader"),encoding="utf-8")
manifest=ROOT/"android/app/src/main/AndroidManifest.xml"
patch("android/app/src/main/AndroidManifest.xml",
      'android:label="seeparah_reader"','android:label="Seeparah"')
if manifest.exists():
    text=manifest.read_text(encoding="utf-8")
    if "android.permission.INTERNET" not in text:
        text=text.replace("<application",
          '<uses-permission android:name="android.permission.INTERNET"/>\n    <application',1)
        manifest.write_text(text,encoding="utf-8")
patch("ios/Runner.xcodeproj/project.pbxproj","com.seeparah.seeparahReader",
      "com.seeparah.reader")
patch("ios/Runner/Info.plist","seeparah_reader","Seeparah")
patch("macos/Runner/Configs/AppInfo.xcconfig","com.seeparah.seeparahReader",
      "com.seeparah.reader.macos")
patch("macos/Runner/Configs/AppInfo.xcconfig","seeparah_reader","Seeparah")
patch("windows/runner/Runner.rc","seeparah_reader","Seeparah")
print("Seeparah platform identifiers configured")
