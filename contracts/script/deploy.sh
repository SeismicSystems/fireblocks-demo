#!/bin/bash
set -e

# Load environment
if [ -f ../.env ]; then
  source ../.env
fi

RPC_URL="${SEISMIC_RPC_URL:-https://gcp-2.seismictest.net/rpc}"

echo "Deploying TestSRC20 to Seismic Testnet..."
echo "RPC: $RPC_URL"

DEPLOYER_PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" sforge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC_URL" \
  --broadcast \
  -vvvv

# Parse the broadcast output and create deploy.json
BROADCAST_OUT="broadcast/Deploy.s.sol/$(cast chain-id --rpc-url $RPC_URL)/run-latest.json"

if [ -f "$BROADCAST_OUT" ]; then
  echo "Generating deploy.json..."
  jq -r '[.transactions[] | select(.transactionType == "CREATE") | {(.contractName): .contractAddress}] | add' "$BROADCAST_OUT" > ./out/deploy.json
  
  echo "Deployed contracts:"
  cat ./out/deploy.json
else
  echo "Warning: Broadcast output not found at $BROADCAST_OUT"
fi

echo "Deployment complete."
