#!/usr/bin/env bash
set -e

# Load environment
source ./.env

if [ "$MODE" == "local" ]; then
    RPC_URL=http://127.0.0.1:8545
    CHAIN_ID=31337
else
    RPC_URL=https://gcp-1.seismictest.net/rpc
    CHAIN_ID=5124
fi

BROADCAST_OUT=./broadcast/Deploy.s.sol/$CHAIN_ID/run-latest.json

sforge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast --unsafe-private-storage

jq -r '[.transactions[] | select(.transactionType == "CREATE") | {(.contractName): .contractAddress}] | add' "$BROADCAST_OUT" > ./out/deploy.json
echo "Deployed contracts:"
cat ./out/deploy.json
