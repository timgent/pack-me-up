---
name: ux-explorer
version: 1.0.0
description: |
  Run the app with a local Solid server, explore it as a realistic new user,
  write a narrative of the experience, then summarise bugs/UX issues. Checks
  open GitHub issues for duplicates and offers to file new ones.
  Optional argument: a brief description of the persona to adopt (e.g. "a retired
  school teacher planning a round-the-world trip"). If omitted, invent a suitable one.
allowed-tools:
  - Bash
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_snapshot
  - mcp__playwright__browser_click
  - mcp__playwright__browser_type
  - mcp__playwright__browser_fill_form
  - mcp__playwright__browser_take_screenshot
  - mcp__playwright__browser_wait_for
  - mcp__playwright__browser_press_key
  - mcp__playwright__browser_select_option
  - mcp__conductor__AskUserQuestion
---

# ux-explorer: UX Exploration as a New User

You are running the `/ux-explorer` workflow. You will start the app locally,
explore it as a realistic first-time user, write a narrative journal of your
experience, then compile a list of bugs and UX issues, cross-reference them
against open GitHub issues, and offer to file new ones.

## Step 0 — Establish the persona

If the user supplied an argument (e.g. `/ux-explorer a retired teacher planning a gap year`),
use that as the basis for your persona. Otherwise invent a persona that is plausible for
the type of app you are about to explore.

Give the persona a name and 3–4 bullet-point traits that will shape how they use the app
(e.g. level of tech-savviness, patience, goals). Print the persona at the start so the
user can see who you are playing.

Stay in character throughout all narrative sections.

**Hard rules:**
- Never skip a screen — take a snapshot before every interaction.
- Record every moment of confusion, surprise, or delight.
- Never invent issues that didn't actually happen — only report what you observed.

---

## Step 1 — Start the local Solid server

```bash
bash .claude/skills/solid-dev/start.sh
```

Note the credentials and save the CSS PID printed in the output for later cleanup.

---

## Step 2 — Start the dev server

```bash
npm run dev > /tmp/vite.log 2>&1 &
VITE_PID=$!
echo "Vite PID: $VITE_PID"
```

Poll until ready:

```bash
for i in $(seq 1 30); do
  curl -sf http://localhost:5173/ -o /dev/null && echo "Dev server ready" && break
  echo "Waiting... ($i/30)"
  sleep 1
done
```

---

## Step 3 — Explore the app

Navigate to `http://localhost:5173`. Use Playwright to discover and explore the app
organically — follow what the UI presents rather than assuming a fixed structure.

After **every meaningful interaction**, write a short paragraph (2–5 sentences) in
the persona's first-person voice: what you see, what you do, and how it feels.

Aim to cover:
- First impression of the landing / home screen
- Authentication or sign-up (use the local Solid server at `http://localhost:4000`
  with email `test@example.com` / password `test1234`)
- Any onboarding or setup flow
- The main feature(s) of the app — create, view, edit, delete content as the persona would
- Navigation between sections
- Any settings, profile, or secondary screens that are reachable

Adapt freely as the app evolves — explore whatever is actually there.

---

## Step 4 — Write out the narrative

Print the full narrative journal built up in Step 3. Use section headings that match
what actually happened (don't force headings for screens that didn't exist).

---

## Step 5 — Compile bugs and UX issues

Review your observations and produce a structured list:

| # | Type | Title | Description | Severity |
|---|------|-------|-------------|----------|
| 1 | Bug / UX Issue / Missing Feature | Short title | What happened vs what was expected | Low / Medium / High |

---

## Step 6 — Cross-reference open GitHub issues

```bash
gh issue list \
  --repo timgent/react-packing-app \
  --state open \
  --json number,title,body \
  --limit 100
```

For each issue in Step 5, check for keyword overlap with open issues. Annotate each:
- **Covered by #NNN** — a matching open issue exists
- **Not yet filed** — no matching open issue found

Print the annotated table.

---

## Step 7 — Offer to file new issues

Ask the user:

> "I found N issues not yet filed on GitHub. Would you like me to create GitHub issues for them?"

If yes, create each one:

```bash
gh issue create \
  --repo timgent/react-packing-app \
  --title "<short title>" \
  --body "## Description
<what happened vs what was expected>

## Severity
<Low / Medium / High>

## Discovered during
UX exploration session (/ux-explorer)"
```

Print the URL of each created issue.

---

## Step 8 — Stop servers

```bash
kill $VITE_PID 2>/dev/null || true
kill <CSS_PID> 2>/dev/null || true
```

Print: "Servers stopped. UX exploration complete."
