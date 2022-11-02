#!/bin/bash

gpg --symmetric --cipher-algo AES256 wallet.json
echo 'Done'
