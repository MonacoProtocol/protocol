#!/bin/bash

# Verified the on-chain program is the same program we deployed

# usage ./verify_program_checksum_check.sh -c ON_CHAIN_PROGRAM_PATH -p ORIGINAL_PROGRAM_PATH

set -e

while getopts c:p: flag
do
    case "${flag}" in
        c) ON_CHAIN=${OPTARG};;
        p) ORIGINAL=${OPTARG};;
    esac
done

# Pad out original to the size of the on-chain version
# https://github.com/solana-labs/solana/blob/b8eff3456c50558736fe2f3caea4ab98e0fc6370/docs/src/cli/deploy-a-program.md#dumping-a-program-to-a-file
truncate -r ${ON_CHAIN} ${ORIGINAL}

sha256sum ${ON_CHAIN} > on_chain_checksum
sha256sum ${ORIGINAL} > original_checksum

OC_CHECKSUM=`cat on_chain_checksum | cut -d' ' -f1`
OG_CHECKSUM=`cat original_checksum | cut -d' ' -f1`

echo "On Chain Checksum: ${OC_CHECKSUM}"
echo "Original Checksum: ${OG_CHECKSUM}"

if [ ${OG_CHECKSUM} != ${OC_CHECKSUM} ]
then
    printf "*****\nOn-chain program does not match original program\n*****"
    rm -f -R on_chain_checksum original_checksum ${ON_CHAIN} ${ORIGINAL}
    exit 1
fi

rm -f -R on_chain_checksum original_checksum
echo "Done"
