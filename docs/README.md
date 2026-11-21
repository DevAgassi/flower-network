---
title: How the documentation is organised
module: docs
kind: process
audience: [developer]
---

# Documentation

Project documentation lives here, next to the code, and changes in the same pull request as the code it describes. Later the admin panel shows these files to staff, each role seeing its own part (ADM-04).

What is **not** here:

- the architecture specification and ADRs — [init.md](../init.md);
- the plan and feature registry — [ROADMAP.md](../ROADMAP.md);
- setup in five commands — [README.md](../README.md).

## Layout

```
docs/
  README.md                this file
  _templates/              starting points; copy, never link
  modules/<module>/        one folder per roadmap module (platform, inventory, orders, …)
    README.md              overview: purpose, pieces, how they fit, links
    <topic>.md             reference for one piece (configuration, database, outbox, …)
    journal.md             problems we hit and how we solved them
    guides/<task>.md       step-by-step instructions for one task of one role
  apps/                    one file per deployable process group: api.md (API + worker), web.md
  process/                 how we work: issues, branches, PRs, board; its own journal
```

A module folder is created by the first feature of that module. Folder names are the module names from [roadmap.config.json](../roadmap.config.json) (`platform`, `identity`, `inventory`, …).

## Index

| Area     | Documents                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform | [Overview](modules/platform/README.md) · [Monorepo](modules/platform/monorepo.md) · [Configuration](modules/platform/configuration.md) · [Database](modules/platform/database.md) · [Outbox](modules/platform/outbox.md) · [API contract](modules/platform/api-contract.md) · [Observability](modules/platform/observability.md) · [Local infrastructure](modules/platform/local-infrastructure.md) · [Journal](modules/platform/journal.md) |
| Identity | [Overview](modules/identity/README.md) · [Sign-in and sessions](modules/identity/sessions.md) · [Journal](modules/identity/journal.md)                                                                                                                                                                                                                                                                                                       |
| Apps     | [API and worker](apps/api.md) · [Web](apps/web.md)                                                                                                                                                                                                                                                                                                                                                                                           |
| Process  | [Workflow](process/workflow.md) · [CI](process/ci.md) · [Journal](process/journal.md)                                                                                                                                                                                                                                                                                                                                                        |

## Frontmatter

Every document (except templates) starts with:

```yaml
---
title: Transactional outbox # shown in the admin and in search
module: platform # module folder name, or apps / process / docs
kind: reference # see the table below
audience: [developer] # roles the document is meant for
---
```

| `kind`      | Content                                                              | Kept current?                         |
| ----------- | -------------------------------------------------------------------- | ------------------------------------- |
| `overview`  | What a module is for, its pieces and how they fit; links to the rest | Yes                                   |
| `reference` | How one piece works and how to use it                                | Yes, with every code change           |
| `guide`     | Steps for one task of one role, with examples                        | Yes, with every screen change         |
| `journal`   | Problems: symptom, cause, fix, lesson                                | Append only — entries stay as written |
| `process`   | How the team works                                                   | Yes                                   |

`audience` values: `developer`, `owner`, `admin`, `florist`, `courier`, `customer` (roles from init.md §4.8 plus `developer` for technical documents). In the admin, `admin` sees every document; any other role sees only documents that list it.

> The repository is public. `audience` decides what is **shown** to whom, not what is secret. Never put secrets, credentials of real systems or personal data in `docs/`.

## Journal entries

A journal is the memory of the project: it answers "why is this line here?" and stops the same mistake from happening twice. Add an entry whenever a non-obvious problem is solved — a crash, a wrong assumption, a tool that behaved unexpectedly, a dead end. Newest entry first:

```markdown
### Idle PostgreSQL connection crashed the API

- **When:** 2026-11-15 · PLT-03 (#25)
- **Symptom:** what was observed
- **Cause:** why it happened
- **Fix:** what changed, with a file link
- **Lesson:** the rule that prevents it next time
```

When a lesson becomes a rule for all code, also add it to the rules in [CLAUDE.md](../CLAUDE.md) or [init.md §8](../init.md).

## When to write what

| Change in a pull request                     | Documentation in the same pull request              |
| -------------------------------------------- | --------------------------------------------------- |
| New module                                   | `modules/<module>/README.md` and `journal.md`       |
| New or changed behaviour, API, config, table | Update the module's reference                       |
| New screen or procedure for staff            | `guides/<task>.md` for each role that performs it   |
| Non-obvious problem solved                   | Journal entry                                       |
| New environment variable                     | [Configuration](modules/platform/configuration.md)  |
| New command or process                       | [CLAUDE.md](../CLAUDE.md) and the related reference |

## Style

- English, short sentences, present tense.
- Lead with what the reader needs to do; explain why right after.
- Link to code with relative paths instead of copying large code blocks; a short usage example is fine.
- Mermaid for diagrams.
- Guides are written for the role, not for developers: no code, no internal names, every step is one action.
