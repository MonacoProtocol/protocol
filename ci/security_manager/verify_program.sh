#!/bin/bash

# Full program verification - downloads assets then compares checksums

# usage ./verify_program.sh -p <PROGRAM> -e ENVIRONMENT <devnet|testnet|mainnet-beta> -t <dev|stable>

set -e

ENVIRONMENT="mainnet-beta"
SECURITY_MANAGER="./ci/security_manager"

while getopts p:e:t: flag
do
    case "${flag}" in
        p) PROGRAM=${OPTARG};;
        e) ENVIRONMENT=${OPTARG};;
        t) TYPE=${OPTARG};;
    esac
done

${SECURITY_MANAGER}/verify_program_get_assets.sh -p ${PROGRAM} -e ${ENVIRONMENT} -t ${TYPE}
${SECURITY_MANAGER}/verify_program_checksum_check.sh -c ${PROGRAM}.so -p download/${PROGRAM}.so

rm -f -R ${PROGRAM}.so download/${PROGRAM}.so
