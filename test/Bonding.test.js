const { expect, use } = require("chai");
const { describe, it, before } = require("mocha");
const {
  ethers,
  deployments,
  waffle,
  getNamedAccounts,
  network,
} = require("hardhat");

const CurveABI = require("./Curve.json");
const { mineBlock } = require("./utils/hardhatNode");

const provider = waffle.provider;
const { deploy } = deployments;
const { solidity } = waffle;
use(solidity);

describe("Bonding", () => {
  let bonding;
  let manager;
  let admin;
  let secondAccount;
  let uAD;
  let sablier;
  let USDC;
  let DAI;
  let CurveFactory;
  let _3CrvBasePool;
  let _3CrvToken;
  let curveWhaleAddress;
  let twapOracle;
  let bondingShare;

  before(async () => {
    ({
      sablier,
      USDC,
      DAI,
      CurveFactory,
      _3CrvBasePool,
      _3CrvToken,
      curveWhaleAddress,
    } = await getNamedAccounts());
    [admin, secondAccount] = await ethers.getSigners();

    const BondingShare = await deploy("BondingShare", {
      from: admin.address,
    });

    bondingShare = new ethers.Contract(
      BondingShare.address,
      BondingShare.abi,
      provider
    );

    const Manager = await deploy("UbiquityAlgorithmicDollarManager", {
      from: admin.address,
      args: [admin.address],
    });
    manager = new ethers.Contract(Manager.address, Manager.abi, provider);

    await manager.connect(admin).setBondingShareAddress(bondingShare.address);

    const UAD = await deploy("UbiquityAlgorithmicDollar", {
      from: admin.address,
    });
    uAD = new ethers.Contract(UAD.address, UAD.abi, provider);

    for (const signer of [manager, admin, secondAccount]) {
      await uAD
        .connect(admin)
        .mint(signer.address, ethers.utils.parseEther("10000"));
    }

    await manager.connect(admin).setuADTokenAddress(uAD.address);

    const crvToken = new ethers.Contract(_3CrvToken, CurveABI.abi, provider);

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [curveWhaleAddress],
    });

    const curveWhale = await ethers.provider.getSigner(curveWhaleAddress);

    await crvToken
      .connect(curveWhale)
      .transfer(manager.address, ethers.utils.parseEther("10000"));

    await manager
      .connect(admin)
      .deployStableSwapPool(
        CurveFactory,
        _3CrvBasePool,
        crvToken.address,
        10,
        4000000
      );

    const metaPoolAddr = await manager.stableSwapMetaPoolAddress();

    const TWAPOracle = await deploy("TWAPOracle", {
      from: admin.address,
      args: [metaPoolAddr, _3CrvToken, uAD.address],
    });

    twapOracle = new ethers.Contract(
      TWAPOracle.address,
      TWAPOracle.abi,
      provider
    );

    await manager.connect(admin).setTwapOracleAddress(twapOracle.address);

    await twapOracle.connect(secondAccount).update();

    let blockTimestamp =
      parseInt((await twapOracle.reservesBlockTimestampLast()).toString()) +
      23 * 3600;
    await mineBlock(blockTimestamp);
    await twapOracle.connect(secondAccount).update();

    blockTimestamp =
      parseInt((await twapOracle.reservesBlockTimestampLast()).toString()) +
      23 * 3600;
    await mineBlock(blockTimestamp);
    await twapOracle.connect(secondAccount).update();

    const Bonding = await deploy("Bonding", {
      from: admin.address,
      args: [manager.address, sablier],
    });
    bonding = new ethers.Contract(Bonding.address, Bonding.abi, provider);

    await bondingShare
      .connect(admin)
      .grantRole(ethers.utils.id("MINTER_ROLE"), bonding.address);
  });

  describe("CollectableDust", () => {
    it("Admin should be able to add protocol token (CollectableDust)", async () => {
      await bonding.connect(admin).addProtocolToken(USDC);
    });

    it("Should revert when another account tries to add protocol token (CollectableDust)", async () => {
      await expect(
        bonding.connect(secondAccount).addProtocolToken(USDC)
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should revert when trying to add an already existing protocol token (CollectableDust)", async () => {
      await expect(
        bonding.connect(admin).addProtocolToken(USDC)
      ).to.be.revertedWith("collectable-dust::token-is-part-of-the-protocol");
    });

    it("Should revert when another account tries to remove a protocol token (CollectableDust)", async () => {
      await expect(
        bonding.connect(secondAccount).removeProtocolToken(USDC)
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Admin should be able to remove protocol token (CollectableDust)", async () => {
      await bonding.connect(admin).removeProtocolToken(USDC);
    });

    it("Should revert when trying to remove token that is not a part of the protocol (CollectableDust)", async () => {
      await expect(
        bonding.connect(admin).removeProtocolToken(USDC)
      ).to.be.revertedWith("collectable-dust::token-not-part-of-the-protocol");
    });

    it("Admin should be able to send dust from the contract (CollectableDust)", async () => {
      // Send ETH to the Bonding contract
      await secondAccount.sendTransaction({
        to: bonding.address,
        value: ethers.utils.parseUnits("100", "gwei"),
      });

      // Send dust back to the admin
      await bonding
        .connect(admin)
        .sendDust(
          admin.address,
          await bonding.ETH_ADDRESS(),
          ethers.utils.parseUnits("50", "gwei")
        );
    });

    it("Should emit DustSent event (CollectableDust)", async () => {
      await expect(
        bonding
          .connect(admin)
          .sendDust(
            admin.address,
            await bonding.ETH_ADDRESS(),
            ethers.utils.parseUnits("50", "gwei")
          )
      )
        .to.emit(bonding, "DustSent")
        .withArgs(
          admin.address,
          await bonding.ETH_ADDRESS(),
          ethers.utils.parseUnits("50", "gwei")
        );
    });
    it("Should revert when another account tries to remove dust from the contract (CollectableDust)", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .sendDust(
            admin.address,
            await bonding.ETH_ADDRESS(),
            ethers.utils.parseUnits("100", "gwei")
          )
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should emit ProtocolTokenAdded event (CollectableDust)", async () => {
      await expect(bonding.connect(admin).addProtocolToken(DAI))
        .to.emit(bonding, "ProtocolTokenAdded")
        .withArgs(DAI);
    });

    it("Should emit ProtocolTokenRemoved event (CollectableDust)", async () => {
      await expect(bonding.connect(admin).removeProtocolToken(DAI))
        .to.emit(bonding, "ProtocolTokenRemoved")
        .withArgs(DAI);
    });
  });

  describe("maxBondingPrice", () => {
    it("Admin should be able to update the maxBondingPrice", async () => {
      await bonding
        .connect(admin)
        .setMaxBondingPrice(ethers.constants.MaxUint256);
      expect(await bonding.maxBondingPrice()).to.equal(
        ethers.constants.MaxUint256
      );
    });

    it("Should revert when unauthorized accounts try to update the maxBondingPrice", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .setMaxBondingPrice(ethers.constants.MaxUint256)
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should emit the MaxBondingPriceUpdated event", async () => {
      await expect(
        bonding.connect(admin).setMaxBondingPrice(ethers.constants.MaxUint256)
      )
        .to.emit(bonding, "MaxBondingPriceUpdated")
        .withArgs(ethers.constants.MaxUint256);
    });
  });

  describe("bondingDiscountMultiplier", () => {
    it("Admin should be able to update the bondingDiscountMultiplier", async () => {
      await bonding
        .connect(admin)
        .setBondingDiscountMultiplier(ethers.BigNumber.from(2));
      expect(await bonding.bondingDiscountMultiplier()).to.equal(
        ethers.BigNumber.from(2)
      );
    });

    it("Should revert when unauthorized accounts try to update the bondingDiscountMultiplier", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .setBondingDiscountMultiplier(ethers.BigNumber.from(2))
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should emit the BondingDiscountMultiplierUpdated event", async () => {
      await expect(
        bonding
          .connect(admin)
          .setBondingDiscountMultiplier(ethers.BigNumber.from(2))
      )
        .to.emit(bonding, "BondingDiscountMultiplierUpdated")
        .withArgs(ethers.BigNumber.from(2));
    });
  });

  describe("redeemStreamTime", () => {
    it("Admin should be able to update the redeemStreamTime", async () => {
      await bonding
        .connect(admin)
        .setRedeemStreamTime(ethers.BigNumber.from("0"));

      expect(await bonding.redeemStreamTime()).to.equal(
        ethers.BigNumber.from("0")
      );
    });

    it("Should revert when unauthorized accounts try to update the redeemStreamTime", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .setRedeemStreamTime(ethers.BigNumber.from(0))
      ).to.be.revertedWith("Caller is not a bonding manager");
    });

    it("Should emit the RedeemStreamTimeUpdated event", async () => {
      await expect(
        bonding
          .connect(admin)
          .setRedeemStreamTime(ethers.BigNumber.from("604800"))
      )
        .to.emit(bonding, "RedeemStreamTimeUpdated")
        .withArgs(ethers.BigNumber.from("604800"));
    });
  });

  describe("StableSwap meta pool TWAP oracle", () => {
    it("Oracle should return the correct initial price", async () => {
      expect(
        await twapOracle.consult(uAD.address, ethers.utils.parseEther("1"))
      ).to.equal(ethers.utils.parseEther("1"));
    });
  });

  describe("bondTokens", () => {
    it("User should be able to bond uAD tokens", async () => {
      const prevBondingSharesBalance = parseInt(
        (await bondingShare.balanceOf(secondAccount.address)).toString()
      );

      const amountToBond = ethers.utils.parseEther("5000");

      await uAD
        .connect(secondAccount)
        .approve(bonding.address, ethers.BigNumber.from("0"));
      await uAD.connect(secondAccount).approve(bonding.address, amountToBond);

      await bonding.connect(secondAccount).bondTokens(amountToBond);

      const newBondingSharesBalance = parseInt(
        (await bondingShare.balanceOf(secondAccount.address)).toString()
      );

      expect(newBondingSharesBalance).to.be.greaterThan(
        prevBondingSharesBalance
      );
    });
  });

  describe("redeemShares", () => {
    it("Should revert when users try to redeem more shares than they have", async () => {
      await expect(
        bonding
          .connect(secondAccount)
          .redeemShares(ethers.utils.parseEther("10000"))
      ).to.be.revertedWith("Bonding: Caller does not have enough shares");
    });

    it("Users should be able to instantaneously redeem shares when the redeemStreamTime is 0", async () => {
      const initialRedeemStreamTime = await bonding.redeemStreamTime();
      await bonding
        .connect(admin)
        .setRedeemStreamTime(ethers.BigNumber.from("0"));

      const prevUADBalance = parseInt(
        (await uAD.balanceOf(secondAccount.address)).toString()
      );
      const prevBondingSharesBalance = await bondingShare.balanceOf(
        secondAccount.address
      );
      await bondingShare
        .connect(secondAccount)
        .approve(bonding.address, ethers.BigNumber.from("0"));
      await bondingShare
        .connect(secondAccount)
        .approve(bonding.address, prevBondingSharesBalance);

      await bonding
        .connect(secondAccount)
        .redeemShares(prevBondingSharesBalance);

      const newUADBalance = parseInt(
        (await uAD.balanceOf(secondAccount.address)).toString()
      );

      const newBondingSharesBalance = parseInt(
        (await bondingShare.balanceOf(secondAccount.address)).toString()
      );

      expect(prevUADBalance).to.be.lessThan(newUADBalance);

      expect(parseInt(prevBondingSharesBalance.toString())).to.be.greaterThan(
        newBondingSharesBalance
      );

      await bonding.connect(admin).setRedeemStreamTime(initialRedeemStreamTime);
    });

    it("Users should be able to start Sablier streams to redeem their shares", async () => {
      const prevUADBalance = parseInt(
        (await uAD.balanceOf(secondAccount.address)).toString()
      );

      const amountToBond = ethers.utils.parseEther("5000");
      await uAD
        .connect(secondAccount)
        .approve(bonding.address, ethers.BigNumber.from("0"));
      await uAD.connect(secondAccount).approve(bonding.address, amountToBond);

      await bonding.connect(secondAccount).bondTokens(amountToBond);

      const prevBondingSharesBalance = await bondingShare.balanceOf(
        secondAccount.address
      );

      await bondingShare
        .connect(secondAccount)
        .approve(bonding.address, ethers.BigNumber.from("0"));
      await bondingShare
        .connect(secondAccount)
        .approve(bonding.address, prevBondingSharesBalance);

      await bonding
        .connect(secondAccount)
        .redeemShares(prevBondingSharesBalance);

      expect(
        parseInt((await uAD.balanceOf(secondAccount.address)).toString())
      ).to.be.lessThan(prevUADBalance);

      expect(parseInt(prevBondingSharesBalance.toString())).to.be.greaterThan(
        parseInt(
          (await bondingShare.balanceOf(secondAccount.address)).toString()
        )
      );
    });
  });

  describe("Sablier configuration", () => {
    it("Should return the current Sablier address", async () => {
      expect(await bonding.sablier()).to.equal(sablier);
    });

    it("admin should be able to update the Sablier address", async () => {
      await bonding.connect(admin).setSablier(ethers.constants.AddressZero);
      expect(await bonding.sablier()).to.equal(ethers.constants.AddressZero);
    });

    it("Should emit the SablierUpdated event", async () => {
      await expect(bonding.connect(admin).setSablier(DAI))
        .to.emit(bonding, "SablierUpdated")
        .withArgs(DAI);
    });

    it("Should revert when another account tries to update the Sablier address", async () => {
      await expect(
        bonding.connect(secondAccount).setSablier(ethers.constants.AddressZero)
      ).to.be.revertedWith("Caller is not a bonding manager");
    });
  });
});
