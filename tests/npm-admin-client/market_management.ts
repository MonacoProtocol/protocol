import {
  Program,
  AnchorProvider,
  setProvider,
  workspace,
  BN,
} from "@project-serum/anchor";
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
} from "../../npm-admin-client/src";
import { monaco } from "../util/wrappers";
import { checkEnumValue } from "../../admin/leaderboard/util";

describe("Settle market", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);

  it("Settles market", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const market = await monaco.create3WayMarket([1.001]);
    const settleMarketResponse = await settleMarket(
      protocolProgram,
      market.pk,
      0,
    );
    const updatedMarket = await monaco.fetchMarket(market.pk);

    assert(settleMarketResponse.success);
    assert(settleMarketResponse.data.tnxId);
    assert.deepEqual(settleMarketResponse.errors, []);
    assert.equal(updatedMarket.marketWinningOutcomeIndex, 0);
  });

  it("Fails settle with invalid index", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const market = await monaco.create3WayMarket([1.001]);
    const settleMarketResponse = await settleMarket(
      protocolProgram,
      market.pk,
      5,
    );
    const updatedMarket = await monaco.fetchMarket(market.pk);

    assert.equal(settleMarketResponse.success, false);
    assert.equal(settleMarketResponse.data, undefined);
    assert(settleMarketResponse.errors);
    assert.equal(updatedMarket.marketWinningOutcomeIndex, undefined);
  });
});

describe("Set publish status", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);

  it("Sets as unpublished then published", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const market = await monaco.create3WayMarket([1.001]);
    const unpublish = await unpublishMarket(protocolProgram, market.pk);
    let updatedMarket = await monaco.fetchMarket(market.pk);

    assert(unpublish.success);
    assert(unpublish.data.tnxId);
    assert.deepEqual(unpublish.errors, []);
    assert(!updatedMarket.published);

    const publish = await publishMarket(protocolProgram, market.pk);
    updatedMarket = await monaco.fetchMarket(market.pk);

    assert(publish.success);
    assert(publish.data.tnxId);
    assert.deepEqual(publish.errors, []);
    assert(updatedMarket.published);
  });
});

describe("Set suspended status", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);

  it("Sets as suspended then unsuspended", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const market = await monaco.create3WayMarket([1.001]);
    const suspend = await suspendMarket(protocolProgram, market.pk);
    let updatedMarket = await monaco.fetchMarket(market.pk);

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
  });
});

describe("Set new title", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);
  const newTitle = "Brand New Title";

  it("Sets provided title", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const market = await monaco.create3WayMarket([1.001]);
    const suspend = await updateMarketTitle(
      protocolProgram,
      market.pk,
      newTitle,
    );
    const updatedMarket = await monaco.fetchMarket(market.pk);

    assert(suspend.success);
    assert(suspend.data.tnxId);
    assert.deepEqual(suspend.errors, []);
    assert.equal(updatedMarket.title, "Brand New Title");
  });
});

describe("Set new locktime", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);
  const newLocktime = 64060588800;

  it("Sets provided locktime", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const market = await monaco.create3WayMarket([1.001]);
    const suspend = await updateMarketLocktime(
      protocolProgram,
      market.pk,
      newLocktime,
    );
    const updatedMarket = await monaco.fetchMarket(market.pk);

    assert(suspend.success);
    assert(suspend.data.tnxId);
    assert.deepEqual(suspend.errors, []);
    assert.deepEqual(updatedMarket.marketLockTimestamp, new BN(newLocktime));
  });
});

describe("Market ready to close", () => {
  const provider = AnchorProvider.local();
  setProvider(provider);

  it("Set market as ready to close", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const market = await monaco.create3WayMarket([1.001]);
    await market.settle(0);
    await market.completeSettlement();

    const response = await setMarketReadyToClose(protocolProgram, market.pk);
    const updatedMarket = await monaco.fetchMarket(market.pk);

    assert(response.success);
    assert(response.data.tnxId);
    assert.deepEqual(response.errors, []);
    checkEnumValue(updatedMarket.marketStatus, "readyToClose");
  });

  it("Fails if market not settled", async () => {
    const protocolProgram = workspace.MonacoProtocol as Program;
    const market = await monaco.create3WayMarket([1.001]);
    const response = await setMarketReadyToClose(protocolProgram, market.pk);
    const updatedMarket = await monaco.fetchMarket(market.pk);

    assert.equal(response.success, false);
    assert.equal(response.data, undefined);
    assert(response.errors);
    checkEnumValue(updatedMarket.marketStatus, "open");
  });
});
