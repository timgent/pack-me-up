---
name: pickup-issue
version: 1.0.0
description: |
  Find the first open GitHub issue without a "taken" label, claim it by adding
  the label, then produce an implementation plan. Use when the user wants to
  pick up the next available issue or asks /pickup-issue.
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Agent
  - EnterPlanMode
  - ExitPlanMode
---

# pickup-issue: Claim and Plan a GitHub Issue

You are running the `/pickup-issue` workflow. Find the next unclaimed issue,
label it as taken, understand what it requires, then enter plan mode to produce
an actionable implementation plan.

**Hard rules:**
- Never claim more than one issue per invocation.
- Never skip the codebase exploration — the plan must reference real files.
- Always follow TDD: the plan must include a red → green → refactor cycle.
- Never enter plan mode without first reading the full issue body and comments.

---

## Step 1: Find the first unclaimed issue

List all open issues and find the first one without a `taken` label:

```bash
gh issue list \
  --repo timgent/react-packing-app \
  --state open \
  --json number,title,labels \
  --limit 100
```

Parse the JSON output:
- An issue is **unclaimed** if its `labels` array contains no entry with `name == "taken"`.
- Select the **lowest-numbered** unclaimed issue.

If no unclaimed issues exist, print "No unclaimed issues found." and stop.

---

## Step 2: Claim the issue

Ensure the `taken` label exists (this is a no-op if it already does):

```bash
gh label create taken \
  --repo timgent/react-packing-app \
  --color "B60205" \
  --description "Issue is being worked on" \
  --force
```

Add the label to the issue:

```bash
gh issue edit <number> \
  --repo timgent/react-packing-app \
  --add-label taken
```

Print: "Claimed issue #<number>: <title>"

---

## Step 3: Read the full issue

Fetch the issue body and all comments:

```bash
gh issue view <number> \
  --repo timgent/react-packing-app \
  --json title,body,comments
```

Read carefully:
- What problem does it describe?
- Are there reproduction steps, expected vs. actual behaviour, or feature requirements?
- Do any comments add constraints or clarifications?

---

## Step 4: Explore relevant code

Use Glob, Grep, and Read to identify the code areas involved. At minimum:

1. Search for keywords from the issue title/body across `src/`.
2. Read the files most likely to need changes (components, hooks, services, pages).
3. Find the existing test file(s) that cover the affected area — look for `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx` co-located with the source files.
4. Note the patterns and conventions in place (component structure, hook patterns, PouchDB service usage, error handling style, etc.).

---

## Step 5: Produce an implementation plan

Call EnterPlanMode, then write a plan file with these sections:

- **Issue summary** — one paragraph describing the problem or feature.
- **Root cause / approach** — what needs to change and why.
- **Files to modify** — list each file with the specific component, hook, or function to change.
- **TDD steps**:
  1. **Red** — write a failing test (`.test.tsx` / `.test.ts`) that captures the expected behaviour.
  2. **Green** — make the minimal change to pass the test.
  3. **Refactor** — clean up without breaking tests.
- **Verification** — `npm test` to confirm everything passes.

Call ExitPlanMode to present the plan for user approval before writing any code.
