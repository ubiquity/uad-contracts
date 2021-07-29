import fs from "fs";
import path from "path";
import { task, types } from "hardhat/config";
import Web3 from "web3";

import * as ethers from "ethers";
import * as ABI from "../deployments/mainnet/Bonding.json"; // Contract ABI
import {
  Transaction,
  TransactionEvent,
  EtherscanResponse,
  generateEtherscanQuery,
  generateEventLogQuery,
  fetchEtherscanApi,
} from "../utils/etherscan";

const inter = new ethers.utils.Interface(ABI.abi);

const BONDING_CONTRACT_ADDRESS = "0x831e3674Abc73d7A3e9d8a9400AF2301c32cEF0C";
const BONDING_SHARE_CONTRACT_ADDRESS =
  "0x0013B6033dd999676Dc547CEeCEA29f781D8Db17";
const TRANSFER_SINGLE_TOPIC_HASH =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";

const CONTRACT_GENESIS_BLOCK = 12595544;
const DEFAULT_OUTPUT_NAME = "bonding_migration.json";

type CliArgs = {
  path: string;
};

type ParsedTransaction = {
  hash: string;
  name: string;
  inputs: Record<string, string>;
  from: string;
  blockNumber: string;
  isError: boolean;
  timestamp: string;
  transaction: Transaction;
};

async function fetchEtherscanBondingContract(): Promise<
  EtherscanResponse<Transaction>
> {
  return fetchEtherscanApi(
    generateEtherscanQuery(
      BONDING_CONTRACT_ADDRESS,
      CONTRACT_GENESIS_BLOCK,
      "latest"
    )
  );
}

async function fetchTransferSingleEvents(): Promise<
  EtherscanResponse<TransactionEvent>
> {
  return fetchEtherscanApi(
    generateEventLogQuery(
      BONDING_SHARE_CONTRACT_ADDRESS,
      TRANSFER_SINGLE_TOPIC_HASH,
      CONTRACT_GENESIS_BLOCK,
      "latest"
    )
  );
}

function parseTransactions(transactions: Transaction[]): ParsedTransaction[] {
  return transactions.map((t) => {
    const parsedTransaction: ParsedTransaction = {
      hash: t.hash,
      name: "",
      inputs: {},
      from: t.from,
      blockNumber: t.blockNumber,
      isError: t.isError === "1",
      timestamp: new Date(parseInt(t.timeStamp, 10) * 1000).toISOString(),
      transaction: t,
    };
    if (t.to) {
      const input = inter.parseTransaction({ data: t.input });
      parsedTransaction.name = input.name;

      parsedTransaction.inputs = Object.fromEntries(
        Object.keys(input.args)
          .filter((k) => !/^[0-9]+$/.exec(k))
          .map((k) => {
            return [k, (input.args[k] as ethers.BigNumber).toString()];
          })
      );
    } else {
      parsedTransaction.name = "Contract creation";
    }
    return parsedTransaction;
  });
}
function calculateTotal(amounts: string[]): string {
  const lpsAmount = amounts.reduce(
    (t, d) => t.add(ethers.BigNumber.from(d)),
    ethers.BigNumber.from(0)
  );
  return ethers.utils.formatEther(lpsAmount);
}
function writeToDisk(
  migrations: { [key: string]: MigrationData },
  directory: string
) {
  fs.writeFileSync(
    directory,
    JSON.stringify(Object.values(migrations), null, 2)
  );
}

type Deposit = {
  hash: string;
  lpsAmount: string;
  weeks: string;
  bondingShareId: string;
  bondingShareAmount: string;
  withdraw: null | Withdraw;
};

type Withdraw = {
  hash: string;
  bondingShareId: string;
  bondingShareAmount: string;
};

type Migration = {
  lpsAmount: string;
  weeks: string;
};

type MigrationData = {
  address: string;
  deposits: Deposit[];
  migration: null | Migration;
};

