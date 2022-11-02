#!/bin/bash

# upgrades the IDL account for the given program and environment

# usage  ./ci/deploy_manager/update_idl.sh -e ENVIRONMENT -f FILE_PATH
# ./ci/deploy_manager/update_idl.sh -e devnet -f target/idl/0.1.0.stable.21fc7474.json

PROGRAM="monaco_protocol"

while getopts e:f: flag
do
    case "${flag}" in
        e) ENVIRONMENT=${OPTARG};;
        f) FILE_PATH=${OPTARG};;
    esac
done

TYPE="dev"
if [[ "$FILE_PATH" == *"stable"* ]]; then
  TYPE="stable"
fi

WALLET_MANAGER="./ci/wallet_manager"
DEPLOY_MANAGER="./ci/deploy_manager"
PROGRAM_ID=`$DEPLOY_MANAGER/get_program_data.sh -e $ENVIRONMENT -t $TYPE | jq -r .program_id`
IDL_ACCOUNT=`$DEPLOY_MANAGER/get_program_data.sh -e $ENVIRONMENT -t $TYPE | jq -r .idl_account`

if [ $PROGRAM_ID == null ]
then
    echo "No Program ID found \nAborting Update"
    exit 1
else
    echo "Program ID: $PROGRAM_ID"
fi

if [ $IDL_ACCOUNT == null ]
then
    echo "No IDL Account found \nCreate one with initial_idl.sh\nAborting Update"
    exit 1
else
    echo "IDL account: $IDL_ACCOUNT"
fi

echo "Upgrading IDL for $PROGRAM on $ENVIRONMENT"
anchor idl upgrade --provider.cluster $ENVIRONMENT --provider.wallet $WALLET_MANAGER/wallet.json $PROGRAM_ID -f ${FILE_PATH}
