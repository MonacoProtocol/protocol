import { monaco } from "../util/wrappers";
import { createWalletWithBalance } from "../util/test_util";
import * as assert from "assert";

describe("Void market position accounts", () => {
  it("void market position: multiple unmatched orders", async () => {
    const stake = 10;
    const price = 2.0;
    const startBalanceA = 100.0;
    const startBalanceB = 50.0;
    const startBalanceC = 20.0;
    const startBalanceD = 100.0;

    const [purchaserA, purchaserB, purchaserC, purchaserD, market] =
      await Promise.all([
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        monaco.create3WayMarket([price]),
      ]);

    await Promise.all([
      market.airdrop(purchaserA, startBalanceA),
      market.airdrop(purchaserB, startBalanceB),
      market.airdrop(purchaserC, startBalanceC),
      market.airdrop(purchaserD, startBalanceD),
    ]);

    // CREATE --------------------------------------------------------------------

    await market.forOrder(0, stake, price, purchaserA);
    await market.forOrder(0, stake, price, purchaserB);
    await market.forOrder(1, stake, price, purchaserC);
    await market.forOrder(1, stake, price, purchaserD);

    // VOID ----------------------------------------------------------------------

    await market.voidMarket();
    await market.voidMarketPositionForPurchaser(purchaserA.publicKey);
    await market.voidMarketPositionForPurchaser(purchaserB.publicKey);
    await market.voidMarketPositionForPurchaser(purchaserC.publicKey);
    await market.voidMarketPositionForPurchaser(purchaserD.publicKey);

    const [
      balanceAfterVoidA,
      balanceAfterVoidB,
      balanceAfterVoidC,
      balanceAfterVoidD,
    ] = await Promise.all([
      market.getTokenBalance(purchaserA.publicKey),
      market.getTokenBalance(purchaserB.publicKey),
      market.getTokenBalance(purchaserC.publicKey),
      market.getTokenBalance(purchaserD.publicKey),
    ]);

    assert.equal(balanceAfterVoidA, startBalanceA);
    assert.equal(balanceAfterVoidB, startBalanceB);
    assert.equal(balanceAfterVoidC, startBalanceC);
    assert.equal(balanceAfterVoidD, startBalanceD);
  });

  it("void market position: multiple partially matched orders", async () => {
    const stake = 10;
    const price = 2.0;
    const startBalanceA = 100.0;
    const startBalanceB = 50.0;
    const startBalanceC = 20.0;
    const startBalanceD = 100.0;

    const [purchaserA, purchaserB, purchaserC, purchaserD, market] =
      await Promise.all([
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        monaco.create3WayMarket([price]),
      ]);

    await Promise.all([
      market.airdrop(purchaserA, startBalanceA),
      market.airdrop(purchaserB, startBalanceB),
      market.airdrop(purchaserC, startBalanceC),
      market.airdrop(purchaserD, startBalanceD),
    ]);

    // CREATE --------------------------------------------------------------------

    const AforPk = await market.forOrder(0, stake, price, purchaserA);
    const BAgainstPk = await market.againstOrder(0, stake, price, purchaserB);
    const CforPk = await market.forOrder(1, stake, price, purchaserC);
    const DAgainstPk = await market.againstOrder(1, stake, price, purchaserD);

    await Promise.all([
      market.match(AforPk, BAgainstPk),
      market.match(CforPk, DAgainstPk),
    ]);

    // VOID ----------------------------------------------------------------------

    await market.voidMarket();

    await Promise.all([
      await market.voidMarketPositionForPurchaser(purchaserA.publicKey),
      await market.voidMarketPositionForPurchaser(purchaserB.publicKey),
      await market.voidMarketPositionForPurchaser(purchaserC.publicKey),
      await market.voidMarketPositionForPurchaser(purchaserD.publicKey),
    ]);

    const [
      balanceAfterVoidA,
      balanceAfterVoidB,
      balanceAfterVoidC,
      balanceAfterVoidD,
    ] = await Promise.all([
      market.getTokenBalance(purchaserA.publicKey),
      market.getTokenBalance(purchaserB.publicKey),
      market.getTokenBalance(purchaserC.publicKey),
      market.getTokenBalance(purchaserD.publicKey),
    ]);

    assert.equal(balanceAfterVoidA, startBalanceA);
    assert.equal(balanceAfterVoidB, startBalanceB);
    assert.equal(balanceAfterVoidC, startBalanceC);
    assert.equal(balanceAfterVoidD, startBalanceD);
  });

  it("void market position: multiple cancelled orders", async () => {
    const stake = 10;
    const price = 2.0;
    const startBalanceA = 100.0;
    const startBalanceB = 50.0;
    const startBalanceC = 20.0;
    const startBalanceD = 100.0;

    const [purchaserA, purchaserB, purchaserC, purchaserD, market] =
      await Promise.all([
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        createWalletWithBalance(monaco.provider),
        monaco.create3WayMarket([price]),
      ]);

    await Promise.all([
      market.airdrop(purchaserA, startBalanceA),
      market.airdrop(purchaserB, startBalanceB),
      market.airdrop(purchaserC, startBalanceC),
      market.airdrop(purchaserD, startBalanceD),
    ]);

    // CREATE --------------------------------------------------------------------

    const AforPk = await market.forOrder(0, stake, price, purchaserA);
    const BAgainstPk = await market.againstOrder(0, stake, price, purchaserB);
    const CforPk = await market.forOrder(1, stake, price, purchaserC);
    const DAgainstPk = await market.againstOrder(1, stake, price, purchaserD);

    await Promise.all([
      market.cancel(AforPk, purchaserA),
      market.cancel(BAgainstPk, purchaserB),
      market.cancel(CforPk, purchaserC),
      market.cancel(DAgainstPk, purchaserD),
    ]);

    // VOID ----------------------------------------------------------------------

    await market.voidMarket();

    await Promise.all([
      await market.voidMarketPositionForPurchaser(purchaserA.publicKey),
      await market.voidMarketPositionForPurchaser(purchaserB.publicKey),
      await market.voidMarketPositionForPurchaser(purchaserC.publicKey),
      await market.voidMarketPositionForPurchaser(purchaserD.publicKey),
    ]);

    const [
      balanceAfterVoidA,
      balanceAfterVoidB,
      balanceAfterVoidC,
      balanceAfterVoidD,
    ] = await Promise.all([
      market.getTokenBalance(purchaserA.publicKey),
      market.getTokenBalance(purchaserB.publicKey),
      market.getTokenBalance(purchaserC.publicKey),
      market.getTokenBalance(purchaserD.publicKey),
    ]);

    assert.equal(balanceAfterVoidA, startBalanceA);
    assert.equal(balanceAfterVoidB, startBalanceB);
    assert.equal(balanceAfterVoidC, startBalanceC);
    assert.equal(balanceAfterVoidD, startBalanceD);
  });
});
