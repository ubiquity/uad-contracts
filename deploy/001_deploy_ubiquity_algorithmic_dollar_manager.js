const { ethers } = require("hardhat");

module.exports = async ({ deployments }) => {
  const { deploy } = deployments;
  const [admin] = await ethers.getSigners();

  await deploy("UbiquityAlgorithmicDollarManager", {
    from: admin.address,
    args: [admin.address],
    log: true,
    deterministicDeployment: true,
  });

  const UbiquityAlgorithmicDollarManager = await ethers.getContract(
    "UbiquityAlgorithmicDollarManager"
  );
  const bondingShare = await ethers.getContract("BondingShare");
  await UbiquityAlgorithmicDollarManager.connect(admin).setBondingShareAddress(
    bondingShare.address
  );
};
