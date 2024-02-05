import { AnchorProvider, setProvider, workspace, BN } from "@coral-xyz/anchor";
import assert from "assert";
import {
  settleMarket,
  publishMarket,
  unpublishMarket,
  suspendMarket,
  unsuspendMarket,
  updateMarketTitle,
  updateMarketLocktime,
  setMarketReadyToClose,
  voidMarket,
  openMarket,
  transferMarketEscrowSurplus,
  updateMarketEventStartTime,
  setMarketEventStartToNow,
} from "../../npm-admin-client/src";
import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";

describe("Settle market", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);

  it("Settles market", async () => {
    const protocolProgram = workspace.MonacoProtocol;
    const market = await monaco.create3WayMarket([1.001]);
    const settleMarketResponse = await settleMarket(
      protocolProgram,
      market.pk,
      market.matchingQueuePk,
      0,
    );
    const updatedMarket = await monaco.fetchMarket(market.pk);

    assert(settleMarketResponse.success);
    assert(settleMarketResponse.data.tnxId);
    assert.deepEqual(settleMarketResponse.errors, []);
    assert.equal(updatedMarket.marketWinningOutcomeIndex, 0);
  });

  it("Fails settle with invalid index", async () => {
    const protocolProgram = workspace.MonacoProtocol;
    const market = await monaco.create3WayMarket([1.001]);
    const settleMarketResponse = await settleMarket(
      protocolProgram,
      market.pk,
      market.matchingQueuePk,
      5,
    );
    const updatedMarket = await monaco.fetchMarket(market.pk);

    assert.equal(settleMarketResponse.success, false);
    assert.equal(settleMarketResponse.data, undefined);
    assert(settleMarketResponse.errors);
    assert.equal(updatedMarket.marketWinningOutcomeIndex, undefined);
  });
});

describe("Update market endpoints", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);
  const newTitle = "Brand New Title";
  const newLocktime = 1000 + Math.floor(new Date().getTime() / 1000);
  const newEventStartTime = 1000 + Math.floor(new Date().getTime() / 1000);

  it("Updates market", async () => {
    const protocolProgram = workspace.MonacoProtocol;
    const market = await monaco.create3WayMarket([1.001]);
    const unpublish = await unpublishMarket(protocolProgram, market.pk);
    const unpublishResponse = await monaco.fetchMarket(market.pk);

    assert(unpublish.success);
    assert(unpublish.data.tnxId);
    assert.deepEqual(unpublish.errors, []);
    assert(!unpublishResponse.published);

    const publish = await publishMarket(protocolProgram, market.pk);
    let updatedMarket = await monaco.fetchMarket(market.pk);

    assert(publish.success);
    assert(publish.data.tnxId);
    assert.deepEqual(publish.errors, []);
    assert(updatedMarket.published);

    const suspend = await suspendMarket(protocolProgram, market.pk);
    updatedMarket = await monaco.fetchMarket(market.pk);

    assert(suspend.success);
    assert(suspend.data.tnxId);
    assert.deepEqual(suspend.errors, []);
    assert(updatedMarket.suspended);

    const unsuspend = await unsuspendMarket(protocolProgram, market.pk);
    updatedMarket = await monaco.fetchMarket(market.pk);

    assert(unsuspend.success);
    assert(unsuspend.data.tnxId);
    assert.deepEqual(unsuspend.errors, []);
    assert(!updatedMarket.suspended);

    const newTitleResponse = await updateMarketTitle(
      protocolProgram,
      market.pk,
      newTitle,
    );
    updatedMarket = await monaco.fetchMarket(market.pk);

    assert(newTitleResponse.success);
    assert(newTitleResponse.data.tnxId);
    assert.deepEqual(newTitleResponse.errors, []);
    assert.equal(updatedMarket.title, "Brand New Title");

    const updateLocktimeResponse = await updateMarketLocktime(
      protocolProgram,
      market.pk,
      newLocktime,
    );
    updatedMarket = await monaco.fetchMarket(market.pk);

    assert.deepEqual(updateLocktimeResponse.errors, []);
    assert(updateLocktimeResponse.success);
    assert(updateLocktimeResponse.data.tnxId);
    assert.deepEqual(updatedMarket.marketLockTimestamp, new BN(newLocktime));

    const updateEventStartTimeResponse = await updateMarketEventStartTime(
      protocolProgram,
      market.pk,
      newEventStartTime,
    );
    updatedMarket = await monaco.fetchMarket(market.pk);

    assert.deepEqual(updateEventStartTimeResponse.errors, []);
    assert(updateEventStartTimeResponse.success);
    assert(updateEventStartTimeResponse.data.tnxId);
    assert.deepEqual(
      updatedMarket.eventStartTimestamp,
      new BN(newEventStartTime),
    );

    const startToNowResponse = await setMarketEventStartToNow(
      protocolProgram,
      market.pk,
    );
    updatedMarket = await monaco.fetchMarket(market.pk);

    assert.deepEqual(startToNowResponse.errors, []);
    assert(startToNowResponse.success);
    assert(startToNowResponse.data.tnxId);
    // Asserting the eventStart time changed need to add in assert for more accurate time check
    assert(updatedMarket.eventStartTimestamp != new BN(1924254038));
  });
});

