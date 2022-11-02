#!/bin/bash

# get the latest version info of the supplied program

# usage ./get_latest_version.sh -p PROGRAM_NAME

while getopts p: flag
do
    case "${flag}" in
        p) PROGRAM=${OPTARG};;
    esac
done

VERSION_MANAGER="./ci/version_manager"
VERSION_FILE="${VERSION_MANAGER}/versions/${PROGRAM}.json"

jq '.versions | max_by(.version) ' $VERSION_FILE
