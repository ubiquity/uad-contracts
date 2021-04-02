import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";

const deployFunc: DeployFunction = async ({ deployments }) => {
  const [admin] = await ethers.getSigners();

  const UbiquityAlgorithmicDollarManagerDeployment = await deployments.deploy(
    "UbiquityAlgorithmicDollarManager",
    {
      from: admin.address,
      args: [admin.address],
      log: true,
      deterministicDeployment: true,
    }
  );

  const uADMgr: UbiquityAlgorithmicDollarManager = (await ethers.getContractAt(
    "UbiquityAlgorithmicDollarManager",
    UbiquityAlgorithmicDollarManagerDeployment.address
  )) as UbiquityAlgorithmicDollarManager;

  const bondingShare = await deployments.get("BondingShare");
  await uADMgr.connect(admin).setBondingShareAddress(bondingShare.address);
};

export default deployFunc;
deployFunc.tags = ["UbiquityAlgorithmicDollarManager"];
deployFunc.dependencies = ["BondingShare"];
