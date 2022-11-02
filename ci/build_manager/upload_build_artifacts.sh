#!/bin/bash

# upload build artifacts

# usage ./save_build_artifacts.sh -t BUILD_TYPE -a AWS_BUCKET
# ./ci/build_manager/upload_build_artifacts.sh -t dev -b betdex-core-programs

set -euxo pipefail

PROGRAM="monaco_protocol"
BUCKET="betdex-core-programs"

while getopts t:b: flag
do
    case "${flag}" in
        t) TYPE=${OPTARG};;
        b) BUCKET=${OPTARG};;
    esac
done

aws s3 sync --acl private ${TYPE}/ s3://${BUCKET}/${PROGRAM}/${TYPE}/

rm -f -R ${TYPE}
