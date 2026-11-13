# Rules for coding agents

## Read order

1. `docs/DECISIONS.md` — what has already been decided. Do not relitigate it. *(Internal; may not be
   in your clone. If it is absent, proceed — do not invent decisions.)*
2. `PROTOCOL.md` — the wire contract you must obey.
3. `docs/ENGINE.md` — the module you are working in and the build order.
4. `docs/HANDOFF.md` — the current state, what is broken, what not to touch. *(Internal; same rule.)*

If your task contradicts a decision, stop and say so; do not silently redesign.

This repo is built during a 27-hour sprint by two people, each running an AI agent. Follow these.

## The repo

Never run `git init`. A fresh repository and remote are created by A at kickoff (decision #29) —
agents never create repos; you silently detach the work. If you cannot find a branch, ask. Until
the fresh repo exists you are in the planning workspace: docs only, no code.

## Verify before saying done

`bun test`, `bun run typecheck` and `bun run verify` must be green before you report a task complete.
Paste the tail of each output. `bun run verify` is the gate in `docs/VERIFY.md`.

## Scope

- Work only on the task you were given. Do not refactor, rename, or "improve" unrelated files.
- Do not add dependencies. Ask the owner; only **A** runs `bun add`.
- Do not create new files outside your assigned area.
- Until kickoff (Saturday 11:00) this repo is planning files only: no `bun init`, no `bun add`, no
  code, no feature branches.

## Handoff and tags

- End every task with a five-line entry — what works, what is broken, what is next, what not to
  touch, current branch. Append it to `docs/HANDOFF.md` under your section (`## A` or `## B`) **if
  that file exists in your clone**; otherwise post the same five lines to `#build-log`. Never create
  an internal doc inside the judge-facing repo to hold it.
- Do not create git tags. `playable-*`, `freeze` and `gold` are the human's checkpoint job.

## Branching

- You are on your own branch in your own clone/worktree. Stay on it.
- Never merge someone else's branch. You may merge **your own** branch into `main` when it runs
  (B does this in his own clone); never `git checkout`, `git switch`, `git reset` or `git rebase` a
  branch that is not yours.
- To sync: `git fetch origin && git rebase origin/main`.
- Commit small, with messages that say what changed and why.

## Shared files

- `shared/protocol.ts` is owned by A. Do not edit it. If a message shape must change, stop and say so.
- `package.json` and the lockfile are owned by A.
- `arena.json` is owned by B. Do not edit it from the server side.

## Code standards

- TypeScript, strict, no `any` in new code.
- Server is authoritative: never trust a client message for position, block ownership or damage.
- Every new pure function gets a test: server/pure code in `tests/`, client pure functions in
  `client/*.test.ts`. Rendering does not need tests.
- No network requests at runtime. No CDNs, fonts, analytics or external APIs.
- No secrets in the repo.
- Before saying done: run the checks that exist (`bun test`, `bun run typecheck`) and paste the output.

## When unsure

Say what you found and ask, rather than inventing an API. If a library call is uncertain, check the
installed version's types in `node_modules` before writing code against it.
