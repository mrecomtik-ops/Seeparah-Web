#!/usr/bin/env python3
from datetime import datetime, timedelta, timezone
import unittest

from verify_ios_release_profile import validate

TEAM = "A1B2C3D4E5"
BUNDLE = "com.seeparah.reader"


def profile(**changes):
    value = {
        "UUID": "ceead2c4-a580-4ac6-92b2-ae68b6950ca6",
        "Name": "Seeparah App Store distribution",
        "TeamIdentifier": [TEAM],
        "ExpirationDate": datetime.now(timezone.utc) + timedelta(days=50),
        "Entitlements": {
            "application-identifier": TEAM + "." + BUNDLE,
            "get-task-allow": False,
        },
    }
    value.update(changes)
    return value


class AppleProfileVerifierTests(unittest.TestCase):
    def test_valid_app_store_profile(self):
        uuid, name = validate(profile(), TEAM, BUNDLE)
        self.assertEqual(uuid, profile()["UUID"])
        self.assertEqual(name, "Seeparah App Store distribution")

    def test_wrong_team(self):
        with self.assertRaisesRegex(ValueError, "another Apple Team"):
            validate(profile(), "F1E2D3C4B5", BUNDLE)

    def test_wrong_bundle(self):
        with self.assertRaisesRegex(ValueError, "application identifier"):
            validate(profile(), TEAM, "com.seeparah.other")

    def test_expired(self):
        with self.assertRaisesRegex(ValueError, "expired"):
            validate(profile(ExpirationDate=datetime.now(timezone.utc)-timedelta(days=1)), TEAM, BUNDLE)

    def test_not_distribution(self):
        with self.assertRaisesRegex(ValueError, "App Store distribution"):
            validate(profile(ProvisionedDevices=["test-device"]), TEAM, BUNDLE)

    def test_debug_profile(self):
        with self.assertRaisesRegex(ValueError, "debug"):
            validate(profile(Entitlements={
                "application-identifier": TEAM+"."+BUNDLE,
                "get-task-allow": True,
            }), TEAM, BUNDLE)

    def test_legacy_invalid_uuid(self):
        with self.assertRaisesRegex(ValueError, "UUID"):
            validate(profile(UUID="invalid"), TEAM, BUNDLE)


if __name__ == "__main__":
    unittest.main()
