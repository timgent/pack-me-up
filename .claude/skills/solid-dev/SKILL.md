---
name: solid-dev
version: 1.0.0
description: |
  Start a local Community Solid Server (CSS) for manual E2E testing.
  Launches CSS on port 4000, creates a test account and pod, then prints
  credentials and the OIDC issuer URL ready to paste into the app.
allowed-tools:
  - Bash
---

# solid-dev: Local Solid Server for E2E Testing

Starts Community Solid Server (in-memory, ephemeral) and provisions a test account.

## Steps

1. Kill any process on port 4000
2. Start CSS in the background
3. Wait until CSS is ready
4. Register a test account + pod via the CSS HTTP API
5. Print credentials

## Instructions

Run the following as a single Bash block:

```bash
# 1. Free port 4000
lsof -ti:4000 | xargs kill -9 2>/dev/null || true

# 2. Start CSS in background
npx --yes @solid/community-server -p 4000 > /tmp/css.log 2>&1 &
CSS_PID=$!
echo "CSS starting (PID $CSS_PID)..."

# 3. Wait until ready
for i in $(seq 1 30); do
  curl -sf http://localhost:4000/ -o /dev/null && break
  sleep 1
done

# 4a. Create account
curl -s -c /tmp/css-cookies.txt -X POST http://localhost:4000/.account/ \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"test1234"}' > /dev/null

# 4b. Create pod
curl -s -b /tmp/css-cookies.txt -X POST http://localhost:4000/.account/pod/ \
  -H 'Content-Type: application/json' \
  -d '{"name":"test"}' > /dev/null

# 5. Print credentials
echo ""
echo "============================================"
echo "  Local Solid Server ready"
echo "============================================"
echo "  OIDC Issuer : http://localhost:4000"
echo "  WebID       : http://localhost:4000/test/profile/card#me"
echo "  Email       : test@example.com"
echo "  Password    : test1234"
echo "============================================"
echo "  In the app: Custom provider → http://localhost:4000"
echo "  Stop server: kill $CSS_PID"
echo "============================================"
```

> **Note:** Data is in-memory — all pod content is lost when the server stops.
> Re-run the skill to get a fresh server with a clean account.
