#!/usr/bin/env python3
"""Replace production tenant domains and related identifiers for public tree. Run from repo root."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SKIP_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "cdk.out",
    ".nx",
    "tmp",
    "temp",
    "out-tsc",
    ".venv",
    "venv",
}

SKIP_SUFFIXES = (
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".lock",  # pnpm-lock can be huge; unlikely domain strings
)

# Longer / more specific first (substrings of later rules must not break).
REPLACEMENTS: list[tuple[str, str]] = [
    ("certifiedlsa@emcnotary.com", "alice@example.com"),
    ("CertifiedLSA@emcnotary.com", "noreply@example.com"),
    ("owner@emcnotary.com", "owner@example.com"),
    ("test@emcnotary.com", "test@example.com"),
    ("admin@emcnotary.com", "admin@example.com"),
    ("user@emcnotary.com", "user@example.com"),
    ("sysops@k3frame.com", "sysops@example.net"),
    ("adobe2@emcnotary.com", "user1@example.com"),
    ("adobe@emcnotary.com", "user2@example.com"),
    ("appt@emcnotary.com", "user3@example.com"),
    ("inquiry@emcnotary.com", "user4@example.com"),
    ("me@emcnotary.com", "user5@example.com"),
    ("hepefoundation.org", "example.org"),
    ("hepefoundation-org-", "example-org-"),
    ("askdaokapra.com", "example.org"),
    ("askdaokapra-com-", "example-org-"),
    ("box.k3frame.com", "box.example.net"),
    ("www.k3frame.com", "www.example.net"),
    ("k3frame.com", "example.net"),
    ("k3frame-com-", "example-net-"),
    ("emcnotary-com-", "example-com-"),
    ("emcnotary.com", "example.com"),
    ("hepe-admin-mfa", "your-aws-profile"),
]


def should_skip(path: Path) -> bool:
    parts = path.parts
    if any(p in SKIP_DIRS for p in parts):
        return True
    lower = path.name.lower()
    if lower.endswith(SKIP_SUFFIXES):
        return True
    return False


def is_probably_text(path: Path) -> bool:
    ext = path.suffix.lower()
    if ext in {".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml", ".sh", ".txt", ".html", ".toml", ".env", ".example"}:
        return True
    if path.name in {"Dockerfile", "Makefile", "LICENSE", "OWNERS", ".env.example"}:
        return True
    if ext == "" and path.name in {"graph.json", "graph-temp.json", "test-payload.json"}:
        return True
    return False


def main() -> int:
    changed = 0
    scanned = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dp = Path(dirpath)
        # prune
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".pnpm")]
        for name in filenames:
            path = dp / name
            if should_skip(path) or not is_probably_text(path):
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            scanned += 1
            orig = text
            for old, new in REPLACEMENTS:
                text = text.replace(old, new)
            if text != orig:
                path.write_text(text, encoding="utf-8", newline="\n")
                changed += 1
                print(f"updated: {path.relative_to(ROOT)}")
    print(f"scanned {scanned} text files, modified {changed}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
