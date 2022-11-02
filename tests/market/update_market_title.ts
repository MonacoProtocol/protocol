import assert from "assert";
import { monaco } from "../util/wrappers";

describe("Market: update", () => {
  it("Success", async () => {
    // create a new market
    const market = await monaco.create3WayMarket([4.2]);
    const newTitle = "SomeTitle1";

    await monaco.program.methods
      .updateMarketTitle(newTitle)
      .accounts({
        market: market.pk,
        authorisedOperators: await monaco.findMarketAuthorisedOperatorsPda(),
        marketOperator: monaco.operatorPk,
      })
      .rpc()
      .catch((e) => {
        console.error(e);
        throw e;
      });

    const marketAccount = await monaco.fetchMarket(market.pk).then((o) => {
      return {
        title: o.title,
        lockTimestamp: o.marketLockTimestamp.toNumber(),
      };
    });
    assert.deepEqual(marketAccount, {
      lockTimestamp: 1924254038,
      title: newTitle,
    });
  });
});
