"""Step 2 - keep only Brazil: copy Brazil's CSVs out of the downloaded files.

Inputs (DATA_DIR/raw/):
  firms_country_yearly/*.zip   yearly zips, one CSV per country inside,
                               e.g. modis/2000/modis_2000_Brazil.csv  (layout checked)
  firms_archive/**             files from the FIRMS archive requests (already Brazil-only):
                               DL_FIRE_<SRC>_<id>.zip containing fire_archive_<SRC>_<id>.csv
                               (final data) and fire_nrt_<SRC>_<id>.csv (near-real-time)  (checked)

Output (DATA_DIR/brazil_csv/{product}/{final|provisional}/<name>.csv), unchanged rows:
  product = modis | viirs_snpp | viirs_noaa20 | viirs_noaa21

Re-runnable: an output that is newer than its input is skipped.

Usage:
    python infra/pipeline/02_extract_brazil.py
"""
from __future__ import annotations

import shutil
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import data_dir  # noqa: E402

YEARLY_PREFIX_TO_PRODUCT = {
    "modis": "modis",
    "viirs-snpp": "viirs_snpp",
    "viirs-jpss1": "viirs_noaa20",
    "viirs-jpss2": "viirs_noaa21",
}


def product_from_archive_name(name: str) -> str | None:
    """Guess the product of a FIRMS archive file from its name (names not verified yet)."""
    n = name.lower()
    if "j2v" in n or "jpss2" in n or "noaa21" in n or "noaa-21" in n:
        return "viirs_noaa21"
    if "j1v" in n or "jpss1" in n or "noaa20" in n or "noaa-20" in n:
        return "viirs_noaa20"
    if "sv-c2" in n or "suomi" in n or "snpp" in n or "s-npp" in n:
        return "viirs_snpp"
    if "m-c61" in n or "modis" in n or "m6" in n:
        return "modis"
    return None


def is_up_to_date(output: Path, source: Path) -> bool:
    return output.exists() and output.stat().st_mtime >= source.stat().st_mtime


def extract_yearly(zip_path: Path, out_root: Path) -> str:
    prefix = zip_path.name.split("_")[0]
    product = YEARLY_PREFIX_TO_PRODUCT.get(prefix)
    if product is None:
        return f"SKIP    {zip_path.name}: unknown product prefix '{prefix}'"
    with zipfile.ZipFile(zip_path) as zf:
        members = [m for m in zf.namelist() if m.endswith("_Brazil.csv")]
        if len(members) != 1:
            return f"SKIP    {zip_path.name}: expected 1 Brazil CSV, found {len(members)}"
        out = out_root / product / "final" / Path(members[0]).name
        if is_up_to_date(out, zip_path):
            return f"skip    {out.name} (up to date)"
        out.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(members[0]) as src, open(out, "wb") as dst:
            shutil.copyfileobj(src, dst)
    return f"ok      {out.relative_to(out_root)} ({out.stat().st_size / 1e6:,.1f} MB)"


def extract_archive_csv(name: str, opener, source: Path, out_root: Path) -> str:
    product = product_from_archive_name(name)
    if product is None:
        return f"SKIP    {name}: cannot tell the satellite from the file name"
    version = "provisional" if "nrt" in name.lower() else "final"
    out = out_root / product / version / Path(name).name
    if is_up_to_date(out, source):
        return f"skip    {out.name} (up to date)"
    out.parent.mkdir(parents=True, exist_ok=True)
    with opener() as src, open(out, "wb") as dst:
        shutil.copyfileobj(src, dst)
    return f"ok      {out.relative_to(out_root)} ({out.stat().st_size / 1e6:,.1f} MB)"


def main() -> None:
    root = data_dir()
    out_root = root / "brazil_csv"
    messages = []

    for zip_path in sorted((root / "raw" / "firms_country_yearly").glob("*.zip")):
        messages.append(extract_yearly(zip_path, out_root))

    archive_dir = root / "raw" / "firms_archive"
    for path in sorted(archive_dir.rglob("*")) if archive_dir.exists() else []:
        if path.suffix.lower() == ".csv":
            messages.append(extract_archive_csv(path.name, lambda p=path: open(p, "rb"), path, out_root))
        elif path.suffix.lower() == ".zip":
            with zipfile.ZipFile(path) as zf:
                for member in zf.namelist():
                    if member.lower().endswith(".csv"):
                        messages.append(extract_archive_csv(
                            member, lambda m=member, z=zf: z.open(m), path, out_root))

    for message in messages:
        print(message)
    problems = [m for m in messages if m.startswith("SKIP")]
    print(f"\n{len(messages)} file(s) processed, {len(problems)} problem(s). Output: {out_root}")


if __name__ == "__main__":
    main()
