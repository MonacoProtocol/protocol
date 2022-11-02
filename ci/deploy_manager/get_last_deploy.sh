#!/bin/bash

# get the last deploy for a program by program name and environment

# usage  ./get_last_deploy.sh -e ENVIRONMENT -t DEPLOY_TYPE
# ./ci/deploy_manager/get_last_deploy.sh -e devnet -t stable

while getopts t:e: flag
do
    case "${flag}" in
        t) DEPLOY_TYPE=${OPTARG};;
        e) ENVIRONMENT=${OPTARG};;
    esac
done

HISTORY_FILE="./ci/deploy_manager/${ENVIRONMENT}_history/${DEPLOY_TYPE}.json"

jq '.deploys | max_by(.deployment_id)' $HISTORY_FILE
