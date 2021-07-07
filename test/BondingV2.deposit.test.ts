import { expect } from "chai";
import { ethers, Signer, BigNumber } from "ethers";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { bondingSetup, deposit } from "./BondingSetupV2";
import { mineNBlock } from "./utils/hardhatNode";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { ERC20 } from "../artifacts/types/ERC20";
import { TWAPOracle } from "../artifacts/types/TWAPOracle";

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
  let sablier: string;

  let blockCountInAWeek: BigNumber;
  beforeEach(async () => {
    ({
      secondAccount,
      uAD,
      metaPool,
      bondingV2,
      crvToken,
      bondingShareV2,
      sablier,
      blockCountInAWeek,
    } = await bondingSetup());
  });

  it("deposit should work twice", async () => {
    const { id, bond } = await deposit(secondAccount, one.mul(100), 1);
    console.log(`
    id:${id}
    bond:${bond}
    `);
    expect(id).to.equal(0);
    expect(bond).to.equal(1);
    await mineNBlock(blockCountInAWeek.toNumber());
  });
});
