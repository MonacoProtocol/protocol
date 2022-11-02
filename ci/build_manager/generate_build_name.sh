#!/bin/bash

# generate a build name based of build type and checksum

# usage  ./ci/build_manager/generate_build_name.sh -v VERSION -t BUILD_TYPE < stable | dev >
# ./ci/build_manager/generate_build_name.sh -v 0.1.0 -t dev

set -euxo pipefail

PROGRAM="monaco_protocol"

while getopts v:b:t: flag
do
    case "${flag}" in
        v) VERSION=${OPTARG};;
        t) TYPE=${OPTARG};;
    esac
done

sha256sum target/deploy/${PROGRAM}.so > target/deploy/checksum
CHECKSUM=`cat target/deploy/checksum | cut -d' ' -f1`
CHECKSUM_SHORT=`cut -c -8 <<< $CHECKSUM`
BUILD_NAME="${VERSION}.${TYPE}.${CHECKSUM_SHORT}"

echo $BUILD_NAME
