import {
  BN,
  Program,
  AnchorProvider,
  setProvider,
  workspace,
  web3,
} from "@project-serum/anchor";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import assert from "assert";
import { createNewMint } from "../util/test_util";
import {
  createMarket,
  createMarketWithOutcomesAndPriceLadder,
  MarketType,
} from "../../npm-admin-client/src";
import { getMarketOutcomeTitlesByMarket } from "../../npm-client/src/market_outcome_query";

describe("Admin Client Create Market", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);
  const newMintDecimals = 9;
  const marketLockTimestamp = new BN(1924254038);
  const marketTitle = "Test Market";
  const marketType = MarketType.EventResultWinner;

  it("Creates a market", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const nodeWallet = provider.wallet as NodeWallet;
    const event = web3.Keypair.generate();
    const newMintPk = await createNewMint(
      provider,
      nodeWallet,
      newMintDecimals,
    );
    const market = await createMarket(
      protocolProgram,
      marketTitle,
      marketType,
      newMintPk,
      marketLockTimestamp,
      event.publicKey,
    );

    assert(market.success);
    assert(market.data.marketPk);
    assert(market.data.tnxId);
    assert.deepEqual(market.errors, []);
    assert.deepEqual(market.data.market.mintAccount, newMintPk);
    assert.deepEqual(market.data.market.title, marketTitle);
  });
});

describe("Admin Client Create Full Market", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);
  const newMintDecimals = 9;
  const marketLockTimestamp = new BN(1924254038);
  const marketTitle = "Test Market";
  const marketOutcomes = ["TEAM_1", "TEAM_2"];
  const marketType = MarketType.EventResultWinner;

  it("Creates a market with outcomes and ladder", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const nodeWallet = provider.wallet as NodeWallet;
    const event = web3.Keypair.generate();
    const newMintPk = await createNewMint(
      provider,
      nodeWallet,
      newMintDecimals,
    );
    const market = await createMarketWithOutcomesAndPriceLadder(
      protocolProgram,
      marketTitle,
      marketType,
      newMintPk,
      marketLockTimestamp,
      event.publicKey,
      marketOutcomes,
      [1.001],
    );

    const outcomeTitles = await getMarketOutcomeTitlesByMarket(
      protocolProgram,
      market.data.marketPk,
    );

    assert.deepEqual(market.errors, []);
    assert(market.success);
    assert(market.data.market);
    assert(market.data.priceLadderResults);
    assert(market.data.tnxId);
    assert.deepEqual(market.errors, []);
    assert.deepEqual(market.data.market.mintAccount, newMintPk);
    assert.deepEqual(market.data.market.title, marketTitle);
    assert.equal(market.data.priceLadderResults.length, marketOutcomes.length);
    assert.deepEqual(outcomeTitles.data.marketOutcomeTitles, marketOutcomes);
  });
});
