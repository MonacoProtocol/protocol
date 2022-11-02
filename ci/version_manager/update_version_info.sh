#!/bin/bash

# bash script to check/update a version history recording semantic versioning alongside sha checksum and commit sha
# version bump based on Cargo.toml version in program dir
# if version exists in history but checksum changes, updates the version history checksum

# usage ./update_version_info.sh -p PROGRAM_NAME -s NEW_SHA_CHECKSUM -c COMMIT_SHA

set -e

COMMIT="0000000"

while getopts p:s:c: flag
do
    case "${flag}" in
        p) PROGRAM=${OPTARG};;
        s) SHA_CHECKSUM=${OPTARG};;
        c) COMMIT=${OPTARG};;
    esac
done

VERSION_MANAGER="./ci/version_manager"

# confirm whether we can update info based on deploy status (once marked deployed we should be using a new version)
echo
${VERSION_MANAGER}/check_deploy_status.sh -p $PROGRAM

COMMIT=`cut -c -7 <<< $COMMIT`

TOML_PATH="./programs/$PROGRAM"
VERSION_FILE="${VERSION_MANAGER}/versions/${PROGRAM}.json"
echo "Updating version_history for $PROGRAM"

# get latest version info then trimming quotes 's from the result
CURRENT_VERSION=`${VERSION_MANAGER}/get_latest_version.sh -p $PROGRAM | jq .version | tr -d '"'`

# get latest sha checksum
CURRENT_CHECKSUM=`${VERSION_MANAGER}/get_latest_version.sh -p $PROGRAM | jq .checksum | tr -d '"'`

# get current .toml version
TOML_VERSION=`${VERSION_MANAGER}/get_toml_version.sh -p $PROGRAM`

# output all the information we are making a decision on
echo "Current build version: ${CURRENT_VERSION}"
echo "Current toml version: ${TOML_VERSION}"
echo "Current build checksum: ${CURRENT_CHECKSUM}"
echo "Latest build checksum: $SHA_CHECKSUM"

NEXT_VERSION_INFO=$( cat << END
    {
        "version": "${TOML_VERSION}",
        "previous_version": "${CURRENT_VERSION}",
        "checksum": "${SHA_CHECKSUM}",
        "commit": "${COMMIT}"
    }
END
)

# if the current build version matches the toml version then we have nothing to update
if [ "$CURRENT_VERSION" == "$TOML_VERSION" ]
then
    if [ "$CURRENT_CHECKSUM" == "$SHA_CHECKSUM" ]
    then
        echo "No update necessary \nDone"
        break
    else
        echo "Updating SHA checksum for version: $CURRENT_VERSION"
        # create a temp file output jq query updating existing version object then replace version file with tmp file
        touch tmp
        jq --arg updated_checksum "$SHA_CHECKSUM" --arg version_to_update "$CURRENT_VERSION" '.versions |= map((select(.version == $version_to_update) | .checksum) |= $updated_checksum)' $VERSION_FILE > tmp
        mv tmp $VERSION_FILE
        echo 'Done'
    fi
else
    # form next version json
    echo "New version info: $NEXT_VERSION_INFO"

    # create a temp file output jq query adding new object then replace version file with tmp file
    touch tmp
    jq --argjson next_version "$NEXT_VERSION_INFO" ' .versions += [$next_version]' $VERSION_FILE  > tmp
    mv tmp $VERSION_FILE

    echo 'Done'
fi
