"""Deterministic look-ahead linter.

Per Agent 35 §9: leaks are a rule-based problem. LLM adds nothing. The lint
catches static patterns; runtime invariants in timeframe.assert_no_future
catch dynamic ones.

Forbidden patterns scanned by this linter:
    1. `full_df[...]` reads outside the frame_materializer module
    2. `datetime.now()` ANYWHERE in the replay engine codebase
    3. `df.shift(-N)` in indicator code (negative shift = future leak)
    4. `pd.Timestamp.now()` ANYWHERE
    5. Bare `df['ts'] <= var` filters (must go through materialize_frame)

Run with:
    python -m replay_engine.shared.audit
or via pytest:
    pytest tests/test_audit.py
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class AuditFinding:
    file: Path
    line_no: int
    pattern: str
    line_text: str
    severity: str  # 'fatal' | 'warn'


# (regex, description, severity)
FORBIDDEN_PATTERNS: list[tuple[str, str, str]] = [
    (r"\bdatetime\.now\(\)", "datetime.now() — use t_now parameter", "fatal"),
    (r"\bpd\.Timestamp\.now\(\)", "pd.Timestamp.now() — use t_now parameter", "fatal"),
    (r"\.shift\(\s*-\d+", "negative df.shift() — future leak", "fatal"),
    (r"\bfull_df\b\[", "raw full_df indexing — must go through materialize_frame", "warn"),
    # Bare timestamp filters are warn rather than fatal because some legitimate
    # uses exist in test fixtures. Production code must use materialize_frame.
    (r"\bdf\[['\"]ts['\"]?\s*[<>=]", "raw timestamp filter — use materialize_frame", "warn"),
]

# Files exempt from specific patterns
EXEMPT_FILES = {
    "shared/timeframe.py",  # owns the frame_df materialization
    "tests/",                # test fixtures may use raw filters
}


def is_exempt(path: Path, pattern: str) -> bool:
    path_str = str(path).replace("\\", "/")
    for exempt in EXEMPT_FILES:
        if exempt in path_str:
            return True
    return False


def audit_file(path: Path) -> list[AuditFinding]:
    findings: list[AuditFinding] = []
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return findings

    for line_no, line in enumerate(text.splitlines(), start=1):
        # Skip comment-only lines (still scan inline comments though — those can hide leaks)
        stripped = line.strip()
        if stripped.startswith("#"):
            continue

        for pattern_re, description, severity in FORBIDDEN_PATTERNS:
            if re.search(pattern_re, line):
                if is_exempt(path, pattern_re):
                    continue
                findings.append(
                    AuditFinding(
                        file=path,
                        line_no=line_no,
                        pattern=description,
                        line_text=line.rstrip(),
                        severity=severity,
                    )
                )

    return findings


def audit_directory(root: Path) -> list[AuditFinding]:
    findings: list[AuditFinding] = []
    for py in root.rglob("*.py"):
        # Skip venvs and caches
        if any(part in {".venv", "venv", "__pycache__", "build", "dist"} for part in py.parts):
            continue
        findings.extend(audit_file(py))
    return findings


def main() -> int:
    repo_root = Path(__file__).resolve().parents[3]
    findings = audit_directory(repo_root / "src")

    if not findings:
        print("Look-ahead audit: clean (0 findings)")
        return 0

    fatal_count = sum(1 for f in findings if f.severity == "fatal")
    warn_count = sum(1 for f in findings if f.severity == "warn")

    print(f"Look-ahead audit: {fatal_count} fatal, {warn_count} warn")
    print()
    for f in findings:
        rel = f.file.relative_to(repo_root)
        print(f"  [{f.severity.upper()}] {rel}:{f.line_no}")
        print(f"    pattern: {f.pattern}")
        print(f"    line:    {f.line_text}")
        print()

    return 1 if fatal_count > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
