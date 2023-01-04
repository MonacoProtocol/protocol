#!/bin/bash

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
PRIVATE_FORK_PATH="$(pwd)"
PUBLIC_FORK_PATH="$(pwd)/../protocol"
FILES_MODIFIED_PATH="${PRIVATE_FORK_PATH}/files-modified"

# track any changed files, ignoring changes to .github/ ci files
git ls-files --modified -- . ':!:.github/*'  > ${FILES_MODIFIED_PATH}

# switch to public fork
cd $PUBLIC_FORK_PATH
git checkout main && git pull origin main

# if branch already exists checkout, else create
if [ `git rev-parse --verify $CURRENT_BRANCH 2>/dev/null` ]
then
   echo "Checked out existing branch ${CURRENT_BRANCH} at ${pwd}"
   git checkout $CURRENT_BRANCH
else
   echo "Creating new branch ${CURRENT_BRANCH} at ${pwd}"
   git checkout -b $CURRENT_BRANCH
fi

# sync files from -private repo to public fork
rsync -av --files-from=${FILES_MODIFIED_PATH} ${PRIVATE_FORK_PATH} ${PUBLIC_FORK_PATH} --no-R
rm ${FILES_MODIFIED_PATH}

# create new commit, prompt for message, and push
git add .
read -p "Please enter commit message for your changes: " COMMIT_MESSAGE
git commit -m "${COMMIT_MESSAGE}"
git push origin ${CURRENT_BRANCH}
