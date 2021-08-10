/* eslint-disable @typescript-eslint/no-unsafe-call */
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// manager address
const mgrAdr = "0x4DA97a8b831C345dBe6d16FF7432DF2b7b776d98";

// Accounts already migrated to V2.0
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
  const { deployments, getNamedAccounts } = hre;
  const { ubq } = await getNamedAccounts();
  deployments.log("MasterChefV2.1 deployer:", ubq);

  await deployments.deploy("MasterChefV2", {
    args: [mgrAdr, tos, amounts, ids],
    from: ubq,
    log: true,
  });
};
export default func;
func.tags = ["MasterChefV2.1"];
