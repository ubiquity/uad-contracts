import { Signer } from "ethers";
import { ethers, getNamedAccounts, network } from "hardhat";
import { expect } from "chai";
import { YieldProxy } from "../artifacts/types/YieldProxy";
import { ERC20 } from "../artifacts/types/ERC20";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { UbiquityAutoRedeem } from "../artifacts/types/UbiquityAutoRedeem";
import { UbiquityFormulas } from "../artifacts/types/UbiquityFormulas";
import { UbiquityGovernance } from "../artifacts/types/UbiquityGovernance";
import yieldProxySetup from "./YieldProxySetup";

describe("yield Proxy", () => {
  let fifthAccount: Signer;
  let uAR: UbiquityAutoRedeem;
  let yieldProxy: YieldProxy;
  let manager: UbiquityAlgorithmicDollarManager;
  let usdcWhaleAddress: string;
  let uAD: UbiquityAlgorithmicDollar;
  let uGOV: UbiquityGovernance;
  let DAI: string;
  let USDC: string;
  let usdcToken: ERC20;
  let admin: Signer;
  let usdcWhale: Signer;
  let secondAccount: Signer;
  let thirdAccount: Signer;
  let fourthAccount: Signer;
  let treasury: Signer;
  let jarUSDCAddr: string;
  let adminAddress: string;
  let secondAddress: string;
  let ubiquityFormulas: UbiquityFormulas;
  beforeEach(async () => {
    ({
      usdcToken,
      usdcWhale,
      admin,
      secondAccount,
      thirdAccount,
      fourthAccount,
      fifthAccount,
      treasury,
      usdcWhaleAddress,
      jarUSDCAddr,
      uAD,
      uGOV,
      uAR,
      yieldProxy,
      DAI,
      USDC,
      manager,
    } = await yieldProxySetup());
    secondAddress = await secondAccount.getAddress();
    // mint uad for whale
  });

  describe("yield proxy", () => {
    it("deposit should work ", async () => {
      const usdcBal = await usdcToken.balanceOf(secondAddress);
      const uadBal = await uAD.balanceOf(secondAddress);
      const ubqBal = await uGOV.balanceOf(secondAddress);

      console.log(`

      balWhaleUsdc:${ethers.utils.formatUnits(usdcBal, 6)}
      uadBal:${ethers.utils.formatEther(uadBal)}
      ubqBal:${ethers.utils.formatEther(ubqBal)}
      `);
    });
  });
});
