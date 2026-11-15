---
title: Process journal
module: process
kind: journal
audience: [developer]
---

# Process journal

Problems with tooling, the board and the workflow. Newest first. Entries are not rewritten later.

### Work started before the issue description was published

- **When:** 2026-11-15 · PLT-05 (#27)
- **Symptom:** packages were already being installed while the issue still had only its generated header; the owner could not follow what was being done.
- **Cause:** research and implementation flowed together; the description was planned for "after the decisions".
- **Fix:** the description was published mid-way.
- **Lesson:** research may come first, but the issue description is published before any change on the branch — installs included.

### Merging a stack of pull requests in a loop broke the stack

- **When:** 2026-11-15 · PLT-03 (#90)
- **Symptom:** after a base branch was deleted, the pull requests stacked on it were closed; the loop then timed out and merged #90 into a branch other than `main`.
- **Cause:** GitHub closes pull requests whose base branch disappears; the script did not check the base before merging.
- **Fix:** branches restored, pull requests reopened, retargeted to `main` and merged one by one with checks.
- **Lesson:** merge stacked pull requests one at a time; retarget to `main` before deleting a base branch; no automated merge loops.

### A bulk board change moved the active stage to Backlog

- **When:** 2026-11-15
- **Symptom:** all issues, including the Stage 1 ones planned for work, ended up in Backlog.
- **Cause:** a script moved every issue without looking at the stage being worked on.
- **Fix:** Stage 1 issues returned to Todo by hand.
- **Lesson:** bulk board changes must respect the active stage; small board moves are faster by hand than by script.

### Generated issues were almost empty

- **When:** 2026-11-15 · PLT-04 (#26)
- **Symptom:** an issue held only a title and links to `init.md`; the feature was unclear without reading the spec.
- **Cause:** `gh roadmap sync` generates issues from one line of the registry.
- **Fix:** before a feature starts, its issue body is rewritten in detail ([Workflow → Refine the issue](workflow.md#2-refine-the-issue-before-starting)).
- **Lesson:** the issue is the brief; it has to stand on its own.

### Links in issues broke when opened from the Project board

- **When:** 2026-11-15
- **Symptom:** links such as `ROADMAP.md` in issue bodies led to `github.com/users/…/projects/1/blob/main/ROADMAP.md` (404).
- **Cause:** relative links resolve against the page they are viewed on; the Project page is not the repository.
- **Fix:** `gh roadmap` writes absolute URLs; 86 existing issue bodies were rewritten.
- **Lesson:** use absolute URLs in anything shown outside the repository (issues, PRs, boards).

### Prettier broke the tables that `gh roadmap` parses

- **When:** 2026-11-15
- **Symptom:** `gh roadmap sync` could not read the feature registry after formatting.
- **Cause:** Prettier pads and realigns Markdown tables.
- **Fix:** `ROADMAP.md` and `init.md` are listed in [.prettierignore](../../.prettierignore).
- **Lesson:** files parsed by tools are excluded from formatters.

### GitHub Projects rejected the field name "Type"

- **When:** 2026-11-15
- **Symptom:** creating a custom Project field `Type` failed.
- **Cause:** `Type` is reserved by GitHub (issue types).
- **Fix:** the field is called `Level` (epic / feature).
- **Lesson:** check reserved names before designing fields.

### Mermaid diagrams did not render with hyphenated node IDs

- **When:** 2026-11-15
- **Symptom:** diagrams with node IDs like `E-PLT-S1` failed to render.
- **Cause:** a hyphen is not valid in a Mermaid node ID.
- **Fix:** node IDs use underscores (`E_PLT_S1`).
- **Lesson:** Mermaid IDs: letters, digits, underscores; put display text in the label.

### Personal email in commit history before going public

- **When:** 2026-11-15
- **Symptom:** a work email address was found in early commits right before the repositories were made public.
- **Cause:** git used the machine's global email.
- **Fix:** history rewritten to the GitHub `noreply` address.
- **Lesson:** set the `noreply` email in a repository before its first commit.
