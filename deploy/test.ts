import { LedgerSigner } from "@ethersproject/hardware-wallets";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { ethers } = hre;
  // const provider = new providers.JsonRpcProvider("https://mainnet.infura.io");
  console.log("------------------------YEAH");
  const type = "hid";
  const path = `m/44'/60'/0'/0/0`;
  const signer = new LedgerSigner(ethers.provider, type, path);

  const address = await signer.getAddress();
  console.log(address);
};
export default func;
func.tags = ["Test"];
