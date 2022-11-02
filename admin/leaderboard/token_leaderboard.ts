import {
  fetchTokenData,
  fetchTokenHolderData,
  numberAsPnlString,
} from "./util";
import { KNOWN_WALLETS, TOKEN_AMOUNT_SUPPLIED } from "./data";

//// get total leaderboard
type TokenLeaderboardRowItem = {
  owner: string;
  amount: string;
  tokenOwnership: string;
  pnl: string;
  pnlPercentage: string;
};

export async function getTokenLeaderboard() {
  const holderData = await fetchTokenHolderData();
  const tokenData = await fetchTokenData();

  const walletTokenDetailsList = [] as TokenLeaderboardRowItem[];
  holderData.forEach((holder) => {
    const tokenDetails = buildTokenLeaderboardRowItem(tokenData, holder);
    walletTokenDetailsList.push(tokenDetails);
  });

  console.table(walletTokenDetailsList);
}

function buildTokenLeaderboardRowItem(tokenData, holder) {
  const uiTokenSupply =
    parseInt(tokenData.supply) / Math.pow(10, tokenData.decimals);

  const owner = holder.owner;
  const isKnownWallet = KNOWN_WALLETS.has(owner);
  const currentAmount = parseFloat(holder.uiAmountString);
  const percentage = (currentAmount / uiTokenSupply) * 100;
  const pnl =
    currentAmount >= TOKEN_AMOUNT_SUPPLIED
      ? currentAmount - TOKEN_AMOUNT_SUPPLIED
      : (TOKEN_AMOUNT_SUPPLIED - currentAmount) * -1;
  const pnlPercentage = (pnl / TOKEN_AMOUNT_SUPPLIED) * 100;

  return {
    owner: isKnownWallet
      ? KNOWN_WALLETS.get(owner)
      : owner.replace(owner.substring(4, 40), "..."),
    amount: currentAmount.toFixed(2),
    tokenOwnership: `${percentage.toFixed(2)}%`,
    pnl: numberAsPnlString(pnl),
    pnlPercentage: `${pnlPercentage.toFixed(2)}%`,
  } as TokenLeaderboardRowItem;
}
