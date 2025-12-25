#!/bin/bash
# Admin script to clear leaderboard and collective guesses for a date
# Usage: ./admin_clear.sh [date]
#   date: YYYY-MM-DD format (defaults to today)

set -e

DATE="${1:-$(date +%Y-%m-%d)}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"

if [ -z "$ADMIN_TOKEN" ]; then
  echo "Error: ADMIN_TOKEN environment variable not set"
  echo "Set it with: export ADMIN_TOKEN=your-secret-token"
  exit 1
fi

API_URL="${API_URL:-https://embeddage.your-domain.workers.dev}"

echo "Clearing leaderboard and collective guesses for date: $DATE"
echo "API: $API_URL"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "$API_URL/api/admin/clear?date=$DATE")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✓ Success!"
  echo "$BODY" | jq .
else
  echo "✗ Error (HTTP $HTTP_CODE):"
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  exit 1
fi



