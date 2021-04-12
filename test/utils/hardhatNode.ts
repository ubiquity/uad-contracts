import { network } from "hardhat";

export async function passOneHour(): Promise<void> {
  await network.provider.request({
    method: "evm_increaseTime",
    params: [3600],
  });
}

export async function mineBlock(timestamp: number): Promise<void> {
  await network.provider.request({
    method: "evm_mine",
    params: [timestamp],
  });
}
export async function resetFork(blockNumber: number): Promise<void> {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${
            process.env.ALCHEMY_API_KEY || ""
          }`,
          blockNumber,
        },
      },
    ],
  });
}
