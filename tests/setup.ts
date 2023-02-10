import { PublicKey } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import { MonacoProtocol } from "../target/types/monaco_protocol";
import {
  authoriseAdminOperator,
  authoriseOperator,
  createProductConfig,
  OperatorType,
} from "./util/test_util";

module.exports = async function (_globalConfig, _projectConfig) {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);
  const protocolProgram: anchor.Program<MonacoProtocol> =
    anchor.workspace.MonacoProtocol;
  const operatorPk: PublicKey = provider.wallet.publicKey;
  await authoriseAdminOperator(operatorPk, protocolProgram, provider);
  await authoriseOperator(
    operatorPk,
    protocolProgram,
    provider,
    OperatorType.MARKET,
  );
  await authoriseOperator(
    operatorPk,
    protocolProgram,
    provider,
    OperatorType.CRANK,
  );
  await createProductConfig("MONACO_PROTOCOL", 10.0, provider);
  await createProductConfig("BETDEX_EXCHANGE", 5.0, provider);
};
