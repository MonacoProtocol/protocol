#!/bin/bash

createDocs(){
    echo "Generating docs for ${1}"
    mkdir -p docs/${2}
    npm exec -- documentation build --shallow --document-exported ${1} -f md >> docs/${2}/${3}.md
}

rm -rf docs
mkdir -p docs

npm run build
wait

FILES=$(find dist -name "*.d.ts" | grep -v index.d.ts)

for FILE in $FILES; do
  FILEPATH=$(dirname $FILE)
  FILENAME=$(basename $FILE .d.ts)
  DOC_FILEPATH=$(echo $FILEPATH | sed 's/dist\///')
  createDocs $FILE $DOC_FILEPATH $FILENAME &
done

wait
