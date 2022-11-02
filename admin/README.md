# Admin Scripts

Admin function can be performed via `yarn run admin_function` you can check these admin scripts in [package.json](/package.json). To perform any functions, the first thing required is to export:

```
export ANCHOR_WALLET=path/to/wallet.json
export ANCHOR_PROVIDER_URL=[https://](https://api.<SOLANA_ENV>.solana.com)
```

Replace solana env with the [solana cluster](https://docs.solana.com/clusters) you want to work against.

If you want to perform market or cranking actions, you will need to authorise your wallet using (ensure your wallet has some SOL too):

```
yarn run authoriseOperator <MARKET|CRANK> <OPERATOR_ID>
```

You are then set up to perform all admin functions. You can inspect the admin scripts to discover the args required, though they should error and provide information if you try to run them without the correct args.
