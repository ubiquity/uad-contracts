// Should test UBQ claiming after migration

import { expect } from "chai";
import { ethers, network, getNamedAccounts } from "hardhat";
import { Signer } from "ethers";
import { MasterChef } from "../artifacts/types/MasterChef";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";

let masterChef: MasterChef;

let adminAddress: string;
let masterChefAddress: string;
let ubqWhaleAddress: string;
let UbiquityAlgorithmicDollarManagerAddress: string;

let admin: Signer;
let ubqWhale: Signer;
let manager: UbiquityAlgorithmicDollarManager;

const UBQ_MINTER_ROLE = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
);

describe("MasterChef UBQ rewards", () => {
  beforeEach(async () => {
    ({
      adminAddress,
      ubqWhaleAddress,
      masterChefAddress,
      UbiquityAlgorithmicDollarManagerAddress,
    } = await getNamedAccounts());
    masterChef = (await ethers.getContractAt(
      "MasterChef",
      masterChefAddress
    )) as MasterChef;

    manager = (await ethers.getContractAt(
      "UbiquityAlgorithmicDollarManager",
      UbiquityAlgorithmicDollarManagerAddress
    )) as UbiquityAlgorithmicDollarManager;

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [ubqWhaleAddress],
    });

    admin = ethers.provider.getSigner(adminAddress);
    ubqWhale = ethers.provider.getSigner(ubqWhaleAddress);
  });

  describe("Before migration", () => {
    it("Should get pending UBQ from whale address", async () => {
      expect(await masterChef.pendingUGOV(ubqWhaleAddress)).to.be.gt(1000);
    });

    it("Claiming UBQ rewards should work", async () => {
      await (await masterChef.connect(ubqWhale).getRewards()).wait();
      expect(await masterChef.pendingUGOV(ubqWhaleAddress)).to.be.equal(0);
    });
  });

  describe("After migration", () => {
    it("Claiming UBQ rewards fail without MINTER_ROLE", async () => {
      await manager
        .connect(admin)
        .revokeRole(UBQ_MINTER_ROLE, masterChefAddress);
      await expect(
        masterChef.connect(ubqWhale).getRewards()
      ).to.be.revertedWith("Governance token: not minter");
    });
  });
});
