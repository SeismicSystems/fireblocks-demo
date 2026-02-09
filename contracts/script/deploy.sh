#!/bin/bash
set -e

# Load environment
if [ -f ../.env ]; then
  source ../.env
fi

RPC_URL="${SEISMIC_RPC_URL:-https://node-2.seismicdev.net/rpc}"

echo "Deploying TestSRC20 to Seismic..."
echo "RPC: $RPC_URL"

sforge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC_URL" \
  --broadcast \
  -vvvv

echo "Deployment complete."
