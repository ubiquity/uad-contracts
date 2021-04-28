import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { Big, RoundingMode } from "big.js";

// to have decent precision
Big.DP = 35;
// to avoid exponential notation
Big.PE = 105;
Big.NE = -35;

// returns (twapPrice - 1) * uADTotalSupply
export function calcDollarsToMint(
  uADTotalSupply: string,
  twapPrice: string
): BigNumber {
  const uADSupply = new Big(uADTotalSupply);
  const price = new Big(twapPrice);
  const one = new Big(ethers.utils.parseEther("1").toString());
  return BigNumber.from(
    price
      .sub(one)
      .mul(uADSupply.div(one))
      .round(0, RoundingMode.RoundDown)
      .toString()
  );
}

// returns amount +  (1- TWAP_Price)%.
export function calculateIncentiveAmount(
  amountInWEI: string,
  curPriceInWEI: string
): BigNumber {
  // should be in ETH
  const one = new Big(ethers.utils.parseEther("1").toString());
  const amount = new Big(amountInWEI);
  // returns amount +  (1- TWAP_Price)%.
  return BigNumber.from(
    one
      .sub(curPriceInWEI)
      .mul(amount.div(one))
      .round(0, RoundingMode.RoundDown)
      .toString()
  );
}

// returns amount * percentage (in wei)
export function calcPercentage(amount: string, percentage: string): BigNumber {
  // calculate amount * percentage
  const value = new Big(amount);
  const one = new Big(ethers.utils.parseEther("1").toString());
  const percent = new Big(percentage).div(one);
  return BigNumber.from(
    value.mul(percent).round(0, RoundingMode.RoundDown).toString()
  );
}

// returns amount * 1 / (1-debt/totalsupply)²
export function calcPremium(
  amount: string,
  uADTotalSupply: string,
  totalDebt: string
): BigNumber {
  const one = new Big(1);
  const uADTotSupply = new Big(uADTotalSupply);
  const TotDebt = new Big(totalDebt);
  const amountToPremium = new Big(amount);
  // premium =  amount * 1 / (1-debt/totalsupply)²
  const prem = amountToPremium.mul(
    one.div(one.sub(TotDebt.div(uADTotSupply)).pow(2))
  );
  return BigNumber.from(prem.round(0, RoundingMode.RoundDown).toString());
}
