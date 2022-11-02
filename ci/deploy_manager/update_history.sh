#!/bin/bash

# bash script to log deployment history taking in arguement flags and checking the deploy history file for previous deploy information
# usage ./ci/deploy_manager/update_deploy_history.sh -a ACTIONEER -e ENVIRONMENT -b BUILD -n "additional notes"

NOTES="Standard deploy"
DEPLOY_TYPE="dev"

while getopts e:a:b:s:n: flag
do
    case "${flag}" in
        e) ENVIRONMENT=${OPTARG};;
        a) ACTIONED_BY=${OPTARG};;
        b) BUILD=${OPTARG};;
        n) NOTES=${OPTARG};;
    esac
done

if [[ "$BUILD" == *"stable"* ]]; then
  DEPLOY_TYPE="stable"
fi

HISTORY_FILE="./ci/deploy_manager/${ENVIRONMENT}_history/${DEPLOY_TYPE}.json"

# getting previous deploy info and constructing deploy id + timestamp
GET_LAST_DEPLOY=`echo ./ci/deploy_manager/get_last_deploy.sh -t $DEPLOY_TYPE -e $ENVIRONMENT`
PREVIOUS_VERSION=`$GET_LAST_DEPLOY | jq .new_version`
PREVIOUS_DEPLOY_ID=`$GET_LAST_DEPLOY | jq .deployment_id`
DEPLOY_ID=`echo ${PREVIOUS_DEPLOY_ID} + 1 | bc`
TIME=`date +"%d-%m-%y-%T"`

# form deployment info json - using cat and a here-file to make it easier to read in this script
DEPLOY_JSON=$( cat << END
    {
        "deployment_id": ${DEPLOY_ID},
        "new_version": {
            "build": "${BUILD}"
        },
        "previous_version": ${PREVIOUS_VERSION},
        "time": "${TIME}",
        "actioned_by": "${ACTIONED_BY}",
        "notes": "${NOTES}"
    }
END
)

# create tmp file and then update with latest deploy info - appending it to the front of the list
touch tmp
jq --argjson deploy_info "$DEPLOY_JSON" '.deploys += [$deploy_info]' $HISTORY_FILE  > tmp
mv tmp $HISTORY_FILE

jq '.deploys | max_by(.deployment_id)' $HISTORY_FILE
