#!/bin/bash

# iniitial deploy of program by environment - the output program ID should then be added to ci/deploy_manager/program_data.json

# usage  ./initial_deploy.sh -p PROGRAM -e ENVIRONMENT

while getopts p:e: flag
do
    case "${flag}" in
        p) PROGRAM=${OPTARG};;
        e) ENVIRONMENT=${OPTARG};;
    esac
done

WALLET_MANAGER="./ci/wallet_manager"

echo "Initial Deploy of $PROGRAM on $ENVIRONMENT"
anchor deploy --provider.cluster $ENVIRONMENT --provider.wallet $WALLET_MANAGER/wallet.json -p $PROGRAM
