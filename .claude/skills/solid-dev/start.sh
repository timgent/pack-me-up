#!/usr/bin/env bash
set -e

# Install JQ
if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found, installing..."

  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if ! command -v brew >/dev/null 2>&1; then
      echo "Homebrew not found. Please install Homebrew first: https://brew.sh/"
      exit 1
    fi
    brew install jq

  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Ubuntu / Debian
    sudo apt-get update
    sudo apt-get install -y jq

  else
    echo "Unsupported OS: $OSTYPE"
    exit 1
  fi
else
  echo "jq is already installed"
fi

PORT=4000

# 1. Free the port
lsof -ti:$PORT | xargs kill -9 2>/dev/null || true

# 2. Start CSS in background
npx --yes @solid/community-server -p $PORT >/tmp/css.log 2>&1 &
CSS_PID=$!
echo "CSS starting (PID $CSS_PID)..."

# 3. Wait until ready
for i in $(seq 1 30); do
  curl -sf http://localhost:$PORT/ -o /dev/null && break
  echo "Waiting... ($i/30)"
  sleep 1
done

# 4a. Create account, capture token and account-specific URLs
echo "Creating account..."
ACCOUNT_RESP=$(curl -s -X POST http://localhost:$PORT/.account/account/ \
  -H 'Content-Type: application/json' -d '{}')
echo "ACCOUNT_RESP is $ACCOUNT_RESP"
TOKEN=$(echo "$ACCOUNT_RESP" | grep -o '"authorization":"[^"]*"' | cut -d'"' -f4)
# Discover account-specific URLs via authenticated GET
CONTROLS=$(curl -s -H "Authorization: CSS-Account-Token $TOKEN" http://localhost:$PORT/.account/)
POD_URL=$(echo "$CONTROLS" | grep -o '"pod":"http://[^"]*"' | cut -d'"' -f4)
PASSWORD_URL=$(echo "$CONTROLS" | jq -r '.controls.password.create')

echo PASSWORD_URL is $PASSWORD_URL
echo TOKEN is $TOKEN

# 4b. Register email/password login
echo "Registering email/password login"
curl -s -X POST "$PASSWORD_URL" \
  -H 'Content-Type: application/json' \
  -H "Authorization: CSS-Account-Token $TOKEN" \
  -d '{"email":"test@example.com","password":"test1234"}'

# 4c. Create pod
echo "Creating pod"
curl -s -X POST "$POD_URL" \
  -H 'Content-Type: application/json' \
  -H "Authorization: CSS-Account-Token $TOKEN" \
  -d '{"name":"test"}'

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
