#!/bin/bash

while getopts p: flag
do
    case "${flag}" in
        p) PROGRAM=${OPTARG};;
    esac
done

TOML_PATH="./programs/$PROGRAM"

# get current version from .toml file
CARGO_TOML="${TOML_PATH}/Cargo.toml"
IFS="="
while read -r CONFIG_NAME CONFIG_VALUE
do
if [ `echo $CONFIG_NAME | xargs`  == "version" ]
then
    TOML_VERSION=` echo $CONFIG_VALUE | xargs | tr -d '"'`
    break
fi
done < $CARGO_TOML

echo $TOML_VERSION
