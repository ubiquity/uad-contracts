import { Signer } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SushiSwapPool } from "../artifacts/types/SushiSwapPool";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";

const tokenA = "0x956f47f50a910163d8bf957cf5846d573e7f87ca";
const tokenB = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

describe("SushiSwapPool", () => {
  let admin: Signer;
  let manager: UbiquityAlgorithmicDollarManager;
  let sushi: SushiSwapPool;

  beforeEach(async () => {
    [admin] = await ethers.getSigners();
    const UADMgr = await ethers.getContractFactory(
      "UbiquityAlgorithmicDollarManager"
    );
    manager = (await UADMgr.deploy(
      await admin.getAddress()
    )) as UbiquityAlgorithmicDollarManager;

    const Sushi = await ethers.getContractFactory("SushiSwapPool");
    sushi = (await Sushi.deploy(manager.address)) as SushiSwapPool;
  });
  describe("It", () => {
    it("should work", async () => {
      const [reserveA, reserveB, totalSupply] = await sushi.pairInfo(
        tokenA,
        tokenB
      );
      console.log(reserveA.toString());
      console.log(reserveB.toString());
      console.log(totalSupply.toString());
      expect(true);
    });
  });
});
