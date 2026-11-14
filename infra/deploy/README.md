# infra/deploy — putting the API and the website online

**Live website:** https://fire.37-187-37-74.sslip.io (landing page at `#/`, the tool at `#/app`)
**Live API:** https://fire-api.37-187-37-74.sslip.io (docs: `/docs`)
Both run on the team's OVH VPS behind its Caddy (automatic HTTPS).

## Update the website (about 1 minute)

From the repo root, on `main` with the latest changes, with `VITE_API_BASE_URL=https://fire-api.37-187-37-74.sslip.io` in `.env`:

```bash
cd web && npm install && npm run build && cd ..
ssh ubuntu@vps-c33c493b.vps.ovh.net 'rm -rf ~/brazil-fire-site-new && mkdir -p ~/brazil-fire-site-new'
scp -r web/dist/. ubuntu@vps-c33c493b.vps.ovh.net:brazil-fire-site-new/
ssh ubuntu@vps-c33c493b.vps.ovh.net 'sudo rsync -a --delete ~/brazil-fire-site-new/ /var/www/brazil-fire-site/ && sudo chmod -R a+rX /var/www/brazil-fire-site'
```

Caddy serves `/var/www/brazil-fire-site` as static files (block `fire.37-187-37-74.sslip.io` in `/etc/caddy/Caddyfile`, backup `Caddyfile.before-fire-site-*`). No container, no restart needed.

## How it is set up

| Piece | Where |
|---|---|
| Processed data (~661 MB) | Public Hugging Face dataset `BooJPo/brazil-fire-calendar-data` (uploaded by `deploy_hf.py --data`) |
| API container | VPS `vps-c33c493b.vps.ovh.net` (Ubuntu 24.04), Docker container `brazil-fire-api`, listening on `127.0.0.1:8077` only |
| Data inside the VPS | `/opt/brazil-fire/data` (downloaded from the dataset at first start, then reused) |
| HTTPS | The VPS's Caddy: block `fire-api.37-187-37-74.sslip.io { reverse_proxy 127.0.0.1:8077 }` at the end of `/etc/caddy/Caddyfile` (backup: `Caddyfile.before-fire-api-*`) |
| Low-memory mode | `API_DB_PATH` (tables in a DuckDB file), `API_MEMORY_LIMIT=600MB`, `API_THREADS=2`, container capped at 1.2 GB. Uses ~330 MB |

The Docker image is built from `hf_space/` (Dockerfile, `fetch_data.py`, requirements) plus `infra/api/` and `infra/pipeline/_common.py`.
Hugging Face Docker Spaces need a paid PRO plan, so the Space part of `deploy_hf.py --app` is not used.

## Update the API code on the VPS

From the repo root on a computer whose SSH key is authorized on the VPS:

```bash
S=$(mktemp -d) && mkdir -p "$S/pipeline" && cp -r infra/deploy/hf_space/. "$S/" && cp -r infra/api "$S/api" && rm -rf "$S/api/__pycache__" && cp infra/pipeline/_common.py "$S/pipeline/"
ssh ubuntu@vps-c33c493b.vps.ovh.net 'rm -rf ~/brazil-fire-api && mkdir -p ~/brazil-fire-api'
scp -r "$S/." ubuntu@vps-c33c493b.vps.ovh.net:brazil-fire-api/
ssh ubuntu@vps-c33c493b.vps.ovh.net 'cd ~/brazil-fire-api && sudo docker build -q -t brazil-fire-api . && sudo docker rm -f brazil-fire-api && sudo docker run -d --name brazil-fire-api --restart unless-stopped -p 127.0.0.1:8077:7860 --memory 1200m -e HF_DATASET=BooJPo/brazil-fire-calendar-data -e API_DB_PATH=/home/user/data/api.duckdb -e API_MEMORY_LIMIT=600MB -e API_THREADS=2 -v /opt/brazil-fire/data:/home/user/data brazil-fire-api'
```

## Update the data

1. Re-run the pipeline locally (steps 1–5).
2. `python infra/deploy/deploy_hf.py --data` (needs `hf auth login`).
3. On the VPS, delete the old copy so the container downloads the new one, then restart:
   `sudo rm -rf /opt/brazil-fire/data/* && sudo docker restart brazil-fire-api`

## Check it

```bash
curl https://fire-api.37-187-37-74.sslip.io/api/status
ssh ubuntu@vps-c33c493b.vps.ovh.net 'sudo docker logs --tail 20 brazil-fire-api; sudo docker stats --no-stream brazil-fire-api'
```

Remove everything: `sudo docker rm -f brazil-fire-api && sudo docker rmi brazil-fire-api`, put back the Caddyfile backup, `sudo systemctl reload caddy`.
