"""Container start: download the processed NASA FIRMS data from the dataset repo into DATA_DIR."""
import os
import time

from huggingface_hub import snapshot_download

start = time.monotonic()
destination = os.environ["DATA_DIR"]
snapshot_download(repo_id=os.environ["HF_DATASET"], repo_type="dataset", local_dir=destination)
print(f"Data ready in {destination} ({time.monotonic() - start:.0f} s)", flush=True)