describe("Open market", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);

  it("Open market", async () => {
    const protocolProgram = workspace.MonacoProtocol;
    const market = await monaco.createMarket(
      ["TEAM_1_WIN", "DRAW", "TEAM_2_WIN"],
      [1.001],
    );
    const openMarketResponse = await openMarket(protocolProgram, market.pk);
    const updatedMarket = await monaco.fetchMarket(market.pk);

    assert(openMarketResponse.success);
    assert(openMarketResponse.data.tnxId);
    assert.deepEqual(openMarketResponse.errors, []);
    assert.deepEqual(updatedMarket.marketStatus, { open: {} });
  });

  it("Fails when market isn't in Initializing status", async () => {
    const protocolProgram = workspace.MonacoProtocol;
    const market = await monaco.create3WayMarket([1.001]);
    const openMarketResponse = await openMarket(protocolProgram, market.pk);

    assert.equal(openMarketResponse.success, false);
    assert.equal(openMarketResponse.data, undefined);
    assert(openMarketResponse.errors);
  });
});

describe("Market ready to close", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);

  it("Set market as ready to close", async () => {
    const protocolProgram = workspace.MonacoProtocol;
    const market = await monaco.create3WayMarket([1.001]);
    await market.settle(0);
    await market.completeSettlement();

    const response = await setMarketReadyToClose(protocolProgram, market.pk);
    const updatedMarket = await monaco.fetchMarket(market.pk);

    assert(response.success);
    assert(response.data.tnxId);
    assert.deepEqual(response.errors, []);
    assert.deepEqual(updatedMarket.marketStatus, { readyToClose: {} });
  });

  it("Fails if market not settled", async () => {
    const protocolProgram = workspace.MonacoProtocol;
    const market = await monaco.create3WayMarket([1.001]);
    const response = await setMarketReadyToClose(protocolProgram, market.pk);
    const updatedMarket = await monaco.fetchMarket(market.pk);

    assert.equal(response.success, false);
    assert.equal(response.data, undefined);
    assert(response.errors);
    assert.deepEqual(updatedMarket.marketStatus, { open: {} });
  });
});

describe("Market ready to void", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);

  it("Set market as ready to void", async () => {
    const protocolProgram = workspace.MonacoProtocol;
    const market = await monaco.create3WayMarket([1.001]);

    const response = await voidMarket(protocolProgram, market.pk);
    const updatedMarket = await monaco.fetchMarket(market.pk);

    assert(response.success);
    assert(response.data.tnxId);
    assert.deepEqual(response.errors, []);
    assert.deepEqual(updatedMarket.marketStatus, { readyToVoid: {} });
  });

  it("Fails if market not initializing or open", async () => {
    const protocolProgram = workspace.MonacoProtocol;
    const market = await monaco.create3WayMarket([1.001]);

    await market.settle(0);

    const response = await voidMarket(protocolProgram, market.pk);
    const updatedMarket = await monaco.fetchMarket(market.pk);

    assert.equal(response.success, false);
    assert.equal(response.data, undefined);
    assert(response.errors);
    assert.deepEqual(updatedMarket.marketStatus, { readyForSettlement: {} });
  });
});

describe("Transfer market escrow surplus", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);

  it("Successfully transfer surplus", async () => {
    const protocolProgram = workspace.MonacoProtocol;
    const market = await monaco.create3WayMarket([1.001]);
    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, 1);

    // airdrop market escrow an additional token
    await market.airdropTokenAccount(market.escrowPk, 1);

    const orderPk = await market.forOrder(0, 1, 1.001, purchaser);
    await market.settle(0);
    await market.settleMarketPositionForPurchaser(purchaser.publicKey);
    await market.settleOrder(orderPk);
    await market.completeSettlement();

    const response = await setMarketReadyToClose(protocolProgram, market.pk);
    assert(!response.success);

    const transferResponse = await transferMarketEscrowSurplus(
      protocolProgram,
      market.pk,
      market.mintPk,
    );
    assert(transferResponse.success);

    const tryAgain = await setMarketReadyToClose(protocolProgram, market.pk);
    assert(tryAgain.success);

    assert.equal(
      (await monaco.provider.connection.getTokenAccountBalance(market.escrowPk))
        .value.uiAmount,
      0,
    );
    assert.equal(await market.getTokenBalance(purchaser), 1);
    assert.equal(await market.getTokenBalance(provider.wallet.publicKey), 1);
  });

  it("Fails if market not settled", async () => {
    const protocolProgram = workspace.MonacoProtocol;
    const market = await monaco.create3WayMarket([1.001]);
    const purchaser = await createWalletWithBalance(monaco.provider);
    await market.airdrop(purchaser, 1);
    // This order is never matched or cancelled or settled
    await market.forOrder(0, 1, 1.001, purchaser);
    await market.settle(0);

    const transferResponse = await transferMarketEscrowSurplus(
      protocolProgram,
      market.pk,
      market.mintPk,
    );
    assert(!transferResponse.success);
  });
});
