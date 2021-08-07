import { expect } from "chai";
import { ethers, deployments } from "hardhat";
import { impersonate, resetFork } from "./utils/hardhatNode";

import { MasterChefV2 } from "../artifacts/types/MasterChefV2";

let masterChefV2: MasterChefV2;

describe("MasterChefV2.1", () => {
  before(async () => {
    await resetFork(12967000);
    await impersonate("0xefC0e701A824943b469a694aC564Aa1efF7Ab7dd");

    await deployments.fixture(["MasterChefV2.1"]);
    // masterChefV2 = await ethers.getContract("MasterChefV2");
    masterChefV2 = (await ethers.getContractAt(
      "MasterChefV2",
      (
        await deployments.get("MasterChefV2")
      ).address
    )) as MasterChefV2;
  });

  it("Should deploy", () => {
    expect(masterChefV2.address).to.be.properAddress;
  });

  it("Should have proper balances", async () => {
    const bondingShareV2 = await ethers.getContractAt(
      "BondingShareV2",
      "0x2dA07859613C14F6f05c97eFE37B9B4F212b5eF5"
    );
    const amounts = [
      "0",
      "1301000000000000000",
      "74603879373206500005186",
      "44739174270101943975392",
      "1480607760433248019987",
      "9351040526163838324896",
    ];

    for (let bondId = 0; bondId <= 5; bondId += 1) {
      const bond = await bondingShareV2.getBond(bondId);

      // console.log(`BOND #${bondId} ${bond[0]}`);
      // console.log(`lpAmount ${ethers.utils.formatEther(bond[5])}`);

      expect(bond[5]).to.be.equal(amounts[bondId]);
    }
  });
});
