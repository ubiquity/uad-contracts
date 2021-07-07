import { expect } from "chai";
import { ethers, Signer, BigNumber } from "ethers";
import { BondingV2 } from "../artifacts/types/BondingV2";
import { BondingShareV2 } from "../artifacts/types/BondingShareV2";
import { UbiquityAlgorithmicDollar } from "../artifacts/types/UbiquityAlgorithmicDollar";
import { bondingSetup } from "./BondingSetupV2";
import { mineNBlock } from "./utils/hardhatNode";

describe("Bonding1", () => {
  let idBlock: number;
  const one: BigNumber = BigNumber.from(10).pow(18); // one = 1 ether = 10^18

  let uAD: UbiquityAlgorithmicDollar;
  let bondingV2: BondingV2;
  let bondingShareV2: BondingShareV2;
  let sablier: string;
  let secondAccount: Signer;
  let blockCountInAWeek: BigNumber;
  beforeEach(async () => {
    ({
      secondAccount,
      uAD,
      bondingV2,
      bondingShareV2,
      sablier,
      blockCountInAWeek,
    } = await bondingSetup());
  });
  describe("Price reset", () => {
    it("onlyBondingManager can call uADPriceReset  ", async () => {
      await expect(
        bondingV2.connect(secondAccount).uADPriceReset(1)
      ).to.be.revertedWith("not manager");
    });
    it("onlyBondingManager can call crvPriceReset  ", async () => {
      await expect(
        bondingV2.connect(secondAccount).crvPriceReset(1)
      ).to.be.revertedWith("not manager");
    });
    it("crvPriceReset should work", async () => {});
    it("crvPriceReset should work twice", async () => {});
    it("uADPriceReset should work", async () => {});
    it("uADPriceReset should work twice", async () => {});
  });
});
