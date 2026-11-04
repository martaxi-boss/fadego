#!/usr/bin/env python3
"""Read-only metadata/format guard for FADEGO Gmail secrets on the existing root vault.

Never output token values, never source shell variables or contact Google.
CI uses only --self-test with synthetic values.
"""
from __future__ import annotations

import os
import re
import stat
import sys
import tempfile
from pathlib import Path

VAULT_FILE = Path("/root/project-secrets/fadego-gmail/oauth.env")
KEYS = {
    "GOOGLE_GMAIL_CLIENT_ID",
    "GOOGLE_GMAIL_CLIENT_SECRET",
    "GMAIL_TOKEN_ENCRYPTION_SECRET",
    "GMAIL_LIVE_SEND_ENABLED",
    "BOOKING_EMAIL_PROVIDER",
}


def protected(path: Path, mode: int, uid: int, *, directory: bool) -> bool:
    try:
        st = path.lstat()
    except OSError:
        return False
    return (
        st.st_uid == uid
        and stat.S_IMODE(st.st_mode) == mode
        and (stat.S_ISDIR(st.st_mode) if directory else
             stat.S_ISREG(st.st_mode) and st.st_nlink == 1)
    )


def vault_is_ready(path: Path = VAULT_FILE, owner_uid: int = 0) -> bool:
    if not protected(path.parent.parent, 0o700, owner_uid, directory=True):
        return False
    if not protected(path.parent, 0o700, owner_uid, directory=True):
        return False
    if not protected(path, 0o600, owner_uid, directory=False):
        return False
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    except OSError:
        return False
    try:
        st = os.fstat(fd)
        if not (stat.S_ISREG(st.st_mode) and st.st_nlink == 1
                and st.st_uid == owner_uid and
                stat.S_IMODE(st.st_mode) == 0o600 and 1 <= st.st_size <= 8192):
            return False
        raw = os.read(fd, 8193)
    except OSError:
        return False
    finally:
        os.close(fd)
    if len(raw) > 8192:
        return False
    try:
        source = raw.decode("utf-8")
    except UnicodeDecodeError:
        return False
    parsed: dict[str, str] = {}
    for row in source.splitlines():
        name, separator, value = row.partition("=")
        if not separator or not value or name not in KEYS or name in parsed:
            return False
        if any(ord(char) < 33 or ord(char) > 126 for char in value):
            return False
        parsed[name] = value
    if set(parsed) != KEYS:
        return False
    if not re.fullmatch(r"[A-Za-z0-9._-]+\.apps\.googleusercontent\.com",
                        parsed["GOOGLE_GMAIL_CLIENT_ID"]):
        return False
    if len(parsed["GOOGLE_GMAIL_CLIENT_SECRET"]) < 12:
        return False
    if len(parsed["GMAIL_TOKEN_ENCRYPTION_SECRET"].encode()) < 32:
        return False
    return (parsed["GMAIL_LIVE_SEND_ENABLED"] == "false"
            and parsed["BOOKING_EMAIL_PROVIDER"] == "disabled")


def self_test() -> bool:
    uid = os.getuid()
    with tempfile.TemporaryDirectory() as folder:
        base = Path(folder) / "project-secrets"
        base.mkdir(mode=0o700)
        pilot = base / "fadego-gmail"
        pilot.mkdir(mode=0o700)
        sample = pilot / "oauth.env"
        safe = (
            "GOOGLE_GMAIL_CLIENT_ID=ci.apps.googleusercontent.com\n"
            "GOOGLE_GMAIL_CLIENT_SECRET=ci-fake-secret-12345678\n"
            "GMAIL_TOKEN_ENCRYPTION_SECRET=" + "x" * 64 + "\n"
            "GMAIL_LIVE_SEND_ENABLED=false\n"
            "BOOKING_EMAIL_PROVIDER=disabled\n"
        )
        sample.write_text(safe, encoding="utf-8")
        sample.chmod(0o600)
        if not vault_is_ready(sample, uid):
            return False
        sample.chmod(0o644)
        if vault_is_ready(sample, uid):
            return False
        sample.chmod(0o600)
        sample.write_text(safe.replace("BOOKING_EMAIL_PROVIDER=disabled",
                                       "BOOKING_EMAIL_PROVIDER=gmail"), encoding="utf-8")
        if vault_is_ready(sample, uid):
            return False
        sample.write_text(safe, encoding="utf-8")
        sample.unlink()
        sample.symlink_to(pilot / "outside")
        if vault_is_ready(sample, uid):
            return False
    return True


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        print("FADEGO_GMAIL_VAULT_CHECK_CONTRACT=" + ("PASS" if self_test() else "FAIL"))
        raise SystemExit(0 if self_test() else 1)
    if len(sys.argv) != 1 or os.geteuid() != 0:
        print("FADEGO_GMAIL_VAULT=NOT_READY")
        raise SystemExit(2)
    ready = vault_is_ready()
    print("FADEGO_GMAIL_VAULT=" + ("READY" if ready else "NOT_READY"))
    raise SystemExit(0 if ready else 1)
