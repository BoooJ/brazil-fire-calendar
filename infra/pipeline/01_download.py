"""Step 1 - download NASA FIRMS yearly country files into DATA_DIR/raw.

Source: https://firms.modaps.eosdis.nasa.gov/country/ (no account needed).
  - MODIS C6.1, 2000-2025      modis_YYYY_all_countries.zip        (~2 GB in total)
  - VIIRS NOAA-20, 2018-2025   viirs-jpss1_YYYY_all_countries.zip  (~2.8 GB in total)

VIIRS S-NPP (2012-2026) and everything from 2026 are NOT here: they come from
the FIRMS archive request (emailed link).

Safe to re-run:
  - complete files are skipped,
  - interrupted files resume where they stopped (.part files),
  - every new zip is integrity-checked; a corrupt one is downloaded again,
  - only one copy can run at a time (lock file), so two runs can't collide.

Usage:
    python infra/pipeline/01_download.py
    python infra/pipeline/01_download.py --only modis --years 2019 2020
"""
from __future__ import annotations

import argparse
import os
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

BASE_URL = "https://firms.modaps.eosdis.nasa.gov/data/country/zips/"
PRODUCTS = {  # key -> (file prefix on FIRMS, years available)
    "modis": ("modis", range(2000, 2026)),
    "viirs_noaa20": ("viirs-jpss1", range(2018, 2026)),
}
HEADERS = {"User-Agent": "brazil-fire-calendar-pipeline/0.1"}
CHUNK_BYTES = 1024 * 1024
CONNECT_TIMEOUT_S = 30
STALL_TIMEOUT_S = 60  # no data for this long = frozen connection -> retry
RETRIES = 5
ROOT = Path(__file__).resolve().parents[2]


def load_env() -> None:
    """Read KEY=VALUE lines from the repo's .env into the environment (values are never printed)."""
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def data_dir() -> Path:
    load_env()
    value = os.environ.get("DATA_DIR")
    if not value:
        sys.exit("DATA_DIR is not set. Copy .env.example to .env and set DATA_DIR (outside OneDrive).")
    path = Path(value)
    if "onedrive" in str(path).lower():
        sys.exit(f"DATA_DIR is inside OneDrive ({path}). Use a folder outside it, e.g. C:/fire-data.")
    return path


def acquire_lock(folder: Path):
    """Hold an OS-level lock on folder/.download.lock. Exit if another copy holds it.

    The OS releases the lock automatically if the process dies, so a crash never leaves a stale lock.
    """
    handle = open(folder / ".download.lock", "a+")
    try:
        if os.name == "nt":
            import msvcrt
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        sys.exit("Another download is already running on this folder. Stop it first (Ctrl+C), or wait for it.")
    return handle  # keep a reference: the lock lives as long as this file handle


def zip_is_valid(path: Path) -> bool:
    try:
        with zipfile.ZipFile(path) as zf:
            return zf.testzip() is None
    except zipfile.BadZipFile:
        return False


def download(url: str, dest: Path) -> str:
    """Download one file to dest via dest.part, resuming if possible. Returns a one-line status."""
    tmp = dest.with_name(dest.name + ".part")
    with requests.Session() as session:
        session.headers.update(HEADERS)
        for attempt in range(1, RETRIES + 1):
            try:
                head = session.head(url, timeout=CONNECT_TIMEOUT_S, allow_redirects=True)
                head.raise_for_status()
                expected = int(head.headers["Content-Length"]) if "Content-Length" in head.headers else None
                if dest.exists() and expected is not None and dest.stat().st_size == expected:
                    return f"skip    {dest.name} (already complete)"

                have = tmp.stat().st_size if tmp.exists() else 0
                if expected is not None and have > expected:
                    tmp.unlink()
                    have = 0
                headers = {"Range": f"bytes={have}-"} if have else {}
                start = time.monotonic()
                with session.get(url, headers=headers, stream=True,
                                 timeout=(CONNECT_TIMEOUT_S, STALL_TIMEOUT_S)) as response:
                    response.raise_for_status()
                    resumed = have > 0 and response.status_code == 206
                    with open(tmp, "ab" if resumed else "wb") as f:
                        for chunk in response.iter_content(CHUNK_BYTES):
                            f.write(chunk)

                size = tmp.stat().st_size
                if expected is not None and size != expected:
                    raise OSError(f"incomplete: {size:,} of {expected:,} bytes")
                if not zip_is_valid(tmp):
                    tmp.unlink()
                    raise OSError("corrupt zip, downloading it again from scratch")
                tmp.replace(dest)
                note = " (resumed)" if resumed else ""
                return f"ok      {dest.name} ({size / 1e6:,.0f} MB in {time.monotonic() - start:,.0f} s){note}"
            except (requests.RequestException, OSError) as exc:
                if attempt == RETRIES:
                    return f"FAILED  {dest.name}: {exc}"
                print(f"        retry {attempt}/{RETRIES - 1} {dest.name}: {exc}", flush=True)
                time.sleep(5 * attempt)
    return f"FAILED  {dest.name}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Download NASA FIRMS yearly country files.")
    parser.add_argument("--only", choices=sorted(PRODUCTS), help="download one product only")
    parser.add_argument("--years", type=int, nargs="+", help="only these years")
    parser.add_argument("--workers", type=int, default=3, help="parallel downloads (default: 3)")
    args = parser.parse_args()

    raw = data_dir() / "raw" / "firms_country_yearly"
    raw.mkdir(parents=True, exist_ok=True)
    lock = acquire_lock(raw)

    jobs = []
    for key, (prefix, years) in PRODUCTS.items():
        if args.only and key != args.only:
            continue
        for year in years:
            if args.years and year not in args.years:
                continue
            name = f"{prefix}_{year}_all_countries.zip"
            jobs.append((BASE_URL + name, raw / name))

    print(f"Downloading {len(jobs)} files to {raw} ({args.workers} at a time)", flush=True)
    failures = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(download, url, dest) for url, dest in jobs]
        for done, future in enumerate(as_completed(futures), start=1):
            status = future.result()
            failures += status.startswith("FAILED")
            print(f"[{done:2d}/{len(jobs)}] {status}", flush=True)

    lock.close()
    if failures:
        sys.exit(f"{failures} file(s) failed. Run the same command again to retry only those.")
    print("All files downloaded.", flush=True)


if __name__ == "__main__":
    main()
