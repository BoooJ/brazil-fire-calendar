# Building together with Git — 5-minute guide

How four people work on the same repo at the same time without breaking each other's work. Team rules: [EN](TEAM_RULES.md) · [PT](REGRAS_DA_EQUIPE.md).

## The idea

```
main            ──●──────────●──────────●──────────●──   always works
                   \        /  \        /
web/calendar        ●──●──●     \      /
infra/pipeline                   ●──●─●
```

- **`main`** is the shared version. It must always work.
- **Each task gets its own branch.** You work there, then merge it into `main` with a **pull request**.
- **Everyone stays in their own folder** (`infra/`, `web/`, `science/`). That's why conflicts are rare.

> Prefer clicking to typing? **GitHub Desktop** or the **Source Control** panel in VS Code do exactly the same steps.

## 0. Once, at the start

1. Accept the GitHub invitation (email, or `https://github.com/BoooJ/brazil-fire-calendar/invitations`).
2. Install **Git**, plus **Python 3.12** (`infra/`, `science/`) or **Node.js** (`web/`).
3. Get the project:

```bash
git clone https://github.com/BoooJ/brazil-fire-calendar.git
cd brazil-fire-calendar
```

4. Copy `.env.example` to `.env` and put your own keys in it. `.env` never goes to GitHub.

## 1. Start a task

```bash
git switch main
git pull
git switch -c web/calendar
```

Branch names: `infra/…`, `web/…`, `science/…`. On an older Git, use `git checkout -b web/calendar`.

## 2. Work and save often

```bash
git status                 # what changed? check there is no data and no .env
git add web/               # add YOUR folder
git commit -m "Add calendar heatmap"
git push -u origin web/calendar      # first push of this branch; afterwards just: git push
```

**Push at least every couple of hours**, and always before you stop or sleep.

## 3. Share it: the pull request

1. On GitHub, click **"Compare & pull request"**. The base must be `main`.
2. Give it a short title, link the issue ("Closes #12"), and tick the checklist.
3. Someone takes a **2-minute look**. Nobody available within 15 minutes? Merge it yourself if it runs.
4. Click **Merge**, then **Delete branch**.

Small pull requests, **several times a day**. Avoid one giant merge on Sunday.

## 4. Next task

```bash
git switch main
git pull
git switch -c web/charts
```

## 5. Someone merged before you (your branch is behind)

```bash
git switch main
git pull
git switch web/calendar
git merge main
git push
```

## 6. If Git says "CONFLICT"

Git marks the conflicting part of the file like this:

```
<<<<<<< HEAD
your version
=======
the other version
>>>>>>> main
```

1. Keep the right lines and delete the three marker lines.
2. Then:

```bash
git add path/to/file
git commit
git push
```

**Not sure which version is right? Stop and ask in the chat.** Never guess on someone else's code.

Conflicts almost always come from the **shared files**: `docs/api-contract.md`, `web/mocks/`, `README.md`, `CLAUDE.md`. Say it in the chat before you edit them.

## 7. Quick fixes

| Problem | Fix |
|---|---|
| Started working on `main` by mistake (nothing committed yet) | `git switch -c web/my-task`. Your changes come with you |
| Want to undo changes to one file (not committed) | `git restore path/to/file` |
| Wrong commit message (not pushed yet) | `git commit --amend -m "Better message"` |
| Committed a **key, password or data file** | **Don't push.** Ask in the chat right away. If it was already pushed, say so: the key must be replaced with a new one |
| Something broken reached `main` | Say it in the chat. On GitHub, open the merged pull request and click **Revert** |

## 8. Golden rules

1. `main` always works. Changes go through pull requests.
2. **Pull before you start, push before you stop.**
3. Stay in your folder; announce changes to shared files.
4. Never commit `.env`, keys or data. `.gitignore` helps, but check `git status`.
5. Never `git push --force` on `main`.
