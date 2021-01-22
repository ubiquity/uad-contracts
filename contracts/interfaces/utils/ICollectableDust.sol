// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.0;

interface ICollectableDust {
    event DustSent(address _to, address token, uint256 amount);

    function sendDust(
        address _to,
        address _token,
        uint256 _amount
    ) external;
}
