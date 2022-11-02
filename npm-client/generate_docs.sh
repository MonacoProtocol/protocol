#!/bin/bash

cd $(dirname $0)
PATH=$(npm bin):$PATH

declare -a endpoints=(
    "order_query"
    "order"
    "cancel_order"
    "create_order"
    "market_matching_pools"
    "market_outcomes"
    "market_outcome_query"
    "market_position"
    "market_prices"
    "market_query"
    "markets"
    "trade"
    "trade_query"
    "utils"
    "wallet_tokens"
)

declare -a types=(
    "order"
    "client"
    "errors"
    "get_account"
    "market_position"
    "market"
    "matching_pool"
    "protocol"
    "trade"
    "wallet_tokens"
)

npm run build
wait

createDocs(){
    rm -R -f docs/${1}/${3}.md &&
    echo "Generating docs for ${2}/${3}" &&
    documentation build --document-exported ${2}/${3}.d.ts -f md >> docs/${1}/${3}.md
}

mkdir -p docs/endpoints
for endpoint in ${endpoints[@]}; do
    createDocs "endpoints" "src" ${endpoint} &
done

mkdir -p docs/types
for type in ${types[@]}; do
    createDocs "types" "types" ${type} &
done

wait
