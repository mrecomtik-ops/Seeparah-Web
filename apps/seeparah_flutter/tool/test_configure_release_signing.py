#!/usr/bin/env python3
"""Regression tests for the fail-closed Android release-signing injection."""
import unittest

from configure_release_signing import configure


class ConfigureReleaseSigningTests(unittest.TestCase):
    SAMPLE = """
android {
    namespace = "com.seeparah.reader"
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}
"""

    def test_replaces_debug_signing_with_private_release_key(self):
        result = configure(self.SAMPLE)
        self.assertIn('create("seeparahRelease")', result)
        self.assertIn('signingConfig = signingConfigs.getByName("seeparahRelease")', result)
        self.assertNotIn('signingConfig = signingConfigs.getByName("debug")', result)
        self.assertIn("SEEPARAH_ANDROID_KEYSTORE_PATH", result)
        self.assertNotIn("my-password", result)

    def test_missing_expected_template_fails_closed(self):
        with self.assertRaises(ValueError):
            configure("android { buildTypes { release {} } }")

    def test_never_patches_twice(self):
        with self.assertRaises(ValueError):
            configure(configure(self.SAMPLE))


if __name__ == "__main__":
    unittest.main()
