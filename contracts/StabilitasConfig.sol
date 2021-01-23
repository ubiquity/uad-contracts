// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title A central config for the stabilitas system. Also acts as a central
/// access control manager.
/// @notice For storing constants. For storing variables and allowing them to
/// be changed by the admin (governance)
/// @dev This should be used as a central access control manager which other
/// contracts use to check permissions
contract StabilitasConfig is AccessControl {
    bytes32 public constant COUPON_MANAGER_ROLE = keccak256("COUPON_MANAGER");
    bytes32 public constant BONDING_MANAGER_ROLE = keccak256("BONDING_MANAGER");

    address public twapOracleAddress;
    address public debtCouponAddress;
    address public stabilitasTokenAddress;
    address public comparisonTokenAddress; //USDC
    address public couponCalculatorAddress;
    address public dollarCalculatorAddress;
    address public sablier;

    //key = address of couponmanager, value = excessdollardistributor
    mapping(address => address) private _excessDollarDistributors;

    constructor(address _admin, address _sablier) {
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        _setupRole(BONDING_MANAGER_ROLE, _admin);
        sablier = _sablier;
    }

    function setTwapOracleAddress(address _twapOracleAddress) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        twapOracleAddress = _twapOracleAddress;
    }

    function setDebtCouponAddress(address _debtCouponAddress) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        debtCouponAddress = _debtCouponAddress;
    }

    function setStabilitasTokenAddress(address _stabilitasTokenAddress)
        external
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        stabilitasTokenAddress = _stabilitasTokenAddress;
    }

    function setComparisonTokenAddress(address _comparisonTokenAddress)
        external
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        comparisonTokenAddress = _comparisonTokenAddress;
    }

    function setCouponCalculatorAddress(address _couponCalculatorAddress)
        external
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        couponCalculatorAddress = _couponCalculatorAddress;
    }

    function setDollarCalculatorAddress(address _dollarCalculatorAddress)
        external
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        dollarCalculatorAddress = _dollarCalculatorAddress;
    }

    function setSablier(address _sablier) external {
        require(
            hasRole(BONDING_MANAGER_ROLE, msg.sender),
            "Caller is not a bonding manager"
        );
        sablier = _sablier;
    }

    function setExcessDollarsDistributor(
        address debtCouponManagerAddress,
        address excessCouponDistributor
    ) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        _excessDollarDistributors[
            debtCouponManagerAddress
        ] = excessCouponDistributor;
    }

    function getExcessDollarsDistributor(address debtCouponManagerAddress)
        external
        view
        returns (address)
    {
        return _excessDollarDistributors[debtCouponManagerAddress];
    }
}
