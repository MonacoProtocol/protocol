#!/bin/bash

# update wallet balance (currently capped at 2 SOL on devnet and 1 SOL on testnet)

# usage ./update_wallet_balance.sh -p PUBKEY -a AMOUNT

set -e

PUBKEY="98CVwMftrhm6zutmV29frqRPfXsocbFnwjXVxYo7xbHX"
UPDATE_AMOUNT=2

while getopts p: flag
do
    case "${flag}" in
        p) PUBKEY=${OPTARG};;
        a) UPDATE_AMOUNT=${OPTARG};;
    esac
done

solana airdrop --verbose $UPDATE_AMOUNT $PUBKEY
