#!/usr/bin/env bash
set -e

# Load environment
if [ -f ../.env ]; then
  source ../.env
fi

RPC_URL="${SEISMIC_RPC_URL:-https://gcp-1.seismictest.net/rpc}"
CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL")

echo "Deploying 50 SRC20 tokens + SRC20Multicall..."
echo "RPC: $RPC_URL"

DEPLOYER_PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" sforge script script/DeployMultiToken.s.sol:DeployMultiToken \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --unsafe-private-storage

BROADCAST_OUT="broadcast/DeployMultiToken.s.sol/$CHAIN_ID/run-latest.json"

if [ -f "$BROADCAST_OUT" ]; then
  MULTICALL_ADDRESS=$(jq -r '.transactions[] | select(.contractName == "SRC20Multicall") | .contractAddress' "$BROADCAST_OUT")
  TOKEN_ADDRESSES=$(jq -r '[.transactions[] | select(.contractName == "MockSRC20") | .contractAddress] | unique' "$BROADCAST_OUT")

  mkdir -p ./out
  cat > ./out/batch-read-deploy.json << EOF
{
  "multicall": "$MULTICALL_ADDRESS",
  "tokens": $TOKEN_ADDRESSES
}
EOF

  echo "Deployment complete:"
  cat ./out/batch-read-deploy.json
else
  echo "Warning: Broadcast output not found at $BROADCAST_OUT"
fi
