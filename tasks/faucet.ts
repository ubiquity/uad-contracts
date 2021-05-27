import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import { ERC20 } from "./types/ERC20";
import { UbiquityAlgorithmicDollarManager } from "./types/UbiquityAlgorithmicDollarManager";
// This file is only here to make interacting with the Dapp easier,
// feel free to ignore it if you don't need it.

task("faucet", "Sends ETH and tokens to an address")
  .addParam("receiver", "The address that will receive them")
  .addParam("manager", "The address of uAD Manager")
  .setAction(
    async (
      taskArgs: { receiver: string; manager: string },
      { ethers, getNamedAccounts }
    ) => {
      const net = await ethers.provider.getNetwork();

      if (net.name === "hardhat") {
        console.warn(
          "You are running the faucet task with Hardhat network, which" +
            "gets automatically created and destroyed every time. Use the Hardhat" +
            " option '--network localhost'"
        );
      }
      console.log(`net chainId: ${net.chainId}  `);
      const manager = (await ethers.getContractAt(
        "UbiquityAlgorithmicDollarManager",
        taskArgs.manager
      )) as UbiquityAlgorithmicDollarManager;
      const uADAdr = await manager.uADTokenAddress();
      const uADtoken = (await ethers.getContractAt("ERC20", uADAdr)) as ERC20;
      const metaPoolAddr = await manager.stableSwapMetaPoolAddress();
      const curveLPtoken = (await ethers.getContractAt(
        "ERC20",
        metaPoolAddr
      )) as ERC20;

      const [sender] = await ethers.getSigners();

      const tx = await uADtoken.transfer(
        taskArgs.receiver,
        ethers.utils.parseEther("100")
      );
      await tx.wait();
      console.log(`-- 100 uAD sent to ${taskArgs.receiver}`);
      const tx2 = await sender.sendTransaction({
        to: taskArgs.receiver,
        value: ethers.constants.WeiPerEther,
      });
      await tx2.wait();
      const tx3 = await curveLPtoken.transfer(
        taskArgs.receiver,
        ethers.utils.parseEther("100")
      );
      await tx3.wait();
      console.log(`-- 100 uAD3CRV-f sent to ${taskArgs.receiver}`);
      const acc = await getNamedAccounts();
      const crvToken = (await ethers.getContractAt(
        "ERC20",
        acc.curve3CrvToken
      )) as ERC20;
      const tx4 = await crvToken.transfer(
        taskArgs.receiver,
        ethers.utils.parseEther("100")
      );
      await tx4.wait();
      console.log(`-- 100 3CRV sent to ${taskArgs.receiver}`);
      console.log(
        `Transferred 1 ETH and 100 uAD and 100 3CRV and 100 curveLP to ${taskArgs.receiver}`
      );
      console.log(`
      To view the token in metamask add these tokens
      uAD token deployed at:${uADAdr}
      uAD-3CRV metapool deployed at:${metaPoolAddr}
      3crv deployed at:${crvToken.address}
      `);
    }
  );
