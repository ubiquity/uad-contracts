import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { BondingShare } from "../artifacts/types/BondingShare";

const deployFunc: DeployFunction = async ({ deployments }) => {
  const [admin] = await ethers.getSigners();

  console.log(admin.address);
  const BondingShareDeployment = await deployments.deploy("BondingShare", {
    from: admin.address,
    log: true,
    deterministicDeployment: true,
  });

  const bs: BondingShare = (await ethers.getContractAt(
    "BondingShare",
    BondingShareDeployment.address
  )) as BondingShare;

  console.log(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await bs.connect(admin).getRoleMember(ethers.utils.id("MINTER_ROLE"), "0")
  );
};

export default deployFunc;
deployFunc.tags = ["BondingShare"];
