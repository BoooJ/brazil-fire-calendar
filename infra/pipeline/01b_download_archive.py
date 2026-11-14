"""Step 1b - download FIRMS archive-request files (Brazil only) into DATA_DIR/raw/firms_archive.

When an archive request is done, NASA emails a link like
    https://firms.modaps.eosdis.nasa.gov/data/download/DL_FIRE_SV-C2_849003.zip
The file stays on NASA's server for 45 days. Pass the file names (or the full links):

    python infra/pipeline/01b_download_archive.py DL_FIRE_SV-C2_849003.zip DL_FIRE_M-C61_849000.zip

Source codes in the name: M-C61 = MODIS, SV-C2 = VIIRS S-NPP, J1V-C2 = VIIRS NOAA-20, J2V-C2 = VIIRS NOAA-21.
Uses the same downloader as step 1: resumable, retries frozen connections, checks every zip,
one copy at a time. Only official FIRMS download names are accepted.
"""
from __future__ import annotations

import importlib.util
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from _common import data_dir  # noqa: E402

_spec = importlib.util.spec_from_file_location("download_step", HERE / "01_download.py")
download_step = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(download_step)

BASE_URL = "https://firms.modaps.eosdis.nasa.gov/data/download/"
NAME_PATTERN = re.compile(r"^DL_FIRE_[A-Z0-9]+(-[A-Z0-9]+)?_\d+\.zip$")


def main() -> None:
    names = [arg.rsplit("/", 1)[-1] for arg in sys.argv[1:]]
    if not names:
        sys.exit(__doc__)
    bad = [n for n in names if not NAME_PATTERN.match(n)]
    if bad:
        sys.exit(f"Not a FIRMS archive file name: {', '.join(bad)}")

    folder = data_dir() / "raw" / "firms_archive"
    folder.mkdir(parents=True, exist_ok=True)
    lock = download_step.acquire_lock(folder)

    print(f"Downloading {len(names)} archive file(s) to {folder}", flush=True)
    failures = 0
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(download_step.download, BASE_URL + n, folder / n) for n in names]
        for done, future in enumerate(as_completed(futures), start=1):
            status = future.result()
            failures += status.startswith("FAILED")
            print(f"[{done:2d}/{len(names)}] {status}", flush=True)

    lock.close()
    if failures:
        sys.exit(f"{failures} file(s) failed. Run the same command again to retry only those.")
    print("All archive files downloaded.", flush=True)


if __name__ == "__main__":
    main()
