# Night shift — instructions for every run

You are working unattended on the website (`web/`). Nobody will answer questions: decide yourself, write doubts to `night/QUESTIONS.md`.

**Rules:** follow the root `CLAUDE.md` and `web/CLAUDE.md` exactly. Never edit `web/mocks/` or the kit files in `web/public/assets/`. Display API values, never recompute them. Work ONLY on branch `web/night-ui`, never push to `main`, never force-push.

## Loop (repeat until the time limit given in the run's instructions)

1. Open `night/TASKS.md`, take the FIRST `- [ ]` task. If it is big, split it into sub-tasks in the file and do the first.
2. Do it. Then `cd web && npm run build` must pass. If it fails, fix it; never commit a broken build.
3. Mark it `- [x]` (add one short line under it: what you changed).
4. `git add -A && git commit -m "<short imperative English message>" && git push origin web/night-ui`.
5. Next task.

If there are no `- [ ]` tasks left, go through the landing page (`#/`) and the tool (`#/app`), find concrete things to improve (responsive 375/820/1366/1440, every state designed, accessibility, focus/hover, motion, consistent tokens in `src/styles.css`, duplicated components), append them to `night/TASKS.md` and continue.

Improve, don't redesign: no radical visual changes, no new dependencies unless tiny and clearly needed, no restructuring of folders.

Before the run ends make sure everything is committed and pushed. Append one line per run to `night/LOG.md`: time (UTC), tasks done.
