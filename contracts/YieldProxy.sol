// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.3;
import "./utils/CollectableDust.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./UbiquityAlgorithmicDollarManager.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IJar.sol";
import "./interfaces/IERC20Ubiquity.sol";
import "hardhat/console.sol";

contract YieldProxy is ReentrancyGuard, CollectableDust, Pausable {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Ubiquity;
    IERC20 public token;
    IJar public jar;
    uint256 public constant bonusYieldMax = 10000; // 1000 = 10% 100 = 1% 10 = 0.1% 1 = 0.01%
    uint256 public bonusYield; //  5000 = 50% 100 = 1% 10 = 0.1% 1 = 0.01%
    uint256 public constant feesMax = 100000; // 1000 = 1% 100 = 0.1% 10 = 0.01% 1 = 0.001%
    uint256 public constant UBQRateMax = 10000e18; // 100000e18 Amount of UBQ to be stake to reduce the deposit fees by 100%

    uint256 public fees; // 10000  = 10%, 1000 = 1% 100 = 0.1% 10= 0.01% 1=0.001%
    /*     uint256 public constant UADPercentMax = 10000;
    uint256 public UADPercent; // 50% means that you can deposit uAD up to 50% of the deposited token */
    uint256 public UBQRate; // 10e18, if the UBQRate is 10 then 10/10000 = 0.001  1UBQ gives you 0.001% of fee reduction so 100000 UBQ gives you 100%

    uint256 public UBQMaxAmount; // UBA amount to stake to have 100%

    // struct to store deposit details
    struct UserInfo {
        uint256 amount; // token amount deposited by the user
        uint256 shares; // pickle jar shares
        uint256 uadAmount; // amount of uAD staked
        uint256 ubqAmount; // amount of UBQ staked
        uint256 fee; // deposit fee or deposit fee + former yield in case of a second deposit
        uint256 ratio; // used to calculate yield
        uint256 bonusYield; // used to calculate bonusYield on yield in uAR
    }
    mapping(address => UserInfo) private _balances;
    UbiquityAlgorithmicDollarManager public manager;

    event Deposit(
        address indexed _user,
        uint256 _amount,
        uint256 _shares,
        uint256 _fee,
        uint256 _ratio,
        uint256 _uadAmount,
        uint256 _ubqAmount,
        uint256 _bonusYield
    );

    event WithdrawAll(
        address indexed _user,
        uint256 _amount,
        uint256 _shares,
        uint256 _fee,
        uint256 _ratio,
        uint256 _uadAmount,
        uint256 _ubqAmount,
        uint256 _bonusYield,
        uint256 _uARYield
    );

    modifier onlyAdmin() {
        require(
            manager.hasRole(manager.DEFAULT_ADMIN_ROLE(), msg.sender),
            "YieldProxy::!admin"
        );
        _;
    }

    constructor(
        address _manager,
        address _jar,
        uint256 _fees,
        uint256 _UBQRate,
        uint256 _bonusYield
    ) CollectableDust() Pausable() {
        console.log("## Constructor:%s", _manager);
        manager = UbiquityAlgorithmicDollarManager(_manager);
        fees = _fees; //  10000  = 10%
        jar = IJar(_jar);
        token = IERC20(jar.token());
        UBQRate = _UBQRate;
        bonusYield = _bonusYield;
        console.log("## UBQRateMax:%s UBQRate:%s", UBQRateMax, UBQRate);
        UBQMaxAmount = (100e18 * UBQRateMax) / UBQRate;
        console.log("## UBQMaxAmount:%s  ", UBQMaxAmount);
    }

    /// @dev deposit tokens needed by the pickle jar to receive an extra yield in form of ubiquity debts
    /// @param _amount of token required by the pickle jar
    /// @param _ubqAmount amount of UBQ token that will be stake to decrease your deposit fee
    /// @param _uadAmount amount of uAD token that will be stake to increase your bonusYield
    /// @notice weeks act as a multiplier for the amount of bonding shares to be received
    function deposit(
        uint256 _amount,
        uint256 _ubqAmount,
        uint256 _uadAmount
    ) external nonReentrant returns (bool) {
        require(_amount > 0, "YieldProxy::amount==0");
        UserInfo storage dep = _balances[msg.sender];
        require(dep.amount == 0, "YieldProxy::DepoExist");
        uint256 curFee = 0;

        // calculate fee based on ubqAmount if it is not the max
        if (_ubqAmount < UBQMaxAmount) {
            // calculate discount
            uint256 discountPercentage = (UBQRate * _ubqAmount) / UBQRateMax; // we need to divide by 100e18 to get the percentage
            // calculate regular fee
            curFee = ((_amount * fees) / feesMax);
            // calculate the discount for this fee
            uint256 discount = (curFee * discountPercentage) / 100e18;
            // remaining fee
            curFee = curFee - discount;
        }
        // if we don't provide enough UAD the bonusYield will be lowered
        uint256 calculatedBonusYield = bonusYieldMax;
        if (_uadAmount < _amount / 2) {
            // calculate the percentage of extra yield you are entitled to
            uint256 percentage = ((_uadAmount + _amount) * 100e18) / _amount; // 133e18
            // increase the bonus yield with that percentage
            calculatedBonusYield = (bonusYield * percentage) / 100e18;
            // should not be possible to have a higher yield than the max yield
            assert(calculatedBonusYield <= bonusYieldMax);
        }
        /*   if (dep.amount > 0) {
            //calculer le yield et l'ajouter au nouveau fee
            // amountToDeposit.mul(ratio4).div(ratio1);
            currentYield = (_amount * currentRatio) / dep.ratio;
        } */

        dep.fee = curFee;
        dep.amount = _amount;
        dep.ratio = jar.getRatio();
        dep.uadAmount = _uadAmount;
        dep.ubqAmount = _ubqAmount;
        dep.bonusYield = calculatedBonusYield;

        // transfer all the tokens from the user
        token.safeTransferFrom(msg.sender, address(this), _amount);
        // invest in the pickle jar
        uint256 curBalance = jar.balanceOf(address(this));
        jar.deposit(_amount);
        dep.shares = jar.balanceOf(address(this)) - curBalance;

        if (_uadAmount > 0) {
            IERC20(manager.dollarTokenAddress()).safeTransferFrom(
                msg.sender,
                address(this),
                _uadAmount
            );
        }
        if (_ubqAmount > 0) {
            IERC20(manager.governanceTokenAddress()).safeTransferFrom(
                msg.sender,
                address(this),
                _ubqAmount
            );
        }
        emit Deposit(
            msg.sender,
            dep.amount,
            dep.shares,
            dep.fee,
            dep.ratio,
            dep.uadAmount,
            dep.ubqAmount,
            dep.bonusYield
        );
        return true;
        // emit event
    }

    /*    function depositWithPermit(
        uint256 _amount,
        uint256 _deadline,
        bool _approveMax,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external returns (bool) {
        require(_amount > 0, "YieldProxy::amount==0");
        UserInfo storage dep = _balances[msg.sender];
        if (dep.amount > 0) {
            //calculer le yield et l'ajouter au nouveau fee
        }
        dep.fee = _amount / fees;
        dep.amount = _amount - dep.fee;
        dep.ratio = jar.getRatio();
        uint256 value = _approveMax ? uint256(-1) : _amount;
        token.permit(msg.sender, address(this), value, _deadline, _v, _r, _s);
        token.safeTransferFrom(msg.sender, address(this), _amount);
        emit Deposit(msg.sender, dep.amount, dep.fee, dep.ratio);
        return true;
    } */

    function withdrawAll() external nonReentrant returns (bool) {
        UserInfo storage dep = _balances[msg.sender];
        require(dep.amount > 0, "YieldProxy::amount==0");

        uint256 currentRatio = jar.getRatio();

        // calculate the yield
        uint256 currentYield = (dep.amount * currentRatio) / dep.ratio;
        // calculate the yield in uAR by multiplying by the calculated bonus yield and adding the fee
        uint256 uARYield = (((
            currentYield > dep.amount ? currentYield - dep.amount : 0
        ) * dep.bonusYield) / bonusYieldMax) + dep.fee;
        // we only give back the amount deposited minus the deposit fee
        // indeed the deposit fee will be converted to uAR yield
        uint256 amountToTransferBack = dep.amount - dep.fee;
        dep.fee = 0;
        dep.amount = 0;

        dep.ratio = 0;

        // retrieve the amount from the jar
        jar.withdraw(dep.shares);
        dep.shares = 0;
        // we send back the deposited UAD
        if (dep.uadAmount > 0) {
            IERC20(manager.dollarTokenAddress()).transfer(
                msg.sender,
                dep.uadAmount
            );
        }
        dep.uadAmount = 0;
        // we send back the deposited UBQ
        if (dep.ubqAmount > 0) {
            IERC20(manager.governanceTokenAddress()).transfer(
                msg.sender,
                dep.ubqAmount
            );
        }
        dep.ubqAmount = 0;
        // we wend back the deposited amount - deposit fee
        token.transfer(msg.sender, amountToTransferBack);

        // send the rest to the treasury
        token.transfer(
            manager.treasuryAddress(),
            token.balanceOf(address(this))
        );

        // we send the yield as UAR
        IERC20Ubiquity autoRedeemToken = IERC20Ubiquity(
            manager.autoRedeemTokenAddress()
        );
        autoRedeemToken.mint(address(this), uARYield);
        autoRedeemToken.transfer(msg.sender, uARYield);

        // emit event
        emit WithdrawAll(
            msg.sender,
            dep.amount,
            dep.shares,
            dep.fee,
            dep.ratio,
            dep.uadAmount,
            dep.ubqAmount,
            dep.bonusYield,
            uARYield
        );
        return true;
    }

    /// Collectable Dust
    function addProtocolToken(address _token) external override onlyAdmin {
        _addProtocolToken(_token);
    }

    function removeProtocolToken(address _token) external override onlyAdmin {
        _removeProtocolToken(_token);
    }

    function sendDust(
        address _to,
        address _token,
        uint256 _amount
    ) external override onlyAdmin {
        _sendDust(_to, _token, _amount);
    }

    function setDepositFees(uint256 _fees) external onlyAdmin {
        require(_fees != fees, "YieldProxy::===fees");
        fees = _fees;
    }

    function setUBQRate(uint256 _UBQRate) external onlyAdmin {
        require(_UBQRate != UBQRate, "YieldProxy::===UBQRate");
        require(_UBQRate <= UBQRateMax, "YieldProxy::>UBQRateMAX");
        UBQRate = _UBQRate;
        UBQMaxAmount = 100 * (UBQRateMax / UBQRate) * 1e18; // equivalent to 100 / (UBQRate/ UBQRateMax)
    }

    /*     function setMaxUAD(uint256 _maxUADPercent) external onlyAdmin {
        require(_maxUADPercent != UADPercent, "YieldProxy::===maxUAD");
        require(_maxUADPercent <= UADPercentMax, "YieldProxy::>UADPercentMax");
        UADPercent = _maxUADPercent;
    } */

    function setJar(address _jar) external onlyAdmin {
        require(_jar != address(0), "YieldProxy::!Jar");
        jar = IJar(_jar);
        token = IERC20(jar.token());
    }
}
