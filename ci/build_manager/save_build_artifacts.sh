#!/bin/bash

# save build artifacts by checksum and bundle into folder based on semantic version and built type

# usage  ./save_build_artifacts.sh -v VERSION -t BUILD_TYPE < stable | dev >
# ./ci/build_manager/save_build_artifacts.sh -v 0.1.0 -t stable

set -euxo pipefail

VERSION="version"
PROGRAM="monaco_protocol"
TYPE="dev"

while getopts v:t: flag
do
    case "${flag}" in
        v) VERSION=${OPTARG};;
        t) TYPE=${OPTARG};;
    esac
done

BUILD_DIR="${TYPE}/"

FILE_NAME=`bash ./ci/build_manager/generate_build_name.sh -v ${VERSION} -t ${TYPE}`

mv -v target/deploy/${PROGRAM}.so target/deploy/${FILE_NAME}.so
mv -v target/deploy/checksum target/deploy/${FILE_NAME}_checksum
mv -v target/idl/${PROGRAM}.json target/idl/${FILE_NAME}.json
mv -v build_log ${FILE_NAME}_build_log
mv -v test_log ${FILE_NAME}_test_log

mkdir -v -p ${BUILD_DIR}/logs

mv -v -f ${FILE_NAME}_build_log ${FILE_NAME}_test_log ${BUILD_DIR}/logs/
mv -v -f target/deploy ${BUILD_DIR}
mv -v -f target/idl ${BUILD_DIR}
