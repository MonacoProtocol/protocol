#!/bin/bash

# download a program artifact from AWS for given program and artifact type
# artifact type can be either build or idl (defaults to build)
# optional -o <OUTPUT_DIR> dir to output result, defaults to download

# usage  ./ci/deploy_manager/download_artifact.sh -b BUILD -a ARTIFACT < build | idl > -o OUTPUT_DIR
# ./ci/build_manager/download_artifact.sh -b 0.1.0.dev.bbb9c3df -a idl -o target/idl

TYPE="dev"
PROGRAM="monaco_protocol"
BUCKET="betdex-core-programs"
ARTIFACT="build"
ARTIFACT_PATH="deploy"
FILE_TYPE="so"
OUTPUT_DIR="download"

while getopts b:a:o: flag
do
    case "${flag}" in
        b) BUILD=${OPTARG};;
        a) ARTIFACT=${OPTARG};;
        o) OUTPUT_DIR=${OPTARG};;
    esac
done

if [[ "$BUILD" == *"stable"* ]]; then
  TYPE="stable"
fi

if [ $ARTIFACT == "idl" ]
then
    ARTIFACT_PATH="$ARTIFACT"
    FILE_TYPE="json"
fi

FILE="${BUILD}.${FILE_TYPE}"

echo "Getting ${TYPE} ${ARTIFACT} for ${BUILD}.${FILE_TYPE}"

mkdir -p ${OUTPUT_DIR} -v

aws s3api get-object --bucket ${BUCKET} --key ${PROGRAM}/${TYPE}/${ARTIFACT_PATH}/${FILE} ${OUTPUT_DIR}/${FILE}

echo "File saved to ${OUTPUT_DIR}/${FILE}"
