"""Public CLI checks for the opt-in same-network demo mode."""

from pathlib import Path
import os
import subprocess
import unittest


SCRIPT = Path(__file__).with_name("demo.sh")


class LanLauncherTest(unittest.TestCase):
    def run_lan(self, address=None):
        env = os.environ.copy()
        env.pop("LAN_IP", None)
        if address is not None:
            env["LAN_IP"] = address
        return subprocess.run(
            ["bash", str(SCRIPT), "lan"],
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_address_is_required(self):
        result = self.run_lan()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("LAN_IP", result.stderr)

    def test_loopback_is_rejected(self):
        result = self.run_lan("127.0.0.1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("LAN_IP", result.stderr)


if __name__ == "__main__":
    unittest.main()
