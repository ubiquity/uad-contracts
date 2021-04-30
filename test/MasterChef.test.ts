/* eslint-disable @typescript-eslint/no-use-before-define */
import { ethers } from "hardhat";
import { describe, it } from "mocha";
import { BigNumber } from "ethers";
import { expect } from "./setup";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { bondingSetup } from "./BondingSetup";
import { MasterChef } from "../artifacts/types/MasterChef";
import { UbiquityFormulas } from "../artifacts/types/UbiquityFormulas";
// import "./interfaces/ITWAPOracle.sol";

describe("MasterChef", () => {
  let masterChef: MasterChef;

  describe("Init", () => {
    it("Shoud deploy MasterChef", async () => {
      // DEPLOY MasterChef
      masterChef = (await (
        await ethers.getContractFactory("MasterChef", {
          libraries: {
            UbiquityFormulas: ubiquityFormulas.address,
          },
        })
      ).deploy(manager.address)) as MasterChef;
      await manager.setMasterChefAddress(masterChef.address);

      expect(masterChef.address.length).to.be.equal(42);
    });
    it("Shoud register MasterChef on Manager", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const managerMasterChefAddress = await manager.masterChefAddress();
      expect(masterChef.address).to.be.equal(managerMasterChefAddress);
    });
  });

  describe("ugovMultiply", () => {
    it("Shoud modify uGOVmultiplier, multiplied by 1.05 ", async () => {
      const multiplier = BigNumber.from(10).pow(18).mul(1); // 1
      const price = BigNumber.from(10).pow(18).mul(1); // 1
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const newMultiplier = (await ubiquityFormulas.ugovMultiply(
        multiplier,
        price
      )) as BigNumber;
      // console.log(newMultiplier.toString());
      expect(newMultiplier).to.be.equal(multiplier.mul(105).div(100));
    });

    it("Shoud modify uGOVmultiplier, divided by 2 ", async () => {
      const multiplier = BigNumber.from(10).pow(18).mul(1); // 1
      const price = BigNumber.from(10).pow(17).mul(21); // 2.1
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const newMultiplier = (await ubiquityFormulas.ugovMultiply(
        multiplier,
        price
      )) as BigNumber;
      // console.log(newMultiplier.toString());
      expect(newMultiplier).to.be.equal(multiplier.div(2));
    });

    it("Should leave uGOVmultiplier unchanged, bigger than 5", async () => {
      const multiplier = BigNumber.from(10).pow(15).mul(4999); // 4.999
      const price = BigNumber.from(10).pow(18).mul(1); // 1
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const newMultiplier = (await ubiquityFormulas.ugovMultiply(
        multiplier,
        price
      )) as BigNumber;
      // console.log(newMultiplier.toString());
      expect(newMultiplier).to.be.equal(multiplier);
    });

    it("Should leave uGOVmultiplier unchanged, less than 0.2", async () => {
      const multiplier = BigNumber.from(10).pow(16).mul(35); // 0.35
      const price = BigNumber.from(10).pow(18).mul(2); // 2
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const newMultiplier = (await ubiquityFormulas.ugovMultiply(
        multiplier,
        price
      )) as BigNumber;
      // console.log(newMultiplier.toString());
      expect(newMultiplier).to.be.equal(multiplier);
    });
  });

  let manager: UbiquityAlgorithmicDollarManager;
  let ubiquityFormulas: UbiquityFormulas;

  before(async () => {
    ({ manager, ubiquityFormulas } = await bondingSetup());
  });
});
