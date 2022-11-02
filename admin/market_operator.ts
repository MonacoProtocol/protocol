import {
  authoriseAdminOperator as clientAuthoriseAdminOperator,
  authoriseCrankOperator,
  authoriseMarketOperator,
  findAuthorisedOperatorsAccountPda,
  Operator,
} from "../npm-admin-client/src";
import { getProtocolProgram } from "./util";
import { PublicKey } from "@solana/web3.js";

export async function authoriseOperator() {
  if (process.argv.length != 5) {
    console.log(
      "Usage: yarn run authorise_operator <MARKET|CRANK> <OPERATOR_ID>",
    );
    process.exit(1);
  }

  const operatorType = process.argv[3].toUpperCase();
  if (operatorType != "CRANK" && operatorType != "MARKET") {
    console.log("Operator type must be one of CRANK or MARKET.");
    process.exit(1);
  }
  const operator = process.argv[4];
  const protocolProgram = await getProtocolProgram();
  const operatorPk = new PublicKey(operator);

  if (operatorType == "CRANK") {
    authoriseCrankOperator(protocolProgram, operatorPk);
  } else {
    authoriseMarketOperator(protocolProgram, operatorPk);
  }
}

export async function authoriseAdminOperator() {
  if (process.argv.length != 4) {
    console.log("Usage: yarn run authorise_admin_operator <OPERATOR_ID>");
    process.exit(1);
  }

  const operator = process.argv[3];
  const operatorPk = new PublicKey(operator);
  const protocolProgram = await getProtocolProgram();
  await clientAuthoriseAdminOperator(protocolProgram, operatorPk);
}

export async function printAuthorisedOperatorAccounts() {
  const program = await getProtocolProgram();
  const [admin, market, crank] = (
    await Promise.all([
      findAuthorisedOperatorsAccountPda(program, Operator.ADMIN),
      findAuthorisedOperatorsAccountPda(program, Operator.MARKET),
      findAuthorisedOperatorsAccountPda(program, Operator.CRANK),
    ])
  ).map((response) => response.data.pda);
  console.log(`Admin authorised operators account: ${admin}`);
  console.log(`Market authorised operators account: ${market}`);
  console.log(`Crank authorised operators account: ${crank}`);
}
