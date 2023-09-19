#!/bin/bash

cd $(dirname $0)
PATH=$(npm bin):$PATH

declare -a endpoints=(
    "market_create"
    "market_management"
    "market_outcome_prices"
    "market_outcome"
    "market_type_create"
    "market_validate"
    "market_helpers"
    "operators"
    "price_ladder"
    "utils"
)

declare -a types=(
    "client"
    "default_price_ladder"
    "markets"
    "market_type"
    "market_outcomes"
    "operator"
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
