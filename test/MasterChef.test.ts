/* eslint-disable @typescript-eslint/no-use-before-define */
import { ethers } from "hardhat";
import { describe, it } from "mocha";
import { expect } from "./setup";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";
import { bondingSetup } from "./BondingSetup";
import { MasterChef } from "../artifacts/types/MasterChef";

describe("MasterChef", () => {
  let masterChef: MasterChef;

  describe("Init", () => {
    it("Shoud deploy MasterChef", async () => {
      // DEPLOY MasterChef
      masterChef = (await (
        await ethers.getContractFactory("MasterChef")
      ).deploy(manager.address)) as MasterChef;
      await manager.setMasterChefAddress(masterChef.address);

      expect(masterChef.address.length).to.be.equal(42);
    });
    it("Shoud register MasterChef on Manager", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const managerMasterChefAddress = (await manager.masterChefAddress()) as string;
      expect(masterChef.address).to.be.equal(managerMasterChefAddress);
    });
  });

  let manager: UbiquityAlgorithmicDollarManager;

  before(async () => {
    ({ manager } = await bondingSetup());
  });
});
