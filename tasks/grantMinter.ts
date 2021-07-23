import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";

// This file is only here to make interacting with the Dapp easier,
// feel free to ignore it if you don't need it.

task("grantMinter", "grant minter role to an address")
  .addParam("receiver", "The address that will be granted")
  .addParam("manager", "The address of uAD Manager")
  .setAction(
    async (taskArgs: { receiver: string; manager: string }, { ethers }) => {
      const net = await ethers.provider.getNetwork();

      if (net.name === "hardhat") {
        console.warn(
          "You are running the faucet task with Hardhat network, which" +
            "gets automatically created and destroyed every time. Use the Hardhat" +
            " option '--network localhost'"
        );
      }
      console.log(`net chainId: ${net.chainId}  `);

      const UBQ_MINTER_ROLE = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes("UBQ_MINTER_ROLE")
      );
      const manager = (await ethers.getContractAt(
        "UbiquityAlgorithmicDollarManager",
        taskArgs.manager
      )) as UbiquityAlgorithmicDollarManager;

      const isMinter = await manager.hasRole(
        UBQ_MINTER_ROLE,
        taskArgs.receiver
      );
      console.log(
        `${taskArgs.receiver} is minter ?:${isMinter ? "True" : "False"}`
      );

      if (!isMinter) {
        const tx = await manager.grantRole(UBQ_MINTER_ROLE, taskArgs.receiver);
        await tx.wait();
        console.log(`Minter role granted`);
      }
    }
  );
