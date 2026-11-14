# Team rules — Brazil Fire Calendar

*NASA Space Apps Challenge 2026 · "Harmonization of MODIS and VIIRS Hot Spots"* · [Versão em português](REGRAS_DA_EQUIPE.md)

## 1. Our goal

Build a website that turns 20+ years of NASA fire hotspots over Brazil into one consistent **burning calendar**, so that changing satellites no longer creates fake jumps.

**Submit by Sunday 15 Nov, 21:00. Hard deadline: 23:00** (our local time).

## 2. Scope: the MVP comes first

1. The **17 MVP features** in the [README](../README.md#mvp-features) are the job. Nothing else until they all work.
2. **Extras** only after the Sunday 12:00 checkpoint passes.
3. **Feature freeze: Sunday 15:00.** After that: only fixes, polish, video and submission.
4. **We are not doing:** forecasts, non-NASA data, other countries (except as a late extra).
5. If two rules conflict, **the deadline wins**: ship the MVP.

## 3. Data rules

1. **NASA FIRMS data only.**
2. **Never commit data files** (CSV, zip, Parquet). The scripts in `infra/` rebuild them.
3. Keep data **outside OneDrive / Dropbox / Google Drive** (set `DATA_DIR` in `.env`).
4. **Never commit secrets** (`.env`, API keys, passwords). Share them privately in the team chat.
5. Never show a number we can't explain. Recent data is marked **provisional**, weak data **uncertain**, and the "coming months" card always says **"not a forecast"**.

## 4. Who owns what

Each folder has one owner. **Don't edit someone else's folder without asking them.** Anyone can help in another folder when its owner agrees.

| Folder | Owner | Content |
|---|---|---|
| `infra/` | Infrastructure | Download, cleaning, harmonization code, API, daily update, hosting the API |
| `web/` | UI/UX | The website: map, calendar, charts, downloads, accessibility, hosting the site |
| `science/` | Scientist | Harmonization method, validation, texts for the reliability panel |
| `docs/api-contract.md` + `web/mocks/` | Infrastructure + UI/UX together | The agreement between the API and the website |

Who decides:

- **Numbers and calculations:** infrastructure + scientist.
- **Colours, layout, words on screen:** UI/UX.
- **The method:** scientist.
- **The API contract:** both sides, then frozen.

## 5. GitHub workflow

1. **`main` always works.** Never push broken code to `main`.
2. **One branch per task:** `infra/...`, `web/...`, `science/...` (e.g. `web/calendar`).
3. `git pull` on `main` before starting new work.
4. **Small pull requests, merged several times a day**, not one giant merge on Sunday.
5. Fill in the pull request checklist: it runs, no data, no secrets, contract updated if the API changed.
6. Someone takes a 2-minute look. Nobody available within 15 minutes? Merge it yourself if it runs.
7. **One GitHub Issue per feature.** Assign yourself, close it when done.
8. Clear commit messages: "Add calendar hover tooltip", not "fix".
9. **AI agents** (Claude Code) read `CLAUDE.md` (at the root and in each folder). Update it in a pull request when a fact changes. Every `CLAUDE.md` change gets a quick human look.

## 6. The API contract

1. [`docs/api-contract.md`](api-contract.md) is **frozen after kickoff**.
2. The website is built on the fake files in `web/mocks/` until the real API is ready.
3. A change = a message in the chat + update the contract **and** the mocks in the same pull request.

## 7. Communication

1. **One channel:** the team chat.
2. **Blocked for more than 30 minutes? Say it.** Asking early is not a weakness.
3. At each checkpoint, everyone posts 3 lines: **done / doing / blocked**.
4. A decision written in the chat is final, unless something is broken.

## 8. Schedule

| When | Goal |
|---|---|
| **Saturday, kickoff (2 h)** | Plan agreed · NASA accounts (Earthdata, FIRMS MAP_KEY) · data requests sent · downloads started · contract frozen |
| **Saturday 21:00** | **Checkpoint 1:** first raw Pantanal calendar from **real data** in the website |
| **Saturday night** | Sleep |
| **Sunday 12:00** | **Checkpoint 2:** all 17 MVP features work (even roughly), online |
| **Sunday 15:00** | **Feature freeze** |
| **Sunday 19:00** | Video / slides finished |
| **Sunday 21:00** | **Submitted** |
| **Sunday 23:00** | Hard deadline |

## 9. "Done" means

1. Works with **real data** (not only the mocks).
2. Merged into `main`.
3. Works on a **phone-sized** screen.
4. No errors in the browser console.
5. Colours readable for colour-blind users (checked, not assumed).

## 10. Submission

1. Repository **public** (or the judges have access) before submitting.
2. The README lists the **NASA data used** and how to run the project.
3. Note the **AI tools** we used, if the form asks.
4. Final check: **no secrets** in the code or in the history.

## 11. Take care

Sleep on Saturday night, eat, drink water. A rested team ships; an exhausted team breaks `main` at 18:00.
