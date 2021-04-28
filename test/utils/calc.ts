import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { Big, RoundingMode } from "big.js";

// to have decent precision
Big.DP = 35;
// to avoid exponential notation
Big.PE = 35;
Big.NE = -15;

export function calcPercentage(amount: string, percentage: string): BigNumber {
  // calculate amount * percentage
  const value = new Big(amount);
  const one = new Big(ethers.utils.parseEther("1").toString());
  const percent = new Big(percentage).div(one);
  return BigNumber.from(
    value.mul(percent).round(0, RoundingMode.RoundDown).toString()
  );
}

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
