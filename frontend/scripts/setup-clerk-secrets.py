#!/usr/bin/env python3
"""Save inqox Clerk keys to Cloudflare Worker secrets through hidden prompts."""
import getpass
import json
from pathlib import Path
import subprocess
import sys
import warnings

WORKER = "applyit-application-agent"
WORKER_DIRECTORY = Path(__file__).resolve().parents[2] / "application-agent"
WRANGLER = WORKER_DIRECTORY / "node_modules" / ".bin" / "wrangler"
KEYS = (
    ("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "Clerk Publishable Key", "pk_"),
    ("CLERK_SECRET_KEY", "Clerk Secret Key", "sk_"),
)


def main():
    if not WRANGLER.is_file():
        raise SystemExit("The existing application-agent Wrangler installation was not found.")
    if not sys.stdin.isatty():
        raise SystemExit("Run this script directly in an interactive terminal.")
    warnings.simplefilter("error", getpass.GetPassWarning)
    print(f"Destination: Cloudflare Worker {WORKER}")
    values = {}
    for name, label, prefix in KEYS:
        value = getpass.getpass(f"Paste {label} (hidden), then press Enter: ").strip()
        if not any(value.startswith(prefix + mode + "_") for mode in ("test", "live")) or len(value) < 20 or any(c.isspace() for c in value):
            raise SystemExit(f"Invalid {label}. Copy the key value from Clerk's API Keys page and run again.")
        values[name] = value
    if len({value.split("_", 2)[1] for value in values.values()}) != 1:
        raise SystemExit("Both keys must come from the same Clerk environment.")
    result = subprocess.run(
        [str(WRANGLER), "secret", "bulk", "--name", WORKER, "--config", str(WORKER_DIRECTORY / "wrangler.jsonc")],
        input=json.dumps(values),
        text=True,
        cwd=WORKER_DIRECTORY,
    )
    if result.returncode:
        raise SystemExit(result.returncode)
    print("Both Clerk keys are saved in Cloudflare. Clerk still needs to be connected to the app.")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        raise SystemExit("\nCancelled.")
