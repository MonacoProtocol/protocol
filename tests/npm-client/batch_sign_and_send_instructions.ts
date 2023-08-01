import { monaco } from "../util/wrappers";
import assert from "assert";
import {
  signAndSendInstructionsBatch,
  buildOrderInstructionUIStake,
  buildCancelOrderInstruction,
  confirmTransaction,
} from "../../npm-client";
import { DEFAULT_PRICE_LADDER } from "../../npm-admin-client/types";

describe("NPM Client - batch sign and send instructions", () => {
  it("Batch create and cancel 50 orders", async () => {
    const program = monaco.getRawProgram();
    const market = await monaco.create3WayMarket(
      DEFAULT_PRICE_LADDER.slice(0, 50),
    );
    await market.airdropProvider(10000);

    const orders = 50;
    const builtInstructions = [];
    for (let i = 0; i < orders; i++) {
      const instruction = await buildOrderInstructionUIStake(
        program,
        market.pk,
        0,
        true,
        DEFAULT_PRICE_LADDER[i],
        10,
      );
      builtInstructions.push(instruction);
    }

    const instructions = builtInstructions.map((instruction) => {
      return instruction.data.instruction;
    });

    const batch = await signAndSendInstructionsBatch(program, instructions, 6);
    assert.equal(batch.success, true);
    assert.equal(batch.data.signatures.length, 9);

    for (const signature of batch.data.signatures) {
      await confirmTransaction(program, signature);
    }

    const builtCancelInstructions = [];
    for (const instruction of builtInstructions) {
      const cancelInstruction = await buildCancelOrderInstruction(
        program,
        instruction.data.orderPk,
      );
      builtCancelInstructions.push(cancelInstruction);
    }

    const cancelInstructions = builtCancelInstructions.map((instruction) => {
      return instruction.data.instruction;
    });

    const cancelBatch = await signAndSendInstructionsBatch(
      program,
      cancelInstructions,
      10,
    );
    assert.equal(cancelBatch.success, true);
    assert.equal(cancelBatch.data.signatures.length, 5);
  });

  it("Handles a failed batch", async () => {
    const program = monaco.getRawProgram();
    const market = await monaco.create3WayMarket([2.0]);
    await market.airdropProvider(10000);

    const [orderInstruction1, orderInstruction2] = await Promise.all([
      buildOrderInstructionUIStake(program, market.pk, 0, true, 2.0, 10),
      // contains invalid outcome index
      buildOrderInstructionUIStake(program, market.pk, 10, true, 2.0, 10),
    ]);

    const batch = await signAndSendInstructionsBatch(
      program,
      [orderInstruction1.data.instruction, orderInstruction2.data.instruction],
      1,
    );

    assert.equal(batch.success, false);
    assert.equal(batch.data.signatures.length, 1);
    assert.equal(batch.data.failedInstructions.length, 1);
  });
});
