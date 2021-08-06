/* eslint-disable @typescript-eslint/no-unsafe-call */
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Signer } from "ethers";

// accounts already migrated to V2.0
const tos = [
  "0x89eae71b865a2a39cba62060ab1b40bbffae5b0d",
  "0x4007ce2083c7f3e18097aeb3a39bb8ec149a341d",
  "0x7c76f4db70b7e2177de10de3e2f668dadcd11108",
  "0x0000ce08fa224696a819877070bf378e8b131acf",
  "0xa53a6fe2d8ad977ad926c485343ba39f32d3a3f6",
];
const amounts = [
  "1301000000000000000",
  "74603879373206500005186",
  "44739174270101943975392",

  "1480607760433248019987",
  "9351040526163838324896",
];
const ids = [1, 2, 3, 4, 5];

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, ethers, getNamedAccounts, network } = hre;

  let ubqSigner: Signer;
  let ubq: string;

  if (network.name === "mainnet") {
    deployments.log("PROD : use account 0 to sign transactions");
    [ubqSigner] = await ethers.getSigners();
    ubq = await ubqSigner.getAddress();
  } else if (network.name === "hardhat") {
    deployments.log(
      "TESTS : use impersonated ubq address to sign transactions"
    );
    ({ ubq } = await getNamedAccounts());
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [ubq],
    });
    ubqSigner = ethers.provider.getSigner(ubq);
  } else {
    console.error("wrong network");
    return;
  }
  deployments.log("admin address :", ubq);

  const UBQ_MINTER_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
  );
  const opts = {
    from: ubq,
    log: true,
  };

  const mgrAdr = "0x4DA97a8b831C345dBe6d16FF7432DF2b7b776d98";
  const mgrFactory = await ethers.getContractFactory(
    "UbiquityAlgorithmicDollarManager"
  );
  const manager = mgrFactory.attach(mgrAdr);

  const masterChefV2 = await deployments.deploy("MasterChefV2", {
    args: [manager.address, tos, amounts, ids],
    ...opts,
  });
  deployments.log("MasterChefV2.1 deployed at:", masterChefV2.address);

  await manager.connect(ubqSigner).setMasterChefAddress(masterChefV2.address);
  deployments.log("MasterChefV2.1 registered on manager");

  await manager
    .connect(ubqSigner)
    .grantRole(UBQ_MINTER_ROLE, masterChefV2.address);
  deployments.log("MasterChefV2.1 granted minter role");
};
export default func;
func.tags = ["MasterChefV2.1"];
