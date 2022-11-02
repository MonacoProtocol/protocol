#!/bin/bash

# script to check if the version in the TOML for a program has been deployed
# if the version has been deployed, exit with an error

# usage ./check_deploy_status.sh -p PROGRAM_NAME

set -e

DEPLOYED=false

while getopts p: flag
do
    case "${flag}" in
        p) PROGRAM=${OPTARG};;
    esac
done

VERSION_MANAGER="./ci/version_manager"
VERSION_FILE="${VERSION_MANAGER}/versions/${PROGRAM}.json"

VERSION_TO_CHECK=`${VERSION_MANAGER}/get_toml_version.sh -p $PROGRAM`
DEPLOYED=`jq --arg version_to_check "$VERSION_TO_CHECK" '.versions[] | select(.version == $version_to_check) |.deployed' $VERSION_FILE`

echo "Checking deployment status of $PROGRAM version $VERSION_TO_CHECK"

if [ "$DEPLOYED" == "true" ]
then
    echo "Error - Version Deployed - TOML needs updating"
    exit 1
else
    echo "OK to proceed"
fi
