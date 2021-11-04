import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, BigNumber } from "ethers";
import type {
  TransactionResponse,
  TransactionReceipt,
} from "@ethersproject/abstract-provider";
import { impersonate } from "./utils/hardhatNode";
import { BondingV2 } from "../artifacts/types/BondingV2";

describe("BondingV2 removeLiquidity", () => {
  const signerAddress = "0xC1b6052E707dfF9017DEAb13ae9B89008FC1Fc5d";
  const bondId = 24;
  const amount = BigNumber.from("3696476262155265118082");

  let bondingV2: BondingV2;
  const bondingV2address = "0xC251eCD9f1bD5230823F9A0F99a44A87Ddd4CA38";
  const bondingV2abi = [
    "event RemoveLiquidityFromBond(address indexed _user, uint256 indexed _id, uint256 _lpAmount, uint256 _lpAmountTransferred, uint256 _lprewards, uint256 _bondingShareAmount)",
    "function removeLiquidity(uint256 _amount, uint256 _id)",
  ];

  before(async () => {
    const signer: Signer = await impersonate(signerAddress);

    bondingV2 = new ethers.Contract(
      bondingV2address,
      bondingV2abi,
      signer
    ) as BondingV2;
  });

  it.only("Should run tx and get same result as mainnet", async () => {
    const txResp: TransactionResponse = await bondingV2.removeLiquidity(
      amount,
      bondId
    );
    const txReceipt: TransactionReceipt = await txResp.wait();
    const iface = new ethers.utils.Interface(bondingV2abi);

    const {
      _user: user,
      _id: id,
      _lpAmount: lpAmount,
      _lpAmountTransferred: lpAmountTransferred,
      _lprewards: lprewards,
      _bondingShareAmount: bondingShareAmount,
    } = iface.parseLog(txReceipt.logs[7]).args;

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
  });
});
