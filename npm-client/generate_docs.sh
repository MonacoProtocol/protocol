#!/bin/bash

cd $(dirname $0)

declare -a endpoints=(
    "queries/account_query"
    "order"
    "order_query"
    "cancel_order"
    "cancel_order_instruction"
    "create_order_instruction"
    "create_order"
    "market_matching_pools"
    "market_matching_pool_query"
    "market_outcomes"
    "market_outcome_query"
    "market_position"
    "market_position_query"
    "market_prices"
    "markets"
    "market_query"
    "product"
    "product_query"
    "trade"
    "trade_query"
    "utils"
    "wallet_tokens"
)

declare -a types=(
    "account_query"
    "order"
    "client"
    "default_price_ladder"
    "errors"
    "get_account"
    "market_position"
    "market"
    "matching_pool"
    "product"
    "protocol"
    "trade"
    "wallet_tokens"
    "transactions"
)

npm run build
wait

createDocs(){
    rm -R -f docs/${1}/${3}.md &&
    mkdir -p `dirname docs/${1}/${3}.md`
    echo "Generating docs for ${2}/${3}" &&
    npm exec -- documentation build --document-exported ${2}/${3}.d.ts -f md >> docs/${1}/${3}.md
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