task(
  "generateBondingMigrationData",
  "Extract the staking state from the bonding contract V1 for the V2 migration"
)
  .addPositionalParam(
    "path",
    "The path to store migration data",
    `./${DEFAULT_OUTPUT_NAME}`,
    types.string
  )
  .setAction(async (taskArgs: CliArgs) => {
    console.log("Arguments: ", taskArgs);
    if (!process.env.ETHERSCAN_API_KEY)
      throw new Error("ETHERSCAN_API_KEY environment variable must be set");

    const parsedPath = path.parse(taskArgs.path);
    if (!fs.existsSync(parsedPath.dir))
      throw new Error(`Path ${parsedPath.dir} does not exist`);

    try {
      const response = await fetchEtherscanBondingContract();

      const transactions = parseTransactions(response.result);
      const deposits = transactions.filter(
        (t) => !t.isError && t.name === "deposit"
      );
      const withdraws = transactions.filter(
        (t) => !t.isError && t.name === "withdraw"
      );

      // Get all the bonding share IDs and values for each transaction ID

      const web3 = new Web3();

      const bondingShareData: { [key: string]: { id: string; value: string } } =
        {};

      (await fetchTransferSingleEvents()).result.forEach((ev) => {
        const data = web3.eth.abi.decodeParameters(
          [
            {
              type: "uint256",
              name: "id",
            },
            { type: "uint256", name: "value" },
          ],
          ev.data
        ) as { id: string; value: string };

        bondingShareData[ev.transactionHash] = {
          id: data.id,
          value: data.value,
        };
      });

      // Generate the migration object

      const migrations: { [key: string]: MigrationData } = {};

      deposits.forEach((tx) => {
        migrations[tx.from] = migrations[tx.from] || {
          address: tx.from,
          deposits: [],
          migration: null,
        };
        migrations[tx.from].deposits.push({
          hash: tx.hash,
          lpsAmount: tx.inputs._lpsAmount,
          weeks: tx.inputs._weeks,
          bondingShareId: bondingShareData[tx.hash].id,
          bondingShareAmount: bondingShareData[tx.hash].value,
          withdraw: null,
        });
      });

      withdraws.forEach((tx) => {
        const withdraw: Withdraw = {
          hash: tx.hash,
          bondingShareId: tx.inputs._id,
          bondingShareAmount: tx.inputs._sharesAmount,
        };

        const deposit = migrations[tx.from].deposits.find(
          (d) => d.bondingShareId === withdraw.bondingShareId
        );
        if (!deposit)
          throw new Error("All withdraws should have been deposited");

        deposit.withdraw = withdraw;
        if (deposit.withdraw.bondingShareAmount < deposit.bondingShareAmount) {
          console.log("Withdrew less than deposited: ", deposit);
        }
      });

      Object.values(migrations).forEach((m) => {
        const depositsToMigrate = m.deposits.filter((d) => !d.withdraw);
        if (depositsToMigrate.length > 0) {
          const lpsAmount = depositsToMigrate.reduce(
            (t, d) => t.add(ethers.BigNumber.from(d.lpsAmount)),
            ethers.BigNumber.from(0)
          );
          const weeks = depositsToMigrate
            .reduce(
              (t, d) =>
                t.add(
                  ethers.BigNumber.from(d.weeks).mul(
                    ethers.BigNumber.from(d.lpsAmount)
                  )
                ),
              ethers.BigNumber.from(0)
            )
            .div(lpsAmount);

          migrations[m.address].migration = {
            lpsAmount: lpsAmount.toString(),
            weeks: weeks.toString(),
          };
        }
      });

      // Print and save to disk

      console.log(JSON.stringify(migrations, null, 2));

      const toMigrateOriginals: string[] = [];
      const toMigrateBalance: string[] = [];
      const toMigrateWeeks: string[] = [];

      Object.values(migrations).forEach((m) => {
        if (m.migration) {
          toMigrateOriginals.push(m.address);
          toMigrateBalance.push(m.migration.lpsAmount);
          toMigrateWeeks.push(m.migration.weeks);
        }
      });

      console.log("Addresses", toMigrateOriginals);
      console.log("Balances", toMigrateBalance);
      console.log("Weeks", toMigrateWeeks);
      console.log("total addresses", toMigrateOriginals.length);
      console.log("total LP to be migrated", calculateTotal(toMigrateBalance));
      writeToDisk(migrations, taskArgs.path);
      console.log("Results saved to: ", path.resolve(taskArgs.path));
    } catch (e) {
      console.error("There was an issue with the task", e);
    }
  });
