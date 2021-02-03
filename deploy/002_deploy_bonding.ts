import { ethers } from "hardhat";

export default async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { sablier } = await getNamedAccounts();
  const [admin] = await ethers.getSigners();
  const manager = await deployments.get("UbiquityAlgorithmicDollarManager");

  await deploy("Bonding", {
    from: admin.address,
    args: [manager.address, sablier],
    log: true,
    deterministicDeployment: true,
  });
};
