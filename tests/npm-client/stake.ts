import { monaco } from "../util/wrappers";
import { uiStakeToInteger } from "../../npm-client";
import { Program } from "@coral-xyz/anchor";
import assert from "assert";

describe("Stake calculations", () => {
  it("JS floating point inaccuracies in stake conversion are not observed", async () => {
    const market = await monaco.create3WayMarket([1.001]);

    const uiStake = 2.01;
    const expectedResult = 2010000;

    const result = await uiStakeToInteger(
      monaco.program as Program,
      uiStake,
      market.pk,
    );
    assert.equal(result.data.stakeInteger.toNumber(), expectedResult);
  });
});
