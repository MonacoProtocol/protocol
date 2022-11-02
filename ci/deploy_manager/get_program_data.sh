#!/bin/bash

# get program data for a program by environment

# usage  ./ci/deploy_manager/get_program_data.sh -e ENVIRONMENT < devnet | testnet > -t BUILD_TYPE < stable | dev >

set -euxo pipefail

PROGRAM="monaco_protocol"
TYPE="dev"

while getopts t:e: flag
do
    case "${flag}" in
        t) TYPE=${OPTARG};;
        e) ENVIRONMENT=${OPTARG};;
    esac
done

HISTORY_FILE="./ci/deploy_manager/program_data.json"

jq --arg program ${PROGRAM} --arg env ${ENVIRONMENT} --arg type ${TYPE} '. | .[$program] | .[$env] | .[$type]' $HISTORY_FILE
