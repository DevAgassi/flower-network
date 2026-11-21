---
title: Subagents
module: process
kind: process
audience: [developer]
---

# Subagents

The main assistant (an expensive model with the whole conversation in context) hands narrow, well-defined subtasks to **subagents**: separate agents with their own cheaper model and a limited set of tools, defined in [`.claude/agents/`](../../.claude/agents/). The goal is to spend fewer tokens and to keep long, noisy output (CI logs, big searches) out of the main conversation.

## When delegation pays off

| Pays off                                                         | Does not                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Reading long output and returning a conclusion (CI logs, search) | One short command (`gh issue edit`): briefing an agent costs more    |
| Waiting (CI runs) while the main work continues                  | Work that needs the conversation's context: analysis, design, code   |
| Many repetitive operations of the same kind                      | Anything whose result must be judged against decisions made just now |

Cost note (first trial): every tool call of the main assistant re-reads its whole conversation (cached, but at the main model's price), so in a long session even a two-command chore is not free. A Haiku agent with a short brief costs ~12k cheap tokens regardless of how long the main conversation is. Delegation therefore pays off more the longer the session gets; for a single command early in a session, running it directly is still cheaper.

A subagent knows only its brief. Its mistakes come back as confidently as its results, so new agents are checked by the main assistant for the first few uses.

## Agents

| Agent                                                        | Model  | Tools                  | For                                                                                    | Lifetime  | Status                  |
| ------------------------------------------------------------ | ------ | ---------------------- | -------------------------------------------------------------------------------------- | --------- | ----------------------- |
| [`github-ops`](../../.claude/agents/github-ops.md)           | Haiku  | Bash, Read             | Issue body from a prepared file, comments, board status, waiting for CI and reporting  | permanent | trial (results checked) |
| [`ci-investigator`](../../.claude/agents/ci-investigator.md) | Sonnet | Bash, Read, Grep, Glob | Why a CI run failed: failed steps, key log lines, cause with `file:line`, proposed fix | permanent | trial (results checked) |

Rules for every agent: no commits, pushes or merges; only the operations in its brief; report exact results and errors.

## Candidates

Ideas noted during development, with the stage where they would help. Promote one to `.claude/agents/` when the same kind of subtask has come up several times.

| Candidate          | What it would do                                                                                                     | Stage / lifetime               | Seen when                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| `docs-checker`     | After a feature: compare changed code with `docs/` and `CLAUDE.md`, list stale statements and missing index entries  | permanent                      | LOC-01: `roles.md` from IAM-02 was missing in the docs index                  |
| `openapi-reviewer` | Read the `openapi.json` diff of a PR and flag unintended changes (required flags, defaults, missing error responses) | permanent, while the API grows | IAM-01 `bearerFormat: JWT`; LOC-01 optional query parameter shown as required |
| `seed-writer`      | Generate realistic seed data for new tables from their schema                                                        | temporary — Stage 2 (PLT-08)   | —                                                                             |
| `init-migrator`    | Move one section of `init.md` into `docs/` and `CLAUDE.md`                                                           | temporary — PLT-14             | —                                                                             |

## Log

What delegation did in practice — kept short, newest first. At the end of the project this log becomes a reusable workflow for the next one.

| Date       | Agent        | Task                                            | Result                                                                                            |
| ---------- | ------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 2026-11-21 | `github-ops` | CAT-01: move #34 and epic #4 to In Progress     | Correct (read-back matched, verified by the main assistant). ~12k Haiku tokens, 1 tool call, 27 s |
| 2026-11-21 | —            | Agents `github-ops` and `ci-investigator` added | —                                                                                                 |
