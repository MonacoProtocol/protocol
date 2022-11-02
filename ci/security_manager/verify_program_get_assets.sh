#!/bin/bash

# Get assets for latest deployed program by environment

# usage ./verify_program_get_assets.sh -e ENVIRONMENT (devnet/testnet/mainnet-beta) -t DEPLOY_TYPE

set -e

ENVIRONMENT="mainnet-beta"
DEPLOY_MANAGER="./ci/deploy_manager"
BUILD_MANAGER="./ci/build_manager"
BUCKET="betdex-core-programs"

while getopts p:t:e: flag
do
    case "${flag}" in
        p) PROGRAM=${OPTARG};;
        t) TYPE=${OPTARG};;
        e) ENVIRONMENT=${OPTARG};;
    esac
done

rm -f -R ${PROGRAM}.so target/deploy/${PROGRAM}.so

URL="https://api.${ENVIRONMENT}.solana.com"

echo "Getting program assets for ${TYPE} ${PROGRAM} on ${ENVIRONMENT}"

echo "Setting solana env for ${ENVIRONMENT}"
solana config set --url ${URL}

PROGRAM_ID=`${DEPLOY_MANAGER}/get_program_data.sh -e ${ENVIRONMENT} -t ${TYPE} | jq -r .program_id`
LAST_DEPLOY_BUILD=`${DEPLOY_MANAGER}/get_last_deploy.sh -p ${PROGRAM} -e ${ENVIRONMENT} | jq -r .new_version.build`

echo "Getting program dump of ${PROGRAM_ID}"
solana program dump ${PROGRAM_ID} ${PROGRAM}.so

bash ${BUILD_MANAGER}/download_artifact.sh -b ${LAST_DEPLOY_BUILD} -t ${TYPE} -a build
