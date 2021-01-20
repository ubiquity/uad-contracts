// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

import "./IERC1620.sol";

/**
 * @title An extension to the ERC-1620 standard that allows updating streams
 * @dev Based on the first ERC-1620 draft:
    https://github.com/ethereum/EIPs/blob/13bec6b57ffb0efb83952a216916a59f97f020a2/EIPS/eip-1620.md
 */
interface IUpdatableStream is IERC1620 {
    /// @notice Emits when a stream is successfully updated.
    event UpdateStream(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        uint256 newDeposit,
        address tokenAddress,
        uint256 newStartTime,
        uint256 newStopTime
    );

    function updateStream(
        uint256 streamId,
        uint256 newDeposit,
        uint256 newStartTime,
        uint256 newStopTime
    ) external returns (bool);
}
