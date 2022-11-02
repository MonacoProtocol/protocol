import {
  Program,
  AnchorProvider,
  setProvider,
  workspace,
} from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import assert from "assert";
import { getWalletTokenBalancesWithSol } from "../../npm-client/src";
import {
  createNewMint,
  createAssociatedTokenAccountWithBalance,
} from "../util/test_util";

describe("Get Wallet Balance", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);
  const newMintDecimals = 9;
  const newMintValue = 10000;
  const solanaTokenName = "solana";

  it("With other token balance", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const nodeWallet = provider.wallet as NodeWallet;
    const newMint = await createNewMint(provider, nodeWallet, newMintDecimals);

    await createAssociatedTokenAccountWithBalance(
      newMint,
      provider.wallet.publicKey,
      newMintValue,
    );
    const balanceResponse = await getWalletTokenBalancesWithSol(
      protocolProgram,
      [newMint],
    );

    const balance = balanceResponse.data.balances;

    const solanaBalance = balance.filter(
      (token) => token.token == solanaTokenName,
    )[0];
    const newMintBalance = balance.filter(
      (token) => token.token == newMint.toString(),
    )[0];

    assert(solanaBalance.balance.uiAmount > 0);
    assert.equal(solanaBalance.token, solanaTokenName);

    assert.equal(newMintBalance.token, newMint.toString());
    assert.equal(
      newMintBalance.balance.amount,
      newMintValue * 10 ** newMintDecimals,
    );
    assert.equal(newMintBalance.balance.decimals, newMintDecimals);
    assert.equal(newMintBalance.balance.uiAmount, newMintValue);
    assert.equal(
      newMintBalance.balance.uiAmountString,
      newMintValue.toString(),
    );
  });

  it("With no other token balance", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const nodeWallet = provider.wallet as NodeWallet;
    const newMint = await createNewMint(provider, nodeWallet, newMintDecimals);

    const balanceResponse = await getWalletTokenBalancesWithSol(
      protocolProgram,
      [newMint],
    );

    const balance = balanceResponse.data.balances;

    const newMintBalance = balance.filter(
      (token) => token.token == newMint.toString(),
    )[0];

    assert.equal(newMintBalance.balance.amount, "0");
    assert.equal(newMintBalance.balance.decimals, 0);
    assert.equal(newMintBalance.balance.uiAmount, 0);
    assert.equal(newMintBalance.balance.uiAmountString, "0");
  });
});
