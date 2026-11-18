#!/usr/bin/env python3
"""Strict, deterministic validation of an Apple App Store distribution profile.

Accepts a decoded .mobileprovision plist (from 'security cms -D').
Fails closed instead of uploading an IPA signed for the wrong bundle or team.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import plistlib
import re
from pathlib import Path


def validate(profile: dict, team: str, bundle_id: str) -> tuple[str, str]:
    if not re.fullmatch(r"[A-Z0-9]{10}", team):
        raise ValueError("Invalid Apple Team ID")
    if not re.fullmatch(r"[A-Za-z0-9.-]+", bundle_id):
        raise ValueError("Invalid application bundle ID")
    teams = profile.get("TeamIdentifier", [])
    if not isinstance(teams, list) or team not in teams:
        raise ValueError("Provisioning profile belongs to another Apple Team")

    entitlements = profile.get("Entitlements", {})
    if not isinstance(entitlements, dict):
        raise ValueError("Provisioning profile lacks entitlements")
    expected = f"{team}.{bundle_id}"
    if entitlements.get("application-identifier") != expected:
        raise ValueError("Provisioning profile application identifier mismatch")
    if entitlements.get("get-task-allow") is not False:
        raise ValueError("App Store profile must disallow debug attachments")
    if "ProvisionedDevices" in profile or profile.get("ProvisionsAllDevices"):
        raise ValueError("Use an App Store distribution profile, not development/ad-hoc")
    expiration = profile.get("ExpirationDate")
    if not isinstance(expiration, datetime):
        raise ValueError("Provisioning profile has no valid expiry")
    if expiration.tzinfo is None:
        expiration = expiration.replace(tzinfo=timezone.utc)
    if expiration <= datetime.now(timezone.utc):
        raise ValueError("Provisioning profile has expired")

    uuid = profile.get("UUID")
    name = profile.get("Name")
    if not isinstance(uuid, str) or not re.fullmatch(
        r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", uuid
    ):
        raise ValueError("Provisioning profile has no valid UUID")
    if not isinstance(name, str) or not name.strip() or any(x in name for x in "\r\n"):
        raise ValueError("Provisioning profile has no valid name")
    return uuid, name


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plist", required=True)
    parser.add_argument("--team", required=True)
    parser.add_argument("--bundle-id", required=True)
    parser.add_argument("--github-output")
    args = parser.parse_args()
    with Path(args.plist).open("rb") as f:
        profile = plistlib.load(f)
    uuid, name = validate(profile, args.team, args.bundle_id)
    if args.github_output:
        with Path(args.github_output).open("a", encoding="utf-8") as f:
            f.write(f"profile_uuid={uuid}\n")
            f.write(f"profile_name={name}\n")
    print(f"App Store distribution profile validated: {uuid}")


if __name__ == "__main__":
    main()
