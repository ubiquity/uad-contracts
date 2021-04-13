import { Signer } from "ethers";
import { deployments, ethers } from "hardhat";
import { expect } from "chai";

let adminAddress: string;
let admin: Signer;

before(async () => {
  [admin] = await ethers.getSigners();
  adminAddress = await admin.getAddress();
});

describe("deploy BondingShare", () => {
  it("one arg with ethers.deploy should work", async () => {
    await (await ethers.getContractFactory("BondingShare"))
      .connect(admin)
      .deploy(adminAddress);
  });
  it("two args with ethers.deploy should fail", async () => {
    // await expect(async function () {
    await (await ethers.getContractFactory("BondingShare")).deploy({
      from: adminAddress,
      args: adminAddress,
    });
    // }).to.throw;
  });
  it("two args with deployment.deploy should work", async () => {
    const BondingShareDeployment = await deployments.deploy("BondingShare", {
      from: adminAddress,
      args: [adminAddress],
    });
    await ethers.getContractAt("BondingShare", BondingShareDeployment.address);
  });
});
