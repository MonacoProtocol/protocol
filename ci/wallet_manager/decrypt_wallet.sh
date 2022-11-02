#!/bin/bash

gpg  --quiet --batch --yes --decrypt --passphrase="$WALLET_PASSPHRASE" \
--output ./ci/wallet_manager/wallet.json ./ci/wallet_manager/wallet.json.gpg
echo 'Done'
