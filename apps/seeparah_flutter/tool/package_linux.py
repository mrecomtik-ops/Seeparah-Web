#!/usr/bin/env python3
"""Package the tested Flutter Linux x64 build as a .deb and AppImage AppDir.

Creates staging data only; AppImage assembly is performed separately by the
official appimagetool. Neither package is a public release until QA passes.
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "build/linux/x64/release/bundle"
DIST = ROOT / "dist/linux"
ICON = ROOT / "assets/brand/app_icon_1024.png"
APP_ID = "com.seeparah.reader"
DESKTOP_ENTRY = """[Desktop Entry]
Type=Application
Name=Seeparah
Comment=Free books and offline reading
Exec=seeparah
Icon=seeparah
Terminal=false
Categories=Education;Office;
StartupNotify=true
"""

def write_text(path: Path, content: str, executable: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    if executable:
        path.chmod(0o755)

def check_inputs(version: str) -> None:
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        raise SystemExit("Version must be numeric x.y.z")
    if not (BUNDLE / "seeparah_reader").is_file():
        raise SystemExit("Missing Linux Flutter executable; build release first")
    if not (BUNDLE / "data").is_dir() or not (BUNDLE / "lib").is_dir():
        raise SystemExit("Missing Flutter data or shared libraries; refusing incomplete package")
    if not ICON.is_file():
        raise SystemExit("Missing generated Seeparah icon")

def build_deb(version: str) -> Path:
    stage = ROOT / "build/seeparah-debian-stage"
    if stage.exists():
        shutil.rmtree(stage)
    appdir = stage / "usr/lib/seeparah"
    shutil.copytree(BUNDLE, appdir)
    write_text(
        stage / "usr/bin/seeparah",
        "#!/bin/sh\nexec /usr/lib/seeparah/seeparah_reader \"$@\"\n",
        executable=True,
    )
    write_text(stage / f"usr/share/applications/{APP_ID}.desktop", DESKTOP_ENTRY)
    icon_dir = stage / "usr/share/icons/hicolor/256x256/apps"
    icon_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ICON, icon_dir / "seeparah.png")

    size_kib = sum(
        (p.stat().st_size + 1023) // 1024
        for p in stage.rglob("*") if p.is_file()
    )
    write_text(stage / "DEBIAN/control", f"""Package: seeparah
Version: {version}
Architecture: amd64
Maintainer: Seeparah
Section: education
Priority: optional
Installed-Size: {size_kib}
Depends: libgtk-3-0 | libgtk-3-0t64, libglib2.0-0 | libglib2.0-0t64, libstdc++6
Description: Seeparah free multilingual offline book reader
 Native Flutter desktop reader with downloadable books, notes and handwriting.
""")
    DIST.mkdir(parents=True, exist_ok=True)
    output = DIST / f"Seeparah-{version}-Linux-amd64.deb"
    subprocess.run(
        ["dpkg-deb", "--build", "--root-owner-group", str(stage), str(output)],
        check=True,
    )
    return output

def build_appdir(version: str) -> Path:
    appdir = ROOT / "build/Seeparah.AppDir"
    if appdir.exists():
        shutil.rmtree(appdir)
    destination = appdir / "usr/bin"
    shutil.copytree(BUNDLE, destination)
    write_text(
        appdir / "AppRun",
        '#!/bin/sh\nHERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\n'
        'exec "$HERE/usr/bin/seeparah_reader" "$@"\n',
        executable=True,
    )
    write_text(
        appdir / f"{APP_ID}.desktop",
        DESKTOP_ENTRY.replace("Exec=seeparah", "Exec=seeparah_reader"),
    )
    shutil.copy2(ICON, appdir / "seeparah.png")
    icon_dir = appdir / "usr/share/icons/hicolor/256x256/apps"
    icon_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ICON, icon_dir / "seeparah.png")
    write_text(appdir / ".release-version", version + "\n")
    return appdir

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    check_inputs(args.version)
    deb = build_deb(args.version)
    appdir = build_appdir(args.version)
    print("Debian package:", deb)
    print("AppImage staging:", appdir)
    print("AppImage still requires assembly and runtime smoke testing")

if __name__ == "__main__":
    main()
