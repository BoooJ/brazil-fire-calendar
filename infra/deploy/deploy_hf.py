"""Put the API online: a Hugging Face Space (Docker) + a dataset repo holding the processed data.

Once per computer: create a free Hugging Face account, then log in (the token stays in the hf store,
never in a file of this repo):
    hf auth login        # paste a token with "write" permission

Usage (from the repo root, with the project .venv):
    python infra/deploy/deploy_hf.py --data     # upload / refresh the processed data (~630 MB)
    python infra/deploy/deploy_hf.py --app      # upload / refresh the API code (the Space rebuilds itself)
    python infra/deploy/deploy_hf.py --data --app

Both repos are public: the data is processed public NASA data, and the website must reach the API.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "infra" / "pipeline"))
from _common import data_dir  # noqa: E402

SPACE_NAME = "brazil-fire-calendar-api"
DATASET_NAME = "brazil-fire-calendar-data"


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy the API to Hugging Face.")
    parser.add_argument("--data", action="store_true", help="upload the processed data")
    parser.add_argument("--app", action="store_true", help="upload the API code")
    args = parser.parse_args()
    if not (args.data or args.app):
        sys.exit(__doc__)

    api = HfApi()
    user = api.whoami()["name"]
    dataset_id, space_id = f"{user}/{DATASET_NAME}", f"{user}/{SPACE_NAME}"

    if args.data:
        root = data_dir()
        built = (root / "derived" / "fire_days").stat().st_mtime
        (root / "derived" / "build_info.json").write_text(json.dumps({
            "data_updated": datetime.fromtimestamp(built, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }), encoding="utf-8")
        api.create_repo(dataset_id, repo_type="dataset", exist_ok=True, private=False)
        print(f"Uploading processed data to https://huggingface.co/datasets/{dataset_id} ...", flush=True)
        api.upload_folder(repo_id=dataset_id, repo_type="dataset", folder_path=str(root),
                          allow_patterns=["derived/**", "clean/hotspots/**"],
                          commit_message="Update processed NASA FIRMS data")

    if args.app:
        api.create_repo(space_id, repo_type="space", space_sdk="docker", exist_ok=True, private=False)
        api.add_space_variable(space_id, "HF_DATASET", dataset_id)
        with tempfile.TemporaryDirectory() as tmp:
            stage = Path(tmp)
            shutil.copytree(ROOT / "infra" / "deploy" / "hf_space", stage, dirs_exist_ok=True)
            shutil.copytree(ROOT / "infra" / "api", stage / "api", ignore=shutil.ignore_patterns("__pycache__"))
            (stage / "pipeline").mkdir()
            shutil.copy(ROOT / "infra" / "pipeline" / "_common.py", stage / "pipeline" / "_common.py")
            print(f"Uploading the API to https://huggingface.co/spaces/{space_id} ...", flush=True)
            api.upload_folder(repo_id=space_id, repo_type="space", folder_path=str(stage),
                              commit_message="Deploy API")

    host = f"{user}-{SPACE_NAME}".lower().replace("_", "-").replace(".", "-")
    print(f"\nSpace page : https://huggingface.co/spaces/{space_id}")
    print(f"API address: https://{host}.hf.space   (docs: https://{host}.hf.space/docs)")


if __name__ == "__main__":
    main()
