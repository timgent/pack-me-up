#!/usr/bin/env bash
set -e

PORT=4000

# 1. Free the port
lsof -ti:$PORT | xargs kill -9 2>/dev/null || true

# 2. Start CSS in background
npx --yes @solid/community-server -p $PORT > /tmp/css.log 2>&1 &
CSS_PID=$!
echo "CSS starting (PID $CSS_PID)..."

# 3. Wait until ready
for i in $(seq 1 30); do
  curl -sf http://localhost:$PORT/ -o /dev/null && break
  echo "Waiting... ($i/30)"
  sleep 1
done

# 4a. Create account
curl -s -c /tmp/css-cookies.txt -X POST http://localhost:$PORT/.account/ \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"test1234"}' > /dev/null

# 4b. Create pod
curl -s -b /tmp/css-cookies.txt -X POST http://localhost:$PORT/.account/pod/ \
  -H 'Content-Type: application/json' \
  -d '{"name":"test"}' > /dev/null

echo ""
echo "============================================"
echo "  Local Solid Server ready"
echo "============================================"
echo "  OIDC Issuer : http://localhost:$PORT"
echo "  WebID       : http://localhost:$PORT/test/profile/card#me"
echo "  Email       : test@example.com"
echo "  Password    : test1234"
echo "============================================"
echo "  In the app: Custom provider -> http://localhost:$PORT"
echo "  Stop server: kill $CSS_PID"
echo "============================================"
