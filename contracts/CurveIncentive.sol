// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./UbiquityAlgorithmicDollarManager.sol";
import "./interfaces/IIncentive.sol";
import "./TWAPOracle.sol";
import "hardhat/console.sol";

/// @title Uniswap trading incentive contract
/// @author uAD Protocol
/// @dev incentives
contract CurveIncentive is IIncentive {
    UbiquityAlgorithmicDollarManager public manager;

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
        _updateOracle();

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

    /// @notice returns true if account is marked as exempt
    function isExemptAddress(address account) public view returns (bool) {
        return _exempt[account];
    }

    // solhint-disable-next-line no-unused-vars
    function _incentivizeBuy(address target, uint256 amountIn) internal {
        if (isExemptAddress(target)) {
            return;
        }

        /*  if (incentive != 0) {
            uad().mint(target, incentive);
        } */
    }

    // solhint-disable-next-line no-unused-vars
    function _incentivizeSell(address target, uint256 amount) internal {
        if (isExemptAddress(target)) {
            return;
        }

        /* uad().burnFrom(a
            ddress(pair), penalty); // burn from the recipient which is the pair */
    }

    function _updateOracle() internal {
        TWAPOracle oracle = TWAPOracle(manager.twapOracleAddress());
        oracle.update();
    }

    function _getTWAPPrice(address token) internal view returns (uint256) {
        TWAPOracle oracle = TWAPOracle(manager.twapOracleAddress());
        return oracle.consult(token);
    }
}
