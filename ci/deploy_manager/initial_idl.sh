#!/bin/bash

# Initialises IDL for given program on the chosen environment
# https://book.anchor-lang.com/chapter_4/cli.html#idl-init
# Will fail if the program does not have a program ID registered in ci/deploy_manager/program_data.json

# usage  ./ci/deploy_manager/initial_idl.sh -p PROGRAM -e ENVIRONMENT

while getopts p:e: flag
do
    case "${flag}" in
        p) PROGRAM=${OPTARG};;
        e) ENVIRONMENT=${OPTARG};;
    esac
done

WALLET_MANAGER="./ci/wallet_manager"
DEPLOY_MANAGER="./ci/deploy_manager"
PROGRAM_ID=`$DEPLOY_MANAGER/get_program_data.sh -p $PROGRAM -e $ENVIRONMENT | jq -r .program_id`

if [ $PROGRAM_ID == null ]
then
    echo "No Program ID found \nAborting Update"
    exit 1
else
    echo "Program ID: $PROGRAM_ID"
fi

echo "Upgrading IDL for $PROGRAM on $ENVIRONMENT"
anchor idl init --provider.cluster $ENVIRONMENT --provider.wallet $WALLET_MANAGER/wallet.json -f target/idl/$PROGRAM.json $PROGRAM_ID
