#!/bin/bash

# build and test program outputting build and logs

# usage  ./ci/build_manager/build_and_test.sh -t BUILD_TYPE < stable | dev | release >
# ./ci/build_manager/build_and_test.sh -t dev

set -euxo pipefail

PROGRAM="monaco_protocol"

while getopts t: flag
do
    case "${flag}" in
        t) TYPE=${OPTARG};;
    esac
done

rm -f {build_log,test_log}
touch test_log build_log

cargo test 2>&1 | tee test_log
anchor test 2>&1 | tee -a test_log
anchor build -p ${PROGRAM} -- --features ${TYPE} 2>&1 | tee build_log
