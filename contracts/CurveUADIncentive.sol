// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./UbiquityAlgorithmicDollarManager.sol";
import "./interfaces/IUbiquityGovernance.sol";
import "./interfaces/IIncentive.sol";
import "./TWAPOracle.sol";
import "./UbiquityAlgorithmicDollar.sol";
import "./libs/ABDKMathQuad.sol";
import "hardhat/console.sol";

/// @title Uniswap trading incentive contract
/// @author uAD Protocol
/// @dev incentives
contract CurveUADIncentive is IIncentive {
    using ABDKMathQuad for uint256;
    using ABDKMathQuad for bytes16;
    UbiquityAlgorithmicDollarManager public manager;
    bool isSellPenaltyOn = true;
    bool isBuyIncentiveOn = true;
    bytes16 immutable one = (uint256(1 ether)).fromUInt();
    mapping(address => bool) private _exempt;
    event ExemptAddressUpdate(address indexed _account, bool _isExempt);
    modifier onlyAdmin() {
        require(
            manager.hasRole(manager.INCENTIVE_MANAGER_ROLE(), msg.sender),
            "CurveIncentive: not admin"
        );
        _;
    }
    modifier onlyUAD() {
        require(
            msg.sender == manager.uADTokenAddress(),
            "CurveIncentive: Caller is not uAD"
        );
        _;
    }

    /// @notice CurveIncentive constructor
    /// @param _manager uAD Manager
    constructor(address _manager) {
        manager = UbiquityAlgorithmicDollarManager(_manager);
    }

    function incentivize(
        address sender,
        address receiver,
        address,
        uint256 amountIn
    ) external override onlyUAD {
        require(sender != receiver, "CurveIncentive: cannot send self");

        if (sender == manager.stableSwapMetaPoolAddress()) {
            console.log(
                "## BUY INCENTIVE: sender:%s receiver:%s metapool:%s",
                sender,
                receiver,
                manager.stableSwapMetaPoolAddress()
            );
            _incentivizeBuy(receiver, amountIn);
        }

        if (receiver == manager.stableSwapMetaPoolAddress()) {
            console.log(
                "## SELL INCENTIVE: sender:%s receiver:%s metapool:%s",
                sender,
                receiver,
                manager.stableSwapMetaPoolAddress()
            );
            _incentivizeSell(sender, amountIn);
        }
    }

    /// @notice set an address to be exempted from Uniswap trading incentives
    /// @param account the address to update
    /// @param isExempt a flag for whether to exempt or unexempt
    function setExemptAddress(address account, bool isExempt)
        external
        onlyAdmin
    {
        _exempt[account] = isExempt;
        emit ExemptAddressUpdate(account, isExempt);
    }

    /// @notice switch the sell penalty
    function switchSellPenalty() external onlyAdmin {
        isSellPenaltyOn = !isSellPenaltyOn;
    }

    /// @notice switch the buy incentive
    function switchBuyIncentive() external onlyAdmin {
        isBuyIncentiveOn = !isBuyIncentiveOn;
    }

    /// @notice returns true if account is marked as exempt
    function isExemptAddress(address account) public view returns (bool) {
        return _exempt[account];
    }

    function _incentivizeBuy(address target, uint256 amountIn) internal {
        _updateOracle();

        if (isExemptAddress(target) || !isBuyIncentiveOn) {
            return;
        }

        uint256 incentive = getPercentDeviationFromUnderPeg(amountIn);
        /* swapping 3CRV (or underlying) for uAD (aka buying uAD) will mint x% of UBQ.
             Where x = (1- TWAP_Price) *100.
            E.g. uAD = 0.8, you buy 1000 uAD, you get (1-0.8)*1000 = 200 UBQ */
        if (incentive != 0) {
            // this means CurveIncentive should be a minter of UGOV
            IUbiquityGovernance(manager.uGOVTokenAddress()).mint(
                target,
                incentive
            );
        }
    }

    /// @notice returns the percentage of deviation from the peg when uAD is <1$
    function getPercentDeviationFromUnderPeg(uint256 amount)
        internal
        returns (uint256)
    {
        _updateOracle();
        uint256 curPrice = _getTWAPPrice();
        console.log(
            "## getPercentDeviationFromUnderPeg: curPrice:%s amount:%s ",
            curPrice,
            amount
        );
        if (curPrice >= 1 ether) {
            return 0;
        }

        uint256 res =
            one
                .sub(curPrice.fromUInt())
                .mul((amount.fromUInt().div(one)))
                .toUInt();
        console.log("## getPercentDeviationFromUnderPeg: res:%s ", res);
        // returns (1- TWAP_Price) *100.
        return res;
    }

    function _incentivizeSell(address target, uint256 amount) internal {
        if (isExemptAddress(target) || !isSellPenaltyOn) {
            return;
        }
        // WARNING
        // Successful token transfers must move exactly the specified number of tokens between the sender and receiver.
        // Tokens that take a fee upon a successful transfer may cause the curve pool to break or act in unexpected ways.
        // fei does it differently because they can make sure only one contract has the ability to sell uAD

        // swapping uAD for 3CRV (or underlying) (aka selling uAD) will burn x% of uAD and you get nothing in return.
        // Where x = (1- TWAP_Price) *100.

        uint256 penalty = getPercentDeviationFromUnderPeg(amount);
        console.log("## _incentivizeSell: penalty:%s ", penalty);
        if (penalty != 0) {
            require(penalty < amount, "uAD: Burn exceeds trade size");
            UbiquityAlgorithmicDollar(manager.uADTokenAddress()).burnFrom(
                manager.stableSwapMetaPoolAddress(),
                penalty
            ); // burn from the recipient which is the pair
        }
    }

    function _updateOracle() internal {
        TWAPOracle oracle = TWAPOracle(manager.twapOracleAddress());
        oracle.update();
    }

    function _getTWAPPrice() internal view returns (uint256) {
        TWAPOracle oracle = TWAPOracle(manager.twapOracleAddress());
        return oracle.consult(manager.uADTokenAddress());
    }
}
