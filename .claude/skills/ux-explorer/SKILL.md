---
name: ux-explorer
version: 1.0.0
description: |
  Run the app with a local Solid server, explore it as a realistic new user,
  write a narrative of the experience, then summarise bugs/UX issues. Checks
  open GitHub issues for duplicates and offers to file new ones.
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
then explore it as **Alex** — a realistic first-time user — writing a narrative
journal of your experience. At the end you will compile a list of bugs and UX
issues, cross-reference them against open GitHub issues, and offer to file new ones.

**Persona — Alex:**
- 32-year-old frequent traveller (business and leisure trips)
- Reasonably tech-savvy but impatient with friction or unclear UI
- Uses a phone more than a desktop; expects things to "just work"
- Has never used this app before — treat every screen as unfamiliar

**Hard rules:**
- Stay in character as Alex throughout the narrative sections.
- Never skip a screen — take a snapshot before every interaction.
- Record every moment of confusion, surprise, or delight.
- Never invent issues that didn't actually happen — only report what you observed.

---

## Step 1 — Start the local Solid server

Run the existing solid-dev start script:

```bash
bash .claude/skills/solid-dev/start.sh
```

Note the output credentials:
- **OIDC Issuer:** `http://localhost:4000`
- **Email:** `test@example.com`
- **Password:** `test1234`
- **WebID:** `http://localhost:4000/test/profile/card#me`

Save the CSS PID printed in the output for later cleanup.

---

## Step 2 — Start the Vite dev server

```bash
npm run dev > /tmp/vite.log 2>&1 &
VITE_PID=$!
echo "Vite PID: $VITE_PID"
```

Wait until the dev server is ready:

```bash
for i in $(seq 1 30); do
  curl -sf http://localhost:5173/ -o /dev/null && echo "Vite ready" && break
  echo "Waiting for Vite... ($i/30)"
  sleep 1
done
```

---

## Step 3 — Explore the app as Alex

Use Playwright to navigate the app. After **every meaningful interaction**, write a
short paragraph (2–5 sentences) in Alex's first-person voice describing what you
see, what you do, and how it feels. Build up a running narrative throughout this step.

Work through these flows in order — adapt if the app presents a different structure:

### 3a. First impression
- Navigate to `http://localhost:5173`
- Take a screenshot and snapshot
- Describe the landing page: is it immediately clear what the app does? Is there
  a call to action? Does it feel polished?

### 3b. Login / sign up
- Locate the login or sign-in button
- Use the **Custom / Other provider** option and enter `http://localhost:4000` as
  the OIDC issuer
- Complete the Solid login flow using email `test@example.com` / password `test1234`
- Note any friction: confusing labels, redirects, unclear error messages

### 3c. Onboarding (if present)
- If there is a setup wizard or onboarding flow, go through it fully
- Answer questions as Alex would (e.g. travelling for work, typical trip length 3–5 days)
- Note any questions that feel odd, redundant, or are hard to answer

### 3d. Create a packing list
- Find where to create a new packing list
- Create a list for a 4-day work trip to Berlin
- Note whether the creation flow is fast or tedious

### 3e. Add and remove items
- Add at least 5 items to the list
- Remove one item
- Note whether adding/removing is intuitive and whether the UI updates smoothly

### 3f. Navigate around
- Explore all reachable sections of the app (navbar, sidebar, settings, etc.)
- Take a screenshot of each distinct screen
- Note any navigation that is confusing or missing

### 3g. Settings / profile (if present)
- Find and visit any settings or profile page
- Note what options exist and whether they're useful

---

## Step 4 — Write out the narrative

Print the full narrative journal you built up in Step 3, formatted as:

```
## Alex's Journey

### First Impression
<paragraph>

### Logging In
<paragraph>

### Onboarding
<paragraph>

### Creating a Packing List
<paragraph>

### Adding Items
<paragraph>

### Exploring the App
<paragraph>

### Settings & Profile
<paragraph>
```

---

## Step 5 — Compile bugs and UX issues

Review your observations and produce a structured list. For each issue:

| # | Type | Title | Description | Severity |
|---|------|-------|-------------|----------|
| 1 | Bug / UX Issue / Missing Feature | Short title | What happened vs what was expected | Low / Medium / High |

Types:
- **Bug** — something broken or behaving incorrectly
- **UX Issue** — something that works but is confusing, slow, or frustrating
- **Missing Feature** — something Alex expected to exist but didn't

---

## Step 6 — Cross-reference open GitHub issues

Fetch all open issues:

```bash
gh issue list \
  --repo timgent/react-packing-app \
  --state open \
  --json number,title,body \
  --limit 100
```

For each issue in your list from Step 5, search the fetched issues for keyword
overlap (title + body). Annotate each issue:
- **Covered by #NNN** — if an open issue clearly describes the same problem
- **Not yet filed** — if no matching open issue exists

Print the annotated table.

---

## Step 7 — Offer to file new issues

Count the issues marked "Not yet filed". Then ask the user:

```
mcp__conductor__AskUserQuestion: "I found N issues not yet filed on GitHub. Would you like me to create GitHub issues for them?"
```

If the user says yes, for each unfiled issue create a GitHub issue:

```bash
gh issue create \
  --repo timgent/react-packing-app \
  --title "<short title>" \
  --body "$(cat <<'EOF'
## Description
<what happened vs what was expected>

## Steps to reproduce
<if applicable>

## Severity
<Low / Medium / High>

## Discovered during
UX exploration session via /ux-explorer skill
EOF
)"
```

Print the URL of each created issue.

---

## Step 8 — Stop servers

```bash
kill $VITE_PID 2>/dev/null || true
```

For the Solid CSS server, use the PID printed in Step 1:

```bash
kill <CSS_PID> 2>/dev/null || true
```

Print: "Servers stopped. UX exploration complete."
