// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IERC20Ubiquity.sol";
import "./UbiquityAlgorithmicDollarManager.sol";
import "./interfaces/ITWAPOracle.sol";
import "./interfaces/IUbiquityFormulas.sol";

contract MasterChef {
    UbiquityAlgorithmicDollarManager public manager;
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many uAD-3CRV LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of uGOVs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accuGOVPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accuGOVPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }
    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of uAD-3CRV LP token contract.
        uint256 lastRewardBlock; // Last block number that uGOVs distribution occurs.
        uint256 accuGOVPerShare; // Accumulated uGOVs per share, times 1e12. See below.
    }
    // The uGOV TOKEN!
    IERC20Ubiquity public uGOV;
    // uGOV tokens created per block.
    uint256 public uGOVPerBlock = 1e12;
    // Bonus muliplier for early uGOV makers.
    uint256 public uGOVmultiplier = 2e18;
    // Info of each pool.
    PoolInfo public pool;
    // Info of each user that stakes LP tokens.
    mapping(address => UserInfo) public userInfo;

    event Deposit(address indexed user, uint256 amount);

    event Withdraw(address indexed user, uint256 amount);

    event EmergencyWithdraw(address indexed user, uint256 amount);

    // ----------- Modifiers -----------
    modifier onlyTokenManager() {
        require(
            manager.hasRole(manager.UBQ_TOKEN_MANAGER_ROLE(), msg.sender),
            "UBQ token: not minter"
        );
        _;
    }

    constructor(address _manager) {
        manager = UbiquityAlgorithmicDollarManager(_manager);
        uGOV = IERC20Ubiquity(manager.uGOVTokenAddress());
        pool.lpToken = IERC20(manager.stableSwapMetaPoolAddress());
        pool.lastRewardBlock = block.number;
        pool.accuGOVPerShare = 0; // uint256(1e12);
    }

    function setupUGOVPerBlock(uint256 _uGOVPerBlock)
        external
        onlyTokenManager
    {
        uGOVPerBlock = _uGOVPerBlock;
    }

    function getTwapPrice() public view returns (uint256) {
        return
            ITWAPOracle(manager.twapOracleAddress()).consult(
                manager.uADTokenAddress()
            );
    }

    // UPDATE uGOV multiplier
    function updateUGOVMultiplier() public {
        uGOVmultiplier = IUbiquityFormulas(manager.formulasAddress())
            .ugovMultiply(uGOVmultiplier, getTwapPrice());
    }

    function getMultiplier(uint256 _from, uint256 _to)
        public
        view
        returns (uint256)
    {
        return (_to - _from) * uGOVmultiplier;
    }

    // View function to see pending uGOVs on frontend.
    function pendingUGOV(address _user) external view returns (uint256) {
        UserInfo storage user = userInfo[_user];
        uint256 accuGOVPerShare = pool.accuGOVPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));

        // console.log("accuGOVPerShare", accuGOVPerShare);
        // console.log("lpSupply", lpSupply);

        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier =
                getMultiplier(pool.lastRewardBlock, block.number);

            uint256 uGOVReward = (multiplier * uGOVPerBlock) / 1e18;

            accuGOVPerShare =
                ((accuGOVPerShare + uGOVReward) * 1e12) /
                lpSupply;

            // console.log("multiplier", multiplier);
            // console.log("uGOVReward", uGOVReward);
        }
        // console.log("user.amount", user.amount);
        // console.log("user.rewardDebt", user.rewardDebt);
        // console.log("accuGOVPerShare", accuGOVPerShare);
        return (user.amount * accuGOVPerShare) / 1e12 - user.rewardDebt;
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool() public {
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        updateUGOVMultiplier();
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));

        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 uGOVReward = multiplier * uGOVPerBlock;
        uGOV.mint(address(this), uGOVReward);
        pool.accuGOVPerShare =
            ((pool.accuGOVPerShare + uGOVReward) * 1e12) /
            lpSupply;
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to MasterChef for uGOV allocation.
    function deposit(uint256 _amount) public {
        UserInfo storage user = userInfo[msg.sender];
        updatePool();
        if (user.amount > 0) {
            uint256 pending =
                (user.amount * pool.accuGOVPerShare) / (1e12 - user.rewardDebt);
            safeUGOVTransfer(msg.sender, pending);
        }
        pool.lpToken.safeTransferFrom(
            address(msg.sender),
            address(this),
            _amount
        );
        user.amount = user.amount + _amount;
        user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
        emit Deposit(msg.sender, _amount);
    }

    // Withdraw LP tokens from MasterChef.
    function withdraw(uint256 _amount) public {
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool();
        uint256 pending =
            ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
        safeUGOVTransfer(msg.sender, pending);
        user.amount = user.amount - _amount;
        user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
        pool.lpToken.safeTransfer(address(msg.sender), _amount);
        emit Withdraw(msg.sender, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw() public {
        UserInfo storage user = userInfo[msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Safe uGOV transfer function, just in case if rounding error causes pool to not have enough uGOVs.
    function safeUGOVTransfer(address _to, uint256 _amount) internal {
        uint256 uGOVBal = uGOV.balanceOf(address(this));
        if (_amount > uGOVBal) {
            uGOV.transfer(_to, uGOVBal);
        } else {
            uGOV.transfer(_to, _amount);
        }
    }
}
