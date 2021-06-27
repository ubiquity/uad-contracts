import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import dotenv from "dotenv";
import axios from "axios";
import { Bonding } from "../artifacts/types/Bonding";
import { UbiquityAlgorithmicDollarManager } from "../artifacts/types/UbiquityAlgorithmicDollarManager";

dotenv.config();
// This file is only here to make interacting with the Dapp easier,
// feel free to ignore it if you don't need it.

task("bondingdeposit", "Get info bonding deposit").setAction(
  async (taskArgs: { receiver: string; manager: string }, { ethers }) => {
    const net = await ethers.provider.getNetwork();
    const managerAdr = "0x4DA97a8b831C345dBe6d16FF7432DF2b7b776d98";

    if (net.name === "hardhat") {
      console.warn("You are running the   task with Hardhat network");
    }
    console.log(`net chainId: ${net.chainId}  `);
    const manager = (await ethers.getContractAt(
      "UbiquityAlgorithmicDollarManager",
      managerAdr
    )) as UbiquityAlgorithmicDollarManager;

    const mgrbondingShareAddress = await manager.bondingShareAddress();
    const mgrbondingContractAddress = await manager.bondingContractAddress();
    const { ETHERSCAN_API_KEY } = process.env;

    const bonding = (await ethers.getContractAt(
      "Bonding",
      mgrbondingContractAddress
    )) as Bonding;
    const url = `https://api.etherscan.io/api\?module\=account\&action\=txlist\&address\=${mgrbondingContractAddress}\&startblock\=12648260\&endblock\=12674210\&sort\=asc\&apikey\=${ETHERSCAN_API_KEY}`;
    console.log("url", url);
    /*
    const req = https
      .get(url, (res) => {
        let body = "";
        console.log("statusCode:", res.statusCode);
        console.log("headers:", res.headers);
        res.on("data", (chunk) => {
          body += chunk;
          console.log("data", chunk);
        });

        res.on("end", () => {
          try {
            console.log("body", body);
            json = JSON.parse(body);
            // do something with JSON
          } catch (error) {
            console.error(error.message);
          }
        });
      })
      .on("error", (error) => {
        console.error(error.message);
      }); */
    let users;
    const x = await axios.get(url);
    /*   .then((res) => {
        const headerDate =
          res.headers && res.headers.date
            ? res.headers.date
            : "no response date";
        console.log("Status Code:", res.status);
        console.log("Date in Response header:", headerDate);

        users = res.data as any[];

        users.forEach((user: any) => {
          console.log(
            `Got user with blockNumber: ${user.blockNumber}, isError: ${user.isError}`
          );
        });
      })
      .catch((err) => {
        console.log("Error: ", err.message);
      }); */
    console.log(`
      ****
      json:${JSON.stringify(x)}

      `);
  }
);
