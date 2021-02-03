import { ethers } from "hardhat";

export default async ({ deployments }) => {
  const { deploy } = deployments;
  const [admin] = await ethers.getSigners();

  await deploy("UbiquityAlgorithmicDollarManager", {
    from: admin.address,
    args: [admin.address],
    log: true,
    deterministicDeployment: true,
  });

  const UbiquityAlgorithmicDollarManager = await deployments.get(
    "UbiquityAlgorithmicDollarManager"
  );
  const ubiquityAlgorithmicDollarManager = new ethers.Contract(
    UbiquityAlgorithmicDollarManager.address,
    UbiquityAlgorithmicDollarManager.abi
  );

  const bondingShare = await deployments.get("BondingShare");
  await ubiquityAlgorithmicDollarManager
    .connect(admin)
    .setBondingShareAddress(bondingShare.address);
};
