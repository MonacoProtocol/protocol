import * as anchor from "@coral-xyz/anchor";
import assert from "assert";
import { monaco } from "../util/wrappers";

describe("Market: update start time", () => {
  it("success: custom time", async () => {
    // create a new market
    const market = await monaco.create3WayMarket([4.2]);
    const newEventStartTime = 43041841910;

    await monaco.program.methods
      .updateMarketEventStartTime(new anchor.BN(newEventStartTime))
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
        eventStartTime: o.eventStartTimestamp.toNumber(),
      };
    });
    assert.deepEqual(marketAccount, {
      eventStartTime: newEventStartTime,
    });
  });

  it("success: now time", async () => {
    // create a new market
    const market = await monaco.create3WayMarket([4.2]);
    const marketEventStartTimestampBefore = await monaco
      .fetchMarket(market.pk)
      .then((o) => {
        return o.eventStartTimestamp.toNumber();
      });

    await monaco.program.methods
      .updateMarketEventStartTimeToNow()
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

    const marketEventStartTimestampAfter = await monaco
      .fetchMarket(market.pk)
      .then((o) => {
        return o.eventStartTimestamp.toNumber();
      });
    expect(marketEventStartTimestampBefore).toBeGreaterThan(
      marketEventStartTimestampAfter,
    );
  });
});
