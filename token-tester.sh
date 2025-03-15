#!/bin/bash

# A simple script to test Solana token validation
# Usage: ./token-tester.sh <token_address>

# Set default token if none provided
TOKEN=${1:-"Cj8zB9spEzCA8Jd42zWmYvFwGHuMzfseuahBr3xLpump"}

echo "Testing Solana token: $TOKEN"
echo "Fetching data from Jupiter API..."

# Try to get token data from Jupiter API
curl -s "https://token.jup.ag/all" | jq -r ".[] | select(.address == \"$TOKEN\")"

# Also try Solana token list API
echo "Fetching from Solana token registry..."
curl -s "https://token-list-api.solana.com/v1/tokens/$TOKEN"

echo "Running token validation with debug.js..."
node debug.js solana $TOKEN
