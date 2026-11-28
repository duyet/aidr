#!/usr/bin/env python3
"""Turn `xcresulttool get test-results summary --compact` JSON into one
markdown line plus a line per failure.

usage: test-summary.py <summary.json> <label>
"""
import json
import sys

path, label = sys.argv[1:3]
s = json.load(open(path))
print(
    f"| {label} | {s.get('result')} | {s.get('passedTests')} passed | "
    f"{s.get('failedTests')} failed | {s.get('skippedTests')} skipped |"
)
for f in s.get("testFailures", []):
    print(f"| {label} failure | {f.get('testName')} | {f.get('failureText', '').strip()[:300]} | | |")
