#!/bin/bash

# Checks programs deployed for the currently set authority set with solana config set --keypair for the given solana env

# usage ./authority_check.sh -e ENVIRONMENT (testnet/devnet/mainnet-beta) -n NUM_PROGRAMS

set -e

ENVIRONMENT="mainnet-beta"

while getopts e:n: flag
do
    case "${flag}" in
        e) ENVIRONMENT=${OPTARG};;
        n) NUM_PROGRAMS=${OPTARG};;
    esac
done

URL="https://api.${ENVIRONMENT}.solana.com"

echo "Setting solana env for ${ENVIRONMENT}"
solana config set --url ${URL}

AUTHORITY_PUBKEY=`solana-keygen pubkey`
echo "Getting programs for ${AUTHORITY_PUBKEY}"

echo "Saving temporary deployed_programs file"
solana program show --programs >> deployed_programs
cat deployed_programs

NUM_PROGRAMS_FOR_AUTHORITY=`cat deployed_programs | grep ${AUTHORITY_PUBKEY} -c`
echo "Deployed programs: ${NUM_PROGRAMS_FOR_AUTHORITY}"

if [ ${NUM_PROGRAMS_FOR_AUTHORITY} -gt ${NUM_PROGRAMS} ]
then
    printf "*****\nUnknown programs associated with authority\nCheck deployed program IDs\n*****"
    rm -R deployed_programs
    exit 1
fi

echo "Removing temporary deployed_programs file"
rm -R deployed_programs
