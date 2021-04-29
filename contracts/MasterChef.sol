// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IERC20Ubiquity.sol";
import "./UbiquityAlgorithmicDollarManager.sol";

contract MasterChef {
    UbiquityAlgorithmicDollarManager public manager;
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
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
        IERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. uGOVs to distribute per block.
        uint256 lastRewardBlock; // Last block number that uGOVs distribution occurs.
        uint256 accuGOVPerShare; // Accumulated uGOVs per share, times 1e12. See below.
    }
    // The uGOV TOKEN!
    IERC20Ubiquity public uGOV;
    // Dev address.
    address public devaddr;
    // Block number when bonus uGOV period ends.
    uint256 public bonusEndBlock;
    // uGOV tokens created per block.
    uint256 public uGOVPerBlock;
    // Bonus muliplier for early uGOV makers.
    uint256 public constant BONUS_MULTIPLIER = 10;
    // Info of each pool.
    PoolInfo public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(address => UserInfo) public userInfo;
    // Total allocation poitns. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when uGOV mining starts.
    uint256 public startBlock;

    event Deposit(address indexed user, uint256 amount);

    event Withdraw(address indexed user, uint256 amount);

    event EmergencyWithdraw(address indexed user, uint256 amount);

    // ----------- Modifiers -----------
    modifier onlyMinter() {
        require(
            manager.hasRole(manager.UBQ_MINTER_ROLE(), msg.sender),
            "UBQ token: not minter"
        );
        _;
    }

    constructor(
        address _manager // ,
    ) // uint256 _uGOVPerBlock,
    // uint256 _startBlock,
    // uint256 _bonusEndBlock
    {
        manager = UbiquityAlgorithmicDollarManager(_manager);
        uGOV = IERC20Ubiquity(manager.uGOVTokenAddress());

        // uGOVPerBlock = _uGOVPerBlock;
        // bonusEndBlock = _bonusEndBlock;
        // startBlock = _startBlock;
    }

    // Update the given pool's uGOV allocation point. Can only be called by the owner.
    function set(uint256 _allocPoint, bool _withUpdate) public onlyMinter {
        if (_withUpdate) {
            updatePool();
        }
        totalAllocPoint = totalAllocPoint - poolInfo.allocPoint + _allocPoint;
        poolInfo.allocPoint = _allocPoint;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to)
        public
        view
        returns (uint256)
    {
        if (_to <= bonusEndBlock) {
            return (_to - _from) * BONUS_MULTIPLIER;
        } else if (_from >= bonusEndBlock) {
            return _to - _from;
        } else {
            return
                ((bonusEndBlock - _from) * BONUS_MULTIPLIER) +
                (_to - bonusEndBlock);
        }
    }

    // View function to see pending uGOVs on frontend.
    function pendinguGOV(address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo;
        UserInfo storage user = userInfo[_user];
        uint256 accuGOVPerShare = pool.accuGOVPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier =
                getMultiplier(pool.lastRewardBlock, block.number);
            uint256 uGOVReward =
                (multiplier * uGOVPerBlock) *
                    (pool.allocPoint / totalAllocPoint);
            accuGOVPerShare =
                (accuGOVPerShare + uGOVReward) *
                (1e12 / lpSupply);
        }
        return user.amount * (accuGOVPerShare / 1e12) - user.rewardDebt;
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool() public {
        PoolInfo storage pool = poolInfo;
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 uGOVReward =
            multiplier * uGOVPerBlock * (pool.allocPoint / totalAllocPoint);
        uGOV.mint(address(this), uGOVReward);
        pool.accuGOVPerShare =
            (pool.accuGOVPerShare + uGOVReward) *
            (1e12 / lpSupply);
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to MasterChef for uGOV allocation.
    function deposit(uint256 _amount) public {
        PoolInfo storage pool = poolInfo;
        UserInfo storage user = userInfo[msg.sender];
        updatePool();
        if (user.amount > 0) {
            uint256 pending =
                (user.amount * pool.accuGOVPerShare) / (1e12 - user.rewardDebt);
            safeuGOVTransfer(msg.sender, pending);
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
        PoolInfo storage pool = poolInfo;
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool();
        uint256 pending =
            ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
        safeuGOVTransfer(msg.sender, pending);
        user.amount = user.amount - _amount;
        user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
        pool.lpToken.safeTransfer(address(msg.sender), _amount);
        emit Withdraw(msg.sender, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw() public {
        PoolInfo storage pool = poolInfo;
        UserInfo storage user = userInfo[msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Safe uGOV transfer function, just in case if rounding error causes pool to not have enough uGOVs.
    function safeuGOVTransfer(address _to, uint256 _amount) internal {
        uint256 uGOVBal = uGOV.balanceOf(address(this));
        if (_amount > uGOVBal) {
            uGOV.transfer(_to, uGOVBal);
        } else {
            uGOV.transfer(_to, _amount);
        }
    }
}
