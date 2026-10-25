import importlib.util
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET

SPEC = importlib.util.spec_from_file_location(
    "verify_instrumentation", Path(__file__).with_name("verify_instrumentation.py")
)
verification = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verification)


class InstrumentationReportsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for shard in range(4):
            self.write(shard, "app", [("ExampleTest", f"case{shard}")])
        for module in verification.LIBRARY_MODULES:
            self.write(0, module, [(f"{module}.Test", "libraryCase")])
        self.write(4, "app", [(verification.LYRICS_CLASS, name) for name in verification.LYRICS_CASES])
        self.write(5, "app", [(verification.ROTATION_CLASS, name) for name in verification.ROTATION_CASES])

    def write(self, shard, module, cases, skipped=False):
        output = self.root / f"android-instrumented-test-reports-{shard}" / module
        output /= "build/outputs/androidTest-results/connected/debug"
        output.mkdir(parents=True, exist_ok=True)
        suite = ET.Element("testsuite")
        for class_name, name in cases:
            case = ET.SubElement(suite, "testcase", classname=class_name, name=name)
            if skipped:
                ET.SubElement(case, "skipped")
        ET.ElementTree(suite).write(output / "TEST-result.xml")

    def test_accepts_complete_disjoint_test_routes(self):
        inventory = verification.validate_reports(self.root)
        self.assertEqual(len(inventory["app"]), 9)
        self.assertEqual(len(inventory["libraries"]), 3)

    def test_rejects_duplicate_shared_cases(self):
        self.write(1, "app", [("ExampleTest", "case0")])
        with self.assertRaisesRegex(ValueError, "duplicate"):
            verification.validate_reports(self.root)

    def test_rejects_missing_lane(self):
        path = self.root / "android-instrumented-test-reports-3"
        (path / "app/build/outputs/androidTest-results/connected/debug/TEST-result.xml").unlink()
        with self.assertRaisesRegex(ValueError, "no app test"):
            verification.validate_reports(self.root)

    def test_rejects_host_class_in_shared_shard(self):
        self.write(1, "app", [(verification.LYRICS_CLASS, "unexpected")])
        with self.assertRaisesRegex(ValueError, "dedicated host"):
            verification.validate_reports(self.root)

    def test_rejects_skipped_host_case(self):
        self.write(5, "app", [(verification.ROTATION_CLASS, name) for name in verification.ROTATION_CASES], skipped=True)
        with self.assertRaisesRegex(ValueError, "did not pass"):
            verification.validate_reports(self.root)

    def test_rejects_library_tests_outside_first_shard(self):
        self.write(2, "modules/database", [("DatabaseTest", "case")])
        with self.assertRaisesRegex(ValueError, "library tests"):
            verification.validate_reports(self.root)


if __name__ == "__main__":
    unittest.main()
