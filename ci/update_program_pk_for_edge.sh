#!/bin/bash

# The string to replace and the replacement string
RELEASE_PK_STRING="monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih"
EDGE_PK_STRING="mpDEVnZKneBb4w1vQsoTgMkNqnFe1rwW8qjmf3NsrAU"

# Path to the file
LIB_FILE="programs/monaco_protocol/src/lib.rs"
ANCHOR_FILE="Anchor.toml";

# Use `sed` to replace the string and overwrite the original file
sed -i "" -e "s/$RELEASE_PK_STRING/$EDGE_PK_STRING/g" "$LIB_FILE"
if [ $? -eq 0 ]; then
  echo "String replacement successful LIB"
else
  echo "Error occurred during string replacement LIB"
fi

# Use `sed` to replace the string and overwrite the original file
sed -i "" -e "s/$RELEASE_PK_STRING/$EDGE_PK_STRING/g" "$ANCHOR_FILE"
if [ $? -eq 0 ]; then
  echo "String replacement successful ANCHOR_FILE"
else
  echo "Error occurred during string replacement ANCHOR_FILE"
fi
