# The Monaco Protocol :computer:

<a href="https://github.com/orgs/BetDexLabs/projects/3/views/12"><img alt="Project Board"  src="http://img.shields.io/badge/project-board-green"></a>
<a href="https://doc.rust-lang.org/std/"><img alt="Repo Language Rust"  src="http://img.shields.io/badge/language-rust-orange"></a>
<a href="https://docs.solana.com/developing/programming-model/overview"><img alt="Repo Platform Solana"  src="http://img.shields.io/badge/platform-solana-blue"></a>
<a href="https://github.com/project-serum/anchor"><img alt="Repo Framework Anchor"  src="http://img.shields.io/badge/framework-anchor-9cf"></a><br/>

![cd devnet core](https://github.com/BetDexLabs/core/actions/workflows/cd_devnet_deploy_dev.yml/badge.svg)<br/>
![ci security audits](https://github.com/BetDexLabs/core/actions/workflows/ci_security_audit.yml/badge.svg)<br/>

# About :books:

Single repo for the BetDex core platform, containing the solana programs that make up the BetDex ecosystem.

# Getting Started :white_check_mark:

## The Easy Way :computer:

- Steps can be found in [Day 1](https://github.com/BetDexLabs/docs/blob/main/engineering/day_1.md) in the engineering docs.

# Code Formatting :art:

## For Rust

We use [pre-commit](https://pre-commit.com/) hooks to format your code on commit, using the [rstfmt](https://github.com/rust-lang/rustfmt) standard as well as some other useful hooks such as one for clearing whitespace and adding a new line to EOF.

Config is found in [.pre-commit-config.yaml](/.pre-commit-config.yaml).

<details>
  <summary>Setup is pretty straight forward.</summary>

  Assuming MacOS
  ```
  brew install pre-commit
  pre-commit install
  ```
  This installs the hooks defined by [.pre-commit-config.yaml](/.pre-commit-config.yaml) into [.git/hooks/](/.git/hooks/)
</details>

If you wish to run formatting outside of a commit, run `pre-commit run --all-files`.

:grey_exclamation: Note:grey_exclamation: if pre-commit edits your files, you will need to `git add` once more before re-attempting your commit.

## For Java(Type)Script

We are now using husky to format our code pre-commit. ([husky docs](https://typicode.github.io/husky/#/?id=install))

To enable husky on your machine simple run the following.

```
  yarn prepare
```

If you want to edit the pre commit script, you'll need to edit `.husky/pre-commit`. This currently runs `npx lint-staged` which is defined in `package.json` and runs eslint and prettier against all files staged for the commmit.

# Continuous Integration

CI and project management is managed via [github actions](https://docs.github.com/en/actions), the configuration files can all be found in `.github/`. For more information:

- [Build Processes](https://github.com/BetDexLabs/docs/blob/main/engineering/build_processes.md)
- [Project Management](https://github.com/BetDexLabs/docs/blob/main/engineering/project_management.md)

## Updating the Build Script

If you are making updates to `.github/workflows/ci_build_.yml` and wish to test them, you need to also change one of the program build scripts, for example `ci_build_monaco_protocol.yml`.

These build scripts use `ci_build_.yml` as it is on `main`. To test changes you need to first commit your changes to the primary build script, then update `@main` to `@commit_hash` with the commit hash being the hash for your change (or any change since then `git log -1`).

From:

```
jobs:
  ci_build:
    uses: BetDexLabs/core/.github/workflows/ci_build_.yml@main
```

To:

```
jobs:
  ci_build:
    uses: BetDexLabs/core/.github/workflows/ci_build_.yml@4cba8a587553e7435846ba4304ecdac2d8b0dd71
```

## Tests :bar_chart:

Tests are run on pull requests pointing at `main` when there are changes detected in `programs/`. The config can be found in [ci_build_.yml](.github/workflows/ci_build_.yml)

- Unittests can be run locally with `cargo test`
- Integration tests (`/tests/**/*`) can be run locally with `anchor test`
- [Cargo test docs](https://doc.rust-lang.org/cargo/commands/cargo-test.html)

# Builds

We operate a multi-build solution for our program - this allows us to build different versions of the protocol so that we can deploy them all to the same test environment (`devnet`).

Program IDs can be viewed in [lib.rs](programs/monaco_protocol/src/lib.rs), we have a program ID for builds:

- Default (for local validators)
- Dev
- Stable

# Deploying :rocket:

- The current program authority pubkey is `98CVwMftrhm6zutmV29frqRPfXsocbFnwjXVxYo7xbHX` this account handles deployments to `devnet` and `testnet`
- Dev builds are automatically deployed onto `devnet` when they are merged to `main`
- Stable builds need to be manually triggered from the github action [devnet_deploy_stable](https://github.com/BetDexLabs/core/actions/workflows/cd_devnet_deploy_stable.yml)
- Artifacts are downloaded from AWS during the deployment process
- The wallet keypair is stored as a `gpg` file in [the wallet manager](ci/wallet_manager/wallet.json.gpg) it is decrypted during deployment using the env variable `WALLET_PASSPHRASE` then removed from the build machine post deploy

:exclamation: The `WALLET_PASSPHRASE` env variable is a temporary measure as it is not the most secure way to hold the passphrase for the gpg - this process will not be used for `mainnet` - neither will the storing of the gpg in the repo. :exclamation:

## Deploy From Local Machine

If you need to deploy from your local machine you will need the `WALLET_PASSPHRASE` to decrypt `wallet.json.gpg` in the following steps.

```
# In repo root
export WALLET_PASSPHRASE=*****
./ci/wallet_manager/decrypt_wallet.sh
./ci/wallet_manager/set_keypair.sh
./ci/build_manager/build_and_test.sh -t < BUILD TYPE >
./ci/deploy_manager/deploy_program.sh -t < BUILD TYPE > -e < ENVIRONMENT > -f target/deploy/monaco_protocol.so
./ci/deploy_manager/update_idl.sh -t < BUILD TYPE > -e < ENVIRONMENT > -f target/idl/monaco_protocol.json
./ci/wallet_manager/decrypt_wallet_cleanup.sh
unset WALLET_PASSPHRASE
```

## Initial Deployment

Before we can deploy a program continuously (regarded as upgrade by anchor) we first need to do an initial deploy and IDL initialization. This process is currently manual.

### Initial Build Deploy

```
# on main branch with ci/wallet_manager/wallet.json decrypted
./ci/build_manager/build_and_test.sh -t < BUILD TYPE >
./ci/deploy_manager/initial_deploy.sh -p < PROGRAM > -e < ENVIRONMENT >
```
Take note of the program ID outputted and add it to [program_data.json](ci/deploy_manager/program_data.json)

### IDL Initialization

```
# on main branch with ci/wallet_manager/wallet.json decrypted following initial build deploy
./ci/deploy_manager/initial_deploy.sh -e < ENVIRONMENT > -p < PROGRAM ID FROM INITIAL DEPLOY >
```

Take note of the IDL account ID outputted and add it to [program_data.json](ci/deploy_manager/program_data.json)

## Program Data

Once a program has been deployed, it has a programID on chain. Likewise, when we initialize the IDL, it is given an IDL account ID. This data varies depending on the environment. These IDs are required for program and IDL upgrades.

The data can be found in [program_data.json](/ci/deploy_manager/program_data.json) within the ci directory, you can also query by program and environment it using the [get_program_data.sh](ci/deploy_manager/get_program_data.sh) script.

```
./ci/deploy_manager/get_program_data.sh -t < BUILD TYPE > -e < ENVIRONMENT >
{
  "program_id": "5Q2hKsxShaPxFqgVtQH3ErTkiBf8NGb99nmpaGw7FCrr",
  "idl_account": "8X29c4VsW4pKeKJc5ETyWHiXAP94poM5tAznu7ut83E6"
}
```

## Authority Links

- Our primary authority in dev and test is `98CVwMftrhm6zutmV29frqRPfXsocbFnwjXVxYo7xbHX`
- Authority [98CVwMftrhm6zutmV29frqRPfXsocbFnwjXVxYo7xbHX](https://explorer.solana.com/address/98CVwMftrhm6zutmV29frqRPfXsocbFnwjXVxYo7xbHX?cluster=devnet) on devnet
- Authority [98CVwMftrhm6zutmV29frqRPfXsocbFnwjXVxYo7xbHX](https://explorer.solana.com/address/98CVwMftrhm6zutmV29frqRPfXsocbFnwjXVxYo7xbHX?cluster=testnet) on testnet

## Programs by Authority

To view the programs handled by an authority run `solana program show --programs` with your wallet keypair set.

```
Program Id                                   | Slot      | Authority                                    | Balance
5Q2hKsxShaPxFqgVtQH3ErTkiBf8NGb99nmpaGw7FCrr | 113967522 | 98CVwMftrhm6zutmV29frqRPfXsocbFnwjXVxYo7xbHX | 6.13524696 SOL
```

# NPM Client

To facilitate interactions with the protocol, we have an `npm-client` privately published to the [BetDEX Labs org](https://www.npmjs.com/settings/betdexlabs/packages) on `registry.npmjs.org`. The functions in the client facilitate testing, crank operations, and the front end; they will eventually service as a public-facing library for those who wish to build against the protocol. For more information check the [client README](npm-client/README.md).

# Admin Functions

Admin functions can be performed via scripts found in [/admin](/admin/) - for more info check the [admin/README.md](admin/README.md).


# Troubleshooting :black_joker:

## View Environment Logs

- Set your solana config for the environment you wish to monitor. For example:
  - `solana config set --url https://api.devnet.solana.com`
- Grab the programID you wish to debug from [program data](ci/deploy_manager/program_data.json)
- Run `solana logs < PROGRAM_ID >` in cli. For example:
  - `solana logs 5Q2hKsxShaPxFqgVtQH3ErTkiBf8NGb99nmpaGw7FCrr`
- You should now see a stream of actions referencing your supplied program ID (confirm by performing an action)

## Unable To Settle

- Check your solana config is pointing to the right environment
- Check your wallet created the market you are trying to settle :exclamation: Currently only the creator can settle :exclamation:
   - To do this check Solana Explorer for the environment you are on
   - Look for the market ID on solana explorer
   - Look at the first transaction for the market, this will show you the wallet that created the market
   - [Example Market on devnet](https://explorer.solana.com/address/5spU4oEjfX8nyeqiwZzA6meHzHhUTSngTQs9rFXdguMx?cluster=devnet)
   - [Example Transaction: fee payer is xBHX](https://explorer.solana.com/tx/2d6ia9ai2DT5YUdnSR5gy7sKxJ9wGQ2bewCWdSJQoTLyRBpg9Mbo4cCV2SJgouc7F9wHak1L7JYkcPvsv8tJdVri?cluster=devnet)
- Confirm the versions of the programs on your environment match the expected versions. For example to check `market.so`
  - `solana program dump 5Q2hKsxShaPxFqgVtQH3ErTkiBf8NGb99nmpaGw7FCrr monaco_protocol.so`
  - `sha256sum market.so > checksum`
  - `cat checksum`
  - This checksum should match [ci/deploy_manager/< ENVIRONMENT >_history/market.json](ci/deploy_manager/devnet_history/order.json)

# Further Reading :book:

- [Rust Docs](https://doc.rust-lang.org/book/)
- [Cargo](https://doc.rust-lang.org/cargo/index.html)
- [Solana](https://docs.solana.com/introduction)
- [Anchor](https://project-serum.github.io/anchor/getting-started/introduction.html)
- [Blog on Dev Containers in VSC](https://arivictor.medium.com/dev-environments-as-code-with-containers-and-visual-studio-code-690897a2be59)
