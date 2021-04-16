// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "./interfaces/IUbiquityAlgorithmicDollar.sol";
import "./interfaces/IIncentive.sol";
import "./UbiquityAlgorithmicDollarManager.sol";

contract UbiquityAlgorithmicDollar is
    IUbiquityAlgorithmicDollar,
    ERC20Burnable,
    ERC20Pausable
{
    UbiquityAlgorithmicDollarManager public manager;
    /// @notice get associated incentive contract, 0 address if N/A
    mapping(address => address) public override incentiveContract;

    // solhint-disable-next-line var-name-mixedcase
    bytes32 public DOMAIN_SEPARATOR;
    // keccak256("Permit(address owner,address spender,
    //                   uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 public constant PERMIT_TYPEHASH =
        0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;
    mapping(address => uint256) public nonces;

    // ----------- Modifiers -----------
    modifier onlyMinter() {
        require(
            manager.hasRole(manager.UAD_MINTER_ROLE(), msg.sender),
            "uAD: not minter"
        );
        _;
    }

    modifier onlyBurner() {
        require(
            manager.hasRole(manager.UAD_BURNER_ROLE(), msg.sender),
            "uAD: not burner"
        );
        _;
    }

    modifier onlyPauser() {
        require(
            manager.hasRole(manager.PAUSER_ROLE(), msg.sender),
            "uAD: not pauser"
        );
        _;
    }

    constructor(address _manager) ERC20("UbiquityAlgorithmicDollar", "uAD") {
        manager = UbiquityAlgorithmicDollarManager(_manager);
        // sender must be UbiquityAlgorithmicDollarManager roleAdmin
        // because he will get the admin, minter and pauser role on uAD and we want to
        // manage all permissions through the manager
        require(
            manager.hasRole(manager.DEFAULT_ADMIN_ROLE(), msg.sender),
            "UAD: deployer must be manager admin"
        );
        uint256 chainId;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            chainId := chainid()
        }

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    // solhint-disable-next-line max-line-length
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes(name())),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );
    }

    /// @param account the account to incentivize
    /// @param incentive the associated incentive contract
    function setIncentiveContract(address account, address incentive)
        external
        override
    {
        require(
            manager.hasRole(manager.UAD_TOKEN_MANAGER_ROLE(), msg.sender),
            "uAD: must have admin role"
        );

        incentiveContract[account] = incentive;
        emit IncentiveContractUpdate(account, incentive);
    }

    /// @notice permit spending of uAD. owner has signed a message allowing
    ///         spender to transfer up to amount uAD
    /// @param owner the uAD holder
    /// @param spender the approved operator
    /// @param value the amount approved
    /// @param deadline the deadline after which the approval is no longer valid
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override {
        // solhint-disable-next-line not-rely-on-time
        require(deadline >= block.timestamp, "uAD: EXPIRED");
        bytes32 digest =
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    DOMAIN_SEPARATOR,
                    keccak256(
                        abi.encode(
                            PERMIT_TYPEHASH,
                            owner,
                            spender,
                            value,
                            nonces[owner]++,
                            deadline
                        )
                    )
                )
            );
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(
            recoveredAddress != address(0) && recoveredAddress == owner,
            "uAD: INVALID_SIGNATURE"
        );
        _approve(owner, spender, value);
    }

    /// @notice burn UAD tokens from caller
    /// @param amount the amount to burn
    function burn(uint256 amount)
        public
        override(IUbiquityAlgorithmicDollar, ERC20Burnable)
        whenNotPaused
    {
        super.burn(amount);
        emit Burning(msg.sender, msg.sender, amount);
    }

    /// @notice burn uAD tokens from specified account
    /// @param account the account to burn from
    /// @param amount the amount to burn
    function burnFrom(address account, uint256 amount)
        public
        override(IUbiquityAlgorithmicDollar, ERC20Burnable)
        onlyBurner
        whenNotPaused
    {
        _burn(account, amount);
        emit Burning(account, msg.sender, amount);
    }

    /**
     * @dev Creates `amount` new tokens for `to`.
     *
     * See {ERC20-_mint}.
     *
     * Requirements:
     *
     * - the caller must have the `MINTER_ROLE`.
     */
    function mint(address to, uint256 amount)
        public
        override
        onlyMinter
        whenNotPaused
    {
        _mint(to, amount);
    }

    /**
     * @dev Pauses all token transfers.
     *
     * See {ERC20Pausable} and {Pausable-_pause}.
     *
     * Requirements:
     *
     * - the caller must have the `PAUSER_ROLE`.
     */
    function pause() public onlyPauser {
        _pause();
    }

    /**
     * @dev Unpauses all token transfers.
     *
     * See {ERC20Pausable} and {Pausable-_unpause}.
     *
     * Requirements:
     *
     * - the caller must have the `PAUSER_ROLE`.
     */
    function unpause() public onlyPauser {
        _unpause();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, ERC20Pausable) {
        super._beforeTokenTransfer(from, to, amount);
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal override whenNotPaused {
        super._transfer(sender, recipient, amount);
        _checkAndApplyIncentives(sender, recipient, amount);
    }

    function _checkAndApplyIncentives(
        address sender,
        address recipient,
        uint256 amount
    ) internal {
        // incentive on sender
        address senderIncentive = incentiveContract[sender];
        if (senderIncentive != address(0)) {
            IIncentive(senderIncentive).incentivize(
                sender,
                recipient,
                msg.sender,
                amount
            );
        }

        // incentive on recipient
        address recipientIncentive = incentiveContract[recipient];
        if (recipientIncentive != address(0)) {
            IIncentive(recipientIncentive).incentivize(
                sender,
                recipient,
                msg.sender,
                amount
            );
        }

        // incentive on operator
        address operatorIncentive = incentiveContract[msg.sender];
        if (
            msg.sender != sender &&
            msg.sender != recipient &&
            operatorIncentive != address(0)
        ) {
            IIncentive(operatorIncentive).incentivize(
                sender,
                recipient,
                msg.sender,
                amount
            );
        }

        // all incentive, if active applies to every transfer
        address allIncentive = incentiveContract[address(0)];
        if (allIncentive != address(0)) {
            IIncentive(allIncentive).incentivize(
                sender,
                recipient,
                msg.sender,
                amount
            );
        }
    }
}
