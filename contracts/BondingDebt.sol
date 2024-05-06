// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "./interfaces/IERC20Ubiquity.sol";

// Allows to claim UBQ missing compensation till 6th May 2024 for Bond holders affected with wrong staking multiplier
// Full explanation https://github.com/ubiquity/ubiquity-dollar/issues/752#issuecomment-2095837822

contract BondingDebt {
    mapping(address user => bool isClaimed) public isUserClaimed;

    function claim() public {
        require(!isUserClaimed[msg.sender], "Already claimed");

        address governanceToken = 0x4e38D89362f7e5db0096CE44ebD021c3962aA9a0;
        address treasuryAddress = 0xefC0e701A824943b469a694aC564Aa1efF7Ab7dd;

        // Bond 1
        if (msg.sender == address(0x89eae71B865A2A39cBa62060aB1b40bbFFaE5b0D)) {
            IERC20Ubiquity(governanceToken).mint(msg.sender, 35704952407232639376);
            IERC20Ubiquity(governanceToken).mint(treasuryAddress, 7140990481446527875);
        }

        // Bond 2
        if (msg.sender == address(0x4007CE2083c7F3E18097aeB3A39bb8eC149a341d)) {
            IERC20Ubiquity(governanceToken).mint(msg.sender, 2630501621780289065714618);
            IERC20Ubiquity(governanceToken).mint(treasuryAddress, 526100324356057813142923);
        }

        // Bond 3
        if (msg.sender == address(0x7c76f4DB70b7E2177de10DE3e2f668daDcd11108)) {
            IERC20Ubiquity(governanceToken).mint(msg.sender, 1577484595484460523315806);
            IERC20Ubiquity(governanceToken).mint(treasuryAddress, 315496919096892104663161);
        }

        // Bond 5
        if (msg.sender == address(0xa53A6fE2d8Ad977aD926C485343Ba39f32D3A3F6)) {
            IERC20Ubiquity(governanceToken).mint(msg.sender, 329713782662103366904643);
            IERC20Ubiquity(governanceToken).mint(treasuryAddress, 65942756532420673380928);
        }

        // Bond 6
        if (msg.sender == address(0xCEFD0E73cC48B0b9d4C8683E52B7d7396600AbB2)) {
            IERC20Ubiquity(governanceToken).mint(msg.sender, 317041833739125580390236);
            IERC20Ubiquity(governanceToken).mint(treasuryAddress, 63408366747825116078047);
        }

        isUserClaimed[msg.sender] = true;
    }
}
