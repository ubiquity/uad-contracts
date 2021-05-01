/* eslint-disable @typescript-eslint/no-use-before-define */

import { ethers } from "hardhat";
import { describe, it } from "mocha";
import { BigNumber, Signer } from "ethers";
import { expect } from "./setup";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { bondingSetup, log } from "./BondingSetup";
import { MasterChef } from "../artifacts/types/MasterChef";
import { UbiquityFormulas } from "../artifacts/types/UbiquityFormulas";
import { IMetaPool } from "../artifacts/types/IMetaPool";
import { mineNBlock } from "./utils/hardhatNode";
// import "./interfaces/ITWAPOracle.sol";

describe("MasterChef", () => {
  describe("Init", () => {
    it("Should deploy MasterChef", async () => {
      // DEPLOY MasterChef
      masterChef = (await (
        await ethers.getContractFactory("MasterChef", {
          libraries: {
            UbiquityFormulas: ubiquityFormulas.address,
          },
        })
      ).deploy(manager.address)) as MasterChef;
      await manager.setMasterChefAddress(masterChef.address);
      await manager.grantRole(UBQ_MINTER_ROLE, masterChef.address);

      expect(masterChef.address.length).to.be.equal(42);
    });
    it("Should register MasterChef on Manager", async () => {
      const managerMasterChefAddress = await manager.masterChefAddress();
      expect(masterChef.address).to.be.equal(managerMasterChefAddress);
    });
  });
  describe("TwapPrice", () => {
    it("TwapPrice should be 1", async () => {
      expect(await masterChef.getTwapPrice()).to.be.equal(one);
    });
  });

  describe("updateUGOVMultiplier", () => {
    it("Should update UGOVMultiplier, and get multiplied by 1.05 at price 1", async () => {
      const m0 = await masterChef.uGOVmultiplier();
      await masterChef.updateUGOVMultiplier();
      const m1 = await masterChef.uGOVmultiplier();
      expect(m0.mul(105)).to.be.equal(m1.mul(100)); // m0 = m1 * 1.05
      await masterChef.updateUGOVMultiplier();
      const m2 = await masterChef.uGOVmultiplier();
      expect(m1.mul(105)).to.be.equal(m2.mul(100)); // m2 = m1 * 1.05
    });
  });

  describe("deposit", () => {
    it("Should be able to deposit", async () => {
      const amount = one.mul(100);
      await metaPool.connect(secondAccount).approve(masterChef.address, amount);
      await masterChef.connect(secondAccount).deposit(amount);
    });

    it("Should retrieve 0.000231525 pendingUGOV after 100 blocks", async () => {
      await mineNBlock(100);
      const pendingUGOV = await masterChef.pendingUGOV(secondAddress);

      expect(pendingUGOV.sub(ten9.mul(231525))).to.be.lt(ten9);
    });
  });

  describe("withdraw", () => {
    it("Should be able to withdraw", async () => {
      await masterChef.connect(secondAccount).withdraw(one.mul(100));
    });

    it("Should retrieve pendingUGOV", async () => {
      expect(await masterChef.pendingUGOV(secondAddress)).to.be.equal(0);
    });
  });

  const one: BigNumber = BigNumber.from(10).pow(18); // one = 1 ether = 10^18
  const ten9: BigNumber = BigNumber.from(10).pow(9); // ten9 = 10^-9 ether = 10^9
  let masterChef: MasterChef;

  let manager: UbiquityAlgorithmicDollarManager;
  let secondAccount: Signer;
  let secondAddress: string;
  let ubiquityFormulas: UbiquityFormulas;
  let metaPool: IMetaPool;

  const UBQ_MINTER_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
  );

  before(async () => {
    ({
      manager,
      secondAccount,
      metaPool,
      ubiquityFormulas,
    } = await bondingSetup());
    secondAddress = await secondAccount.getAddress();
  });
});
