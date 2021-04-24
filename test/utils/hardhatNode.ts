import { network, ethers } from "hardhat";

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

export async function mineTsBlock(ts: number): Promise<void> {
  const blockBefore = await ethers.provider.getBlock("latest");
  await mineBlock(blockBefore.timestamp + ts);
}

export async function mineNBlock(
  blockCount: number,
  secondsBetweenBlock?: number
): Promise<void> {
  const blockBefore = await ethers.provider.getBlock("latest");
  const minings = [...Array(blockCount).keys()].map((v, i) => {
    const newTs = blockBefore.timestamp + i + (secondsBetweenBlock || 1);
    return mineBlock(newTs);
  });
  await Promise.all(minings);
}

export async function resetFork(blockNumber: number): Promise<void> {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY || ""
            }`,
          blockNumber,
        },
      },
    ],
  });
}
