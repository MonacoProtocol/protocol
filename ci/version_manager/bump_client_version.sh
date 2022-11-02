#!/bin/bash

# usage ci/version_manager/bump_client_version.sh -v < MAJOR | MINOR | PATCH > -c < CLIENT_TYPE >

VERSION_BUMP="PATCH"

while getopts v:c: flag
do
    case "${flag}" in
        v) VERSION_BUMP=${OPTARG};;
        c) CLIENT=${OPTARG};;
    esac
done

VERSION_FILE="./npm-client/package.json"

if [ "$CLIENT" == "admin" ];
then
    VERSION_FILE="./npm-admin-client/package.json"    
fi

echo "Updating $VERSION_FILE"

# get latest version info
CURRENT_VERSION=`jq -r '. | .version' $VERSION_FILE`
echo "Current version: ${CURRENT_VERSION}"

# split current version into an array to allow us to increment version according to semantic versioning - https://semver.org/
IFS='.'
read -a VERSION_BREAKDOWN <<< "$CURRENT_VERSION"
IFS=','

# decide how much to increment by based on VERSION_BUMP flag
echo "Setting version for a ${VERSION_BUMP} release"
if [ $VERSION_BUMP == "MAJOR" ]
then
    BUMP=`echo ${VERSION_BREAKDOWN[0]} + 1 | bc`
    NEXT_VERSION="${BUMP}.0.0"
elif [ $VERSION_BUMP == "MINOR" ]
then
    BUMP=`echo ${VERSION_BREAKDOWN[1]} + 1 | bc`
    NEXT_VERSION="${VERSION_BREAKDOWN[0]}.${BUMP}.0"
else
    BUMP=`echo ${VERSION_BREAKDOWN[2]} + 1 | bc`
    NEXT_VERSION="${VERSION_BREAKDOWN[0]}.${VERSION_BREAKDOWN[1]}.${BUMP}"
fi

echo "New version info: $NEXT_VERSION"

# create a temp file to replace current version file with
touch tmp

# export updated version json to tmp file
jq --arg version "$NEXT_VERSION" '.version = $version ' $VERSION_FILE  > tmp

# update version.json
mv tmp $VERSION_FILE

echo 'Done'
