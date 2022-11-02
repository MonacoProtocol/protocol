import assert from "assert";
import {
  getMarketAccountsByEvent,
  getMarketAccountsByStatus,
  getMarketAccountsByStatusAndMintAccount,
  MarketStatus,
} from "../../npm-client/src/";
import { monaco } from "../util/wrappers";

describe("Market Query", () => {
  it("Gets open market", async () => {
    const market = await monaco.create3WayMarket([3.0]);

    const responseOpen = await getMarketAccountsByStatus(
      monaco.getRawProgram(),
      MarketStatus.Open,
    );

    assert(responseOpen.success);
    assert(responseOpen.data);
    assert(
      responseOpen.data.markets.find(
        (foundMarket) =>
          foundMarket.publicKey.toString() == market.pk.toString(),
      ),
    );

    const responseComplete = await getMarketAccountsByStatus(
      monaco.getRawProgram(),
      MarketStatus.Complete,
    );

    assert(responseComplete.success);
    assert(responseComplete.data);
    assert.equal(responseComplete.data.markets.length, 0);
    assert.deepEqual(responseComplete.errors, []);
  });

  it("Get Market by Event", async () => {
    const market1 = await monaco.create3WayMarket([3.0]);
    const market2 = await monaco.create3WayMarket([3.0]);

    {
      const response = await getMarketAccountsByEvent(
        monaco.getRawProgram(),
        market1.eventPk,
      );

      assert(response.success);
      assert(response.data);
      assert.equal(response.data.markets.length, 1);
      assert.equal(
        response.data.markets[0].publicKey.toBase58(),
        market1.pk.toBase58(),
      );
    }

    {
      const response = await getMarketAccountsByEvent(
        monaco.getRawProgram(),
        market2.eventPk,
      );

      assert(response.success);
      assert(response.data);
      assert.equal(response.data.markets.length, 1);
      assert.equal(
        response.data.markets[0].publicKey.toBase58(),
        market2.pk.toBase58(),
      );
    }
  });

  it("Get Market by Status + Mint", async () => {
    const market1 = await monaco.create3WayMarket([3.0]);
    const market2 = await monaco.create3WayMarket([3.0]);

    {
      const response = await getMarketAccountsByStatusAndMintAccount(
        monaco.getRawProgram(),
        MarketStatus.Open,
        market1.mintPk,
      );

      assert(response.success);
      assert(response.data);
      assert.equal(response.data.markets.length, 1);
      assert.equal(
        response.data.markets[0].publicKey.toBase58(),
        market1.pk.toBase58(),
      );
    }

    {
      const response = await getMarketAccountsByStatusAndMintAccount(
        monaco.getRawProgram(),
        MarketStatus.Open,
        market2.mintPk,
      );

      assert(response.success);
      assert(response.data);
      assert.equal(response.data.markets.length, 1);
      assert.equal(
        response.data.markets[0].publicKey.toBase58(),
        market2.pk.toBase58(),
      );
    }
  });
});
