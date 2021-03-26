import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";

const deployFunc: DeployFunction = async ({
  deployments,
  getNamedAccounts,
}) => {
  const { sablier } = await getNamedAccounts();
  const [admin] = await ethers.getSigners();
  const manager = await deployments.get("UbiquityAlgorithmicDollarManager");

  await deployments.deploy("Bonding", {
    from: admin.address,
    args: [manager.address, sablier],
    log: true,
    deterministicDeployment: true,
  });
};

export default deployFunc;
deployFunc.tags = ["Bonding"];
deployFunc.dependencies = ["UbiquityAlgorithmicDollarManager"];
