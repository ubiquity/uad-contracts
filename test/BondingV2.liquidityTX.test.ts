import { expect } from "chai";

import { ethers, network } from "hardhat";
import { Signer, BigNumber } from "ethers";
import type {
  TransactionResponse,
  TransactionReceipt,
} from "@ethersproject/abstract-provider";
import { impersonate, resetFork } from "./utils/hardhatNode";
import { BondingV2 } from "../artifacts/types/BondingV2";
import bondingV2Json from "../artifacts/contracts/BondingV2.sol/BondingV2.json";
import bondingV2withTracesJson from "../artifacts/contracts/BondingV2WithTraces.sol/BondingV2.json";

describe.only("BondingV2 removeLiquidity", () => {
  const signerAddress = "0xC1b6052E707dfF9017DEAb13ae9B89008FC1Fc5d";
  const bondId = 24;
  const amount = BigNumber.from("3696476262155265118082");
  const forkBlock = 13346800;

  const bondingV2address = "0xC251eCD9f1bD5230823F9A0F99a44A87Ddd4CA38";

  let signer: Signer;

  beforeEach(async () => {
    await resetFork(forkBlock);
    signer = await impersonate(signerAddress);
  });

  const runAndCheckTxRemoveLiquidity = async (bondingV2: BondingV2) => {
    const txResp: TransactionResponse = await bondingV2.removeLiquidity(
      amount,
      bondId
    );
    const txReceipt: TransactionReceipt = await txResp.wait();
    const iface = new ethers.utils.Interface(bondingV2Json.abi);

    const log = txReceipt.logs.find(
      (_log) =>
        _log.address === bondingV2address &&
        iface.parseLog(_log).name === "RemoveLiquidityFromBond"
    );
    expect(Boolean(log)).to.be.true;

    if (log) {
      const {
        _user: user,
        _id: id,
        _lpAmount: lpAmount,
        _lpAmountTransferred: lpAmountTransferred,
        _lprewards: lprewards,
        _bondingShareAmount: bondingShareAmount,
      } = iface.parseLog(log).args;
      console.log(
        "lpAmountTransferred",
        ethers.utils.formatEther(lpAmountTransferred)
      );

      expect(user).to.be.equal(signerAddress);
      expect(id).to.be.equal(bondId);
      expect(lpAmount).to.be.equal(amount);
      expect(lprewards).to.be.equal(0);
      expect(lpAmountTransferred).to.be.equal(
        BigNumber.from("1558289321610522180918")
      );
      expect(bondingShareAmount).to.be.equal(
        BigNumber.from("3750803146286810061883")
      );
    }
  };

  it("Should run tx and get same result as mainnet", async () => {
    const bondingV2 = new ethers.Contract(
      bondingV2address,
      bondingV2Json.abi,
      signer
    ) as BondingV2;

    await runAndCheckTxRemoveLiquidity(bondingV2);
  });

  it("Should run tx and get same result as mainnet with traces", async () => {
    await network.provider.send("hardhat_setCode", [
      bondingV2address,
      bondingV2withTracesJson.deployedBytecode,
    ]);

    const bondingV2 = new ethers.Contract(
      bondingV2address,
      bondingV2Json.abi,
      signer
    ) as BondingV2;

    await runAndCheckTxRemoveLiquidity(bondingV2);
  });
});
