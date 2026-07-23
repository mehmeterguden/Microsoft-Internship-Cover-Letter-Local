# Working on this repo (humans and AI agents)

`main` is the **only** trunk. Everything ships through it.

This file exists because parallel agents once shared a single working directory and
a second, disconnected history appeared. Both cost days. The rules below prevent that.

## 1. One isolated worktree per task — never share a directory

Two agents in the same folder race on `HEAD`: commits land on the wrong branch and a
half-written file breaks everyone's build. Always work in your own worktree.

```bash
cd <repo root>
git fetch origin --prune
SLUG=my-feature                                  # unique per task
git worktree add -B "feat/$SLUG" "$HOME/agents/$SLUG" origin/main
cd "$HOME/agents/$SLUG" && (cd frontend && npm install)
```

Work **only** inside that directory. When you are done: `git worktree remove <path>`.

## 2. Always branch from the latest `origin/main`

Never branch from another feature branch or an old local branch. If your work sits on
a branch with no common ancestor with `origin/main`, do **not** try to merge it —
re-apply the changed files onto a fresh branch cut from `origin/main`.

## 3. Ship: rebase → PR → squash

```bash
git fetch origin && git rebase origin/main     # before opening the PR
cd frontend && npm run build                   # must be clean
cd ../backend && PYTHONPATH=. pytest -q        # must pass
git push -u origin "feat/$SLUG"
gh pr create --base main --title "feat(scope): ..." --body "..."
gh pr merge --squash                           # NOT --delete-branch, NOT --auto
git push origin --delete "feat/$SLUG"          # delete the remote branch separately
```

`--delete-branch` switches your local checkout to `main`; if `main` is checked out in
another worktree that step fails. Delete the remote branch explicitly instead.

## 4. Scope and hygiene

- Touch only the files your task owns. On shared files (`api/types.ts`,
  `requirements.txt`, `globals.css`, `routes.tsx`) **append** at the end; never rewrite.
- Conventional Commits, in English. Everything committed is in English.
- **No AI authorship trailers.** Never add `Co-Authored-By: Claude` (or similar).
- Never commit directly to `main`.
- Reuse the design tokens and `components/ui` primitives; don't invent new styles.
- Privacy: nothing leaves the device except the company-research call and the
  cloud LLM the user explicitly selected.

## 5. History note

The old `feat/research-resilience` line is a **separate, disconnected history**. Its
features were ported onto `main` (PR #31). It is archived at the tag
`legacy/research-resilience` — read it for reference, never branch from it.
