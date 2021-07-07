import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, BigNumber } from "ethers";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { bondingSetup, deposit } from "./BondingSetupV2";
import { mineNBlock } from "./utils/hardhatNode";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { ERC20 } from "../artifacts/types/ERC20";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";
import { MasterChefV2 } from "../artifacts/types/MasterChefV2";

describe("deposit", () => {
  let idBlock: number;
  const one: BigNumber = BigNumber.from(10).pow(18); // one = 1 ether = 10^18
  let admin: Signer;
  let secondAccount: Signer;
  let treasury: Signer;
  let secondAddress: string;
  let uAD: UbiquityAlgorithmicDollar;
  let metaPool: IMetaPool;
  let crvToken: ERC20;
  let twapOracle: TWAPOracle;
  let bondingV2: BondingV2;
  let bondingShareV2: BondingShareV2;
  let masterChefV2: MasterChefV2;
  let sablier: string;

  let blockCountInAWeek: BigNumber;
  beforeEach(async () => {
    ({
      secondAccount,
      uAD,
      metaPool,
      bondingV2,
      masterChefV2,
      crvToken,
      bondingShareV2,
      sablier,
      blockCountInAWeek,
    } = await bondingSetup());
  });

  it("deposit should work", async () => {
    const { id, bsAmount, shares, creationBlock, endBlock } = await deposit(
      secondAccount,
      one.mul(100),
      1
    );
    expect(id).to.equal(0);
    expect(bsAmount).to.equal(1);
    const detail = await bondingShareV2.getBond(id);

    expect(detail.lpAmount).to.equal(one.mul(100));
    expect(detail.lpDeposited).to.equal(one.mul(100));
    expect(detail.minter).to.equal(await secondAccount.getAddress());
    expect(detail.lpRewardDebt).to.equal(0);
    expect(detail.creationBlock).to.equal(creationBlock);
    expect(detail.endBlock).to.equal(endBlock);
    const shareDetail = await masterChefV2.getBondingShareInfo(id);
    expect(shareDetail[0]).to.equal(shares);
    await mineNBlock(blockCountInAWeek.toNumber());
  });
});
