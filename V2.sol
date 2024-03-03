commit 0ddbdceafe857923c570459b793df8f9d5052af7
Author: zapaz.eth <alain@kredeum.com>
Date:   Mon Aug 9 17:24:31 2021 +0200

    MasterChefV2 is ReentrancyGuard

diff --git a/contracts/MasterChefV2.sol b/contracts/MasterChefV2.sol
index b65a7ba..19d76b1 100644
--- a/contracts/MasterChefV2.sol
+++ b/contracts/MasterChefV2.sol
@@ -2,6 +2,7 @@
 pragma solidity 0.8.3;
 
 import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
+import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
 import "./interfaces/IERC20Ubiquity.sol";
 import "./UbiquityAlgorithmicDollarManager.sol";
 import "./interfaces/ITWAPOracle.sol";
@@ -10,7 +11,7 @@ import "./interfaces/IUbiquityFormulas.sol";
 
 import "./interfaces/IERC1155Ubiquity.sol";
 
-contract MasterChefV2 {
+contract MasterChefV2 is ReentrancyGuard {
     using SafeERC20 for IERC20Ubiquity;
     using SafeERC20 for IERC20;
 
@@ -138,7 +139,7 @@ contract MasterChefV2 {
         address to,
         uint256 _amount,
         uint256 _bondingShareID
-    ) external onlyBondingContract {
+    ) external nonReentrant onlyBondingContract {
         _deposit(to, _amount, _bondingShareID);
     }
 
@@ -147,7 +148,7 @@ contract MasterChefV2 {
         address to,
         uint256 _amount,
         uint256 _bondingShareID
-    ) external onlyBondingContract {
+    ) external nonReentrant onlyBondingContract {
         BondingShareInfo storage bs = _bsInfo[_bondingShareID];
         require(bs.amount >= _amount, "MC: amount too high");
         _updatePool();

commit 21323f6e3051cd2c2f6a5d0c410abd281cbdfab4
Author: zapaz.eth <alain@kredeum.com>
Date:   Mon Aug 9 13:00:46 2021 +0200

    add 2 events to MasterChefV2

diff --git a/contracts/MasterChefV2.sol b/contracts/MasterChefV2.sol
index b5da56b..b65a7ba 100644
--- a/contracts/MasterChefV2.sol
+++ b/contracts/MasterChefV2.sol
@@ -42,11 +42,11 @@ contract MasterChefV2 {
     UbiquityAlgorithmicDollarManager public manager;
 
     // uGOV tokens created per block.
-    uint256 public uGOVPerBlock = 1e18;
+    uint256 public uGOVPerBlock;
     // Bonus muliplier for early uGOV makers.
     uint256 public uGOVmultiplier = 1e18;
-    uint256 public minPriceDiffToUpdateMultiplier = 1000000000000000;
-    uint256 public lastPrice = 1 ether;
+    uint256 public minPriceDiffToUpdateMultiplier = 1e15;
+    uint256 public lastPrice = 1e18;
     uint256 public uGOVDivider;
     // Info of each pool.
     PoolInfo public pool;
@@ -65,6 +65,12 @@ contract MasterChefV2 {
         uint256 indexed bondingShareId
     );
 
+    event UGOVPerBlockModified(uint256 indexed uGOVPerBlock);
+
+    event MinPriceDiffToUpdateMultiplierModified(
+        uint256 indexed minPriceDiffToUpdateMultiplier
+    );
+
     // ----------- Modifiers -----------
     modifier onlyTokenManager() {
         require(
@@ -107,6 +113,7 @@ contract MasterChefV2 {
 
     function setUGOVPerBlock(uint256 _uGOVPerBlock) external onlyTokenManager {
         uGOVPerBlock = _uGOVPerBlock;
+        emit UGOVPerBlockModified(_uGOVPerBlock);
     }
 
     // the bigger uGOVDivider is the less extra Ugov will be minted for the treasury
@@ -121,6 +128,9 @@ contract MasterChefV2 {
         uint256 _minPriceDiffToUpdateMultiplier
     ) external onlyTokenManager {
         minPriceDiffToUpdateMultiplier = _minPriceDiffToUpdateMultiplier;
+        emit MinPriceDiffToUpdateMultiplierModified(
+            _minPriceDiffToUpdateMultiplier
+        );
     }
 
     // Deposit LP tokens to MasterChef for uGOV allocation.

commit 00c0abf7e8918e0c13bd02bb24a1eded60b65015
Author: zapaz.eth <alain@kredeum.com>
Date:   Fri Aug 6 12:32:07 2021 +0200

    add inital deposits on MasterChefV2.1 constructor

diff --git a/contracts/MasterChefV2.sol b/contracts/MasterChefV2.sol
index 3a648e6..b5da56b 100644
--- a/contracts/MasterChefV2.sol
+++ b/contracts/MasterChefV2.sol
@@ -81,12 +81,28 @@ contract MasterChefV2 {
         _;
     }
 
-    constructor(address _manager) {
+    constructor(
+        address _manager,
+        address[] memory _tos,
+        uint256[] memory _amounts,
+        uint256[] memory _bondingShareIDs
+    ) {
         manager = UbiquityAlgorithmicDollarManager(_manager);
         pool.lastRewardBlock = block.number;
         pool.accuGOVPerShare = 0; // uint256(1e12);
         uGOVDivider = 5; // 100 / 5 = 20% extra minted ugov for treasury
         _updateUGOVMultiplier();
+
+        uint256 lgt = _tos.length;
+        require(lgt == _amounts.length, "_amounts array not same length");
+        require(
+            lgt == _bondingShareIDs.length,
+            "_bondingShareIDs array not same length"
+        );
+
+        for (uint256 i = 0; i < lgt; ++i) {
+            _deposit(_tos[i], _amounts[i], _bondingShareIDs[i]);
+        }
     }
 
     function setUGOVPerBlock(uint256 _uGOVPerBlock) external onlyTokenManager {
@@ -113,17 +129,7 @@ contract MasterChefV2 {
         uint256 _amount,
         uint256 _bondingShareID
     ) external onlyBondingContract {
-        BondingShareInfo storage bs = _bsInfo[_bondingShareID];
-        _updatePool();
-        if (bs.amount > 0) {
-            uint256 pending = ((bs.amount * pool.accuGOVPerShare) / 1e12) -
-                bs.rewardDebt;
-            _safeUGOVTransfer(to, pending);
-        }
-        bs.amount += _amount;
-        bs.rewardDebt = (bs.amount * pool.accuGOVPerShare) / 1e12;
-        _totalShares += _amount;
-        emit Deposit(to, _amount, _bondingShareID);
+        _deposit(to, _amount, _bondingShareID);
     }
 
     // Withdraw LP tokens from MasterChef.
@@ -205,6 +211,25 @@ contract MasterChefV2 {
         return _totalShares;
     }
 
+    // _Deposit LP tokens to MasterChef for uGOV allocation.
+    function _deposit(
+        address to,
+        uint256 _amount,
+        uint256 _bondingShareID
+    ) internal {
+        BondingShareInfo storage bs = _bsInfo[_bondingShareID];
+        _updatePool();
+        if (bs.amount > 0) {
+            uint256 pending = ((bs.amount * pool.accuGOVPerShare) / 1e12) -
+                bs.rewardDebt;
+            _safeUGOVTransfer(to, pending);
+        }
+        bs.amount += _amount;
+        bs.rewardDebt = (bs.amount * pool.accuGOVPerShare) / 1e12;
+        _totalShares += _amount;
+        emit Deposit(to, _amount, _bondingShareID);
+    }
+
     // UPDATE uGOV multiplier
     function _updateUGOVMultiplier() internal {
         // (1.05/(1+abs(1-TWAP_PRICE)))

commit c4a85e22b5bae0c4d8bd0def8f423d4aa4653a2b
Author: zapaz.eth <alain@kredeum.com>
Date:   Thu Aug 5 22:41:52 2021 +0200

    full migration simulation on mainnet fork

diff --git a/contracts/MasterChefV2.sol b/contracts/MasterChefV2.sol
index dd6fc82..3a648e6 100644
--- a/contracts/MasterChefV2.sol
+++ b/contracts/MasterChefV2.sol
@@ -9,7 +9,6 @@ import "./BondingShareV2.sol";
 import "./interfaces/IUbiquityFormulas.sol";
 
 import "./interfaces/IERC1155Ubiquity.sol";
-import "hardhat/console.sol";
 
 contract MasterChefV2 {
     using SafeERC20 for IERC20Ubiquity;
@@ -178,41 +177,13 @@ contract MasterChefV2 {
         BondingShareInfo storage user = _bsInfo[bondingShareID];
         uint256 accuGOVPerShare = pool.accuGOVPerShare;
 
-        console.log(
-            "## _totalShares:%s block.number:%s pool.lastRewardBlock:%s",
-            _totalShares,
-            block.number,
-            pool.lastRewardBlock
-        );
-
         if (block.number > pool.lastRewardBlock && _totalShares != 0) {
             uint256 multiplier = _getMultiplier();
-            console.log(
-                "## multiplier:%s uGOVPerBlock:%s _totalShares:%s",
-                multiplier,
-                uGOVPerBlock,
-                _totalShares
-            );
             uint256 uGOVReward = (multiplier * uGOVPerBlock) / 1e18;
-            console.log(
-                "## uGOVReward:%s accuGOVPerShare:%s",
-                uGOVReward,
-                accuGOVPerShare
-            );
             accuGOVPerShare =
                 accuGOVPerShare +
                 ((uGOVReward * 1e12) / _totalShares);
-            console.log("## accuGOVPerShare:%s", accuGOVPerShare);
         }
-        console.log(
-            "## user.amount:%s user.rewardDebt:%s",
-            user.amount,
-            user.rewardDebt
-        );
-        console.log(
-            "## return value:%s",
-            (user.amount * accuGOVPerShare) / 1e12 - user.rewardDebt
-        );
         return (user.amount * accuGOVPerShare) / 1e12 - user.rewardDebt;
     }
 
@@ -297,19 +268,6 @@ contract MasterChefV2 {
     }
 
     function _getMultiplier() internal view returns (uint256) {
-        console.log(
-            "## block.number:%s pool.lastRewardBlock:%s uGOVmultiplier:%s",
-            block.number,
-            pool.lastRewardBlock,
-            uGOVmultiplier
-        );
-        uint256 subs = block.number - pool.lastRewardBlock;
-        uint256 muls = subs * uGOVmultiplier;
-        console.log("## subs:%s muls:%s", subs, muls);
-        console.log(
-            "## return multiplier:%s",
-            (block.number - pool.lastRewardBlock) * uGOVmultiplier
-        );
         return (block.number - pool.lastRewardBlock) * uGOVmultiplier;
     }
 

commit 91b60f27dc6e09555dfc4769a1b5b90a1668eb71
Author: zapaz.eth <alain@kredeum.com>
Date:   Thu Aug 5 17:01:24 2021 +0200

    merge tests with fix

diff --git a/contracts/MasterChefV2.sol b/contracts/MasterChefV2.sol
index 64cf068..dd6fc82 100644
--- a/contracts/MasterChefV2.sol
+++ b/contracts/MasterChefV2.sol
@@ -178,6 +178,13 @@ contract MasterChefV2 {
         BondingShareInfo storage user = _bsInfo[bondingShareID];
         uint256 accuGOVPerShare = pool.accuGOVPerShare;
 
+        console.log(
+            "## _totalShares:%s block.number:%s pool.lastRewardBlock:%s",
+            _totalShares,
+            block.number,
+            pool.lastRewardBlock
+        );
+
         if (block.number > pool.lastRewardBlock && _totalShares != 0) {
             uint256 multiplier = _getMultiplier();
             console.log(

commit e0bfdeb285ce5d998cfef99e01187331977a7404
Author: Benjamin <benjamin.mateo@protonmail.com>
Date:   Wed Aug 4 19:07:22 2021 +0200

    fix(masterchef) ubq rewards

diff --git a/contracts/MasterChefV2.sol b/contracts/MasterChefV2.sol
index d389726..64cf068 100644
--- a/contracts/MasterChefV2.sol
+++ b/contracts/MasterChefV2.sol
@@ -9,6 +9,7 @@ import "./BondingShareV2.sol";
 import "./interfaces/IUbiquityFormulas.sol";
 
 import "./interfaces/IERC1155Ubiquity.sol";
+import "hardhat/console.sol";
 
 contract MasterChefV2 {
     using SafeERC20 for IERC20Ubiquity;
@@ -176,18 +177,35 @@ contract MasterChefV2 {
     {
         BondingShareInfo storage user = _bsInfo[bondingShareID];
         uint256 accuGOVPerShare = pool.accuGOVPerShare;
-        uint256 lpSupply = IERC1155Ubiquity(manager.bondingShareAddress())
-            .totalSupply();
 
-        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
+        if (block.number > pool.lastRewardBlock && _totalShares != 0) {
             uint256 multiplier = _getMultiplier();
-
+            console.log(
+                "## multiplier:%s uGOVPerBlock:%s _totalShares:%s",
+                multiplier,
+                uGOVPerBlock,
+                _totalShares
+            );
             uint256 uGOVReward = (multiplier * uGOVPerBlock) / 1e18;
+            console.log(
+                "## uGOVReward:%s accuGOVPerShare:%s",
+                uGOVReward,
+                accuGOVPerShare
+            );
             accuGOVPerShare =
                 accuGOVPerShare +
-                ((uGOVReward * 1e12) / lpSupply);
+                ((uGOVReward * 1e12) / _totalShares);
+            console.log("## accuGOVPerShare:%s", accuGOVPerShare);
         }
-
+        console.log(
+            "## user.amount:%s user.rewardDebt:%s",
+            user.amount,
+            user.rewardDebt
+        );
+        console.log(
+            "## return value:%s",
+            (user.amount * accuGOVPerShare) / 1e12 - user.rewardDebt
+        );
         return (user.amount * accuGOVPerShare) / 1e12 - user.rewardDebt;
     }
 
@@ -237,9 +255,8 @@ contract MasterChefV2 {
             return;
         }
         _updateUGOVMultiplier();
-        uint256 lpSupply = IERC1155Ubiquity(manager.bondingShareAddress())
-            .totalSupply();
-        if (lpSupply == 0) {
+
+        if (_totalShares == 0) {
             pool.lastRewardBlock = block.number;
             return;
         }
@@ -256,7 +273,7 @@ contract MasterChefV2 {
         );
         pool.accuGOVPerShare =
             pool.accuGOVPerShare +
-            ((uGOVReward * 1e12) / lpSupply);
+            ((uGOVReward * 1e12) / _totalShares);
         pool.lastRewardBlock = block.number;
     }
 
@@ -273,6 +290,19 @@ contract MasterChefV2 {
     }
 
     function _getMultiplier() internal view returns (uint256) {
+        console.log(
+            "## block.number:%s pool.lastRewardBlock:%s uGOVmultiplier:%s",
+            block.number,
+            pool.lastRewardBlock,
+            uGOVmultiplier
+        );
+        uint256 subs = block.number - pool.lastRewardBlock;
+        uint256 muls = subs * uGOVmultiplier;
+        console.log("## subs:%s muls:%s", subs, muls);
+        console.log(
+            "## return multiplier:%s",
+            (block.number - pool.lastRewardBlock) * uGOVmultiplier
+        );
         return (block.number - pool.lastRewardBlock) * uGOVmultiplier;
     }
 

commit 7acbbac20207debe835469ca89ca9006ddf3fde2
Author: zapaz.eth <alain@kredeum.com>
Date:   Wed Aug 4 15:12:28 2021 +0200

    successfull test of one migrate with new MasterChefV2 deployed on a recent mainnet fork

diff --git a/contracts/MasterChefV2.sol b/contracts/MasterChefV2.sol
index 975fcac..05da912 100644
--- a/contracts/MasterChefV2.sol
+++ b/contracts/MasterChefV2.sol
@@ -183,9 +183,7 @@ contract MasterChefV2 {
             uint256 multiplier = _getMultiplier();
 
             uint256 uGOVReward = (multiplier * uGOVPerBlock) / 1e18;
-            accuGOVPerShare =
-                accuGOVPerShare +
-                ((uGOVReward) / (lpSupply * 1e6));
+            accuGOVPerShare = accuGOVPerShare + uGOVReward / (lpSupply * 1e6);
         }
 
         return (user.amount * accuGOVPerShare) / 1e12 - user.rewardDebt;
@@ -254,10 +252,7 @@ contract MasterChefV2 {
             manager.treasuryAddress(),
             uGOVReward / uGOVDivider
         );
-        pool.accuGOVPerShare =
-            pool.accuGOVPerShare +
-            ((uGOVReward) / (lpSupply * 1e6));
-
+        pool.accuGOVPerShare = pool.accuGOVPerShare + uGOVReward / (lpSupply * 1e6);
         pool.lastRewardBlock = block.number;
     }
 

commit 06216c4fac5ada97b0322ceb5964e85cb6370f47
Author: zapaz.eth <alain@kredeum.com>
Date:   Tue Aug 3 18:18:46 2021 +0200

    fix

diff --git a/contracts/MasterChefV2.sol b/contracts/MasterChefV2.sol
index d389726..975fcac 100644
--- a/contracts/MasterChefV2.sol
+++ b/contracts/MasterChefV2.sol
@@ -185,7 +185,7 @@ contract MasterChefV2 {
             uint256 uGOVReward = (multiplier * uGOVPerBlock) / 1e18;
             accuGOVPerShare =
                 accuGOVPerShare +
-                ((uGOVReward * 1e12) / lpSupply);
+                ((uGOVReward) / (lpSupply * 1e6));
         }
 
         return (user.amount * accuGOVPerShare) / 1e12 - user.rewardDebt;
@@ -256,7 +256,8 @@ contract MasterChefV2 {
         );
         pool.accuGOVPerShare =
             pool.accuGOVPerShare +
-            ((uGOVReward * 1e12) / lpSupply);
+            ((uGOVReward) / (lpSupply * 1e6));
+
         pool.lastRewardBlock = block.number;
     }
 

commit 754e74cb1ab23bf9885091160826cef6c55a9ca4
Author: Benjamin <benjamin.mateo@protonmail.com>
Date:   Thu Jul 22 16:30:26 2021 +0200

    feat(incentives) adapt masterchef original

diff --git a/contracts/MasterChefV2.sol b/contracts/MasterChefV2.sol
index c1461e8..d389726 100644
--- a/contracts/MasterChefV2.sol
+++ b/contracts/MasterChefV2.sol
@@ -47,6 +47,7 @@ contract MasterChefV2 {
     uint256 public uGOVmultiplier = 1e18;
     uint256 public minPriceDiffToUpdateMultiplier = 1000000000000000;
     uint256 public lastPrice = 1 ether;
+    uint256 public uGOVDivider;
     // Info of each pool.
     PoolInfo public pool;
     // Info of each user that stakes LP tokens.
@@ -84,6 +85,7 @@ contract MasterChefV2 {
         manager = UbiquityAlgorithmicDollarManager(_manager);
         pool.lastRewardBlock = block.number;
         pool.accuGOVPerShare = 0; // uint256(1e12);
+        uGOVDivider = 5; // 100 / 5 = 20% extra minted ugov for treasury
         _updateUGOVMultiplier();
     }
 
@@ -91,6 +93,14 @@ contract MasterChefV2 {
         uGOVPerBlock = _uGOVPerBlock;
     }
 
+    // the bigger uGOVDivider is the less extra Ugov will be minted for the treasury
+    function setUGOVShareForTreasury(uint256 _uGOVDivider)
+        external
+        onlyTokenManager
+    {
+        uGOVDivider = _uGOVDivider;
+    }
+
     function setMinPriceDiffToUpdateMultiplier(
         uint256 _minPriceDiffToUpdateMultiplier
     ) external onlyTokenManager {
@@ -239,10 +249,10 @@ contract MasterChefV2 {
             address(this),
             uGOVReward
         );
-        // mint another 20% for the treasury
+        // mint another x% for the treasury
         IERC20Ubiquity(manager.governanceTokenAddress()).mint(
             manager.treasuryAddress(),
-            uGOVReward / 5
+            uGOVReward / uGOVDivider
         );
         pool.accuGOVPerShare =
             pool.accuGOVPerShare +

commit 552695c33894275c430d9e5faee0a619b5359b25
Author: Benjamin <benjamin.mateo@protonmail.com>
Date:   Tue Jul 20 16:18:39 2021 +0200

    chore(deploy) update deps and deploy scripts

diff --git a/contracts/MasterChefV2.sol b/contracts/MasterChefV2.sol
index 141a23c..c1461e8 100644
--- a/contracts/MasterChefV2.sol
+++ b/contracts/MasterChefV2.sol
@@ -106,8 +106,8 @@ contract MasterChefV2 {
         BondingShareInfo storage bs = _bsInfo[_bondingShareID];
         _updatePool();
         if (bs.amount > 0) {
-            uint256 pending =
-                ((bs.amount * pool.accuGOVPerShare) / 1e12) - bs.rewardDebt;
+            uint256 pending = ((bs.amount * pool.accuGOVPerShare) / 1e12) -
+                bs.rewardDebt;
             _safeUGOVTransfer(to, pending);
         }
         bs.amount += _amount;
@@ -125,8 +125,8 @@ contract MasterChefV2 {
         BondingShareInfo storage bs = _bsInfo[_bondingShareID];
         require(bs.amount >= _amount, "MC: amount too high");
         _updatePool();
-        uint256 pending =
-            ((bs.amount * pool.accuGOVPerShare) / 1e12) - bs.rewardDebt;
+        uint256 pending = ((bs.amount * pool.accuGOVPerShare) / 1e12) -
+            bs.rewardDebt;
         // send UGOV to Bonding Share holder
 
         _safeUGOVTransfer(to, pending);
@@ -151,8 +151,8 @@ contract MasterChefV2 {
         // calculate user reward
         BondingShareInfo storage user = _bsInfo[bondingShareID];
         _updatePool();
-        uint256 pending =
-            ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
+        uint256 pending = ((user.amount * pool.accuGOVPerShare) / 1e12) -
+            user.rewardDebt;
         _safeUGOVTransfer(msg.sender, pending);
         user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
         return pending;
@@ -166,8 +166,8 @@ contract MasterChefV2 {
     {
         BondingShareInfo storage user = _bsInfo[bondingShareID];
         uint256 accuGOVPerShare = pool.accuGOVPerShare;
-        uint256 lpSupply =
-            IERC1155Ubiquity(manager.bondingShareAddress()).totalSupply();
+        uint256 lpSupply = IERC1155Ubiquity(manager.bondingShareAddress())
+            .totalSupply();
 
         if (block.number > pool.lastRewardBlock && lpSupply != 0) {
             uint256 multiplier = _getMultiplier();
@@ -227,8 +227,8 @@ contract MasterChefV2 {
             return;
         }
         _updateUGOVMultiplier();
-        uint256 lpSupply =
-            IERC1155Ubiquity(manager.bondingShareAddress()).totalSupply();
+        uint256 lpSupply = IERC1155Ubiquity(manager.bondingShareAddress())
+            .totalSupply();
         if (lpSupply == 0) {
             pool.lastRewardBlock = block.number;
             return;

commit 6acf9c18cd57f8897687e4b666a2b53c3f24c049
Author: Benjamin <benjamin.mateo@protonmail.com>
Date:   Thu Jul 15 12:46:26 2021 +0200

    feat(v2) crv reset

diff --git a/contracts/MasterChefV2.sol b/contracts/MasterChefV2.sol
index 11b543f..141a23c 100644
--- a/contracts/MasterChefV2.sol
+++ b/contracts/MasterChefV2.sol
@@ -110,7 +110,7 @@ contract MasterChefV2 {
                 ((bs.amount * pool.accuGOVPerShare) / 1e12) - bs.rewardDebt;
             _safeUGOVTransfer(to, pending);
         }
-        bs.amount = bs.amount + _amount;
+        bs.amount += _amount;
         bs.rewardDebt = (bs.amount * pool.accuGOVPerShare) / 1e12;
         _totalShares += _amount;
         emit Deposit(to, _amount, _bondingShareID);
@@ -130,7 +130,7 @@ contract MasterChefV2 {
         // send UGOV to Bonding Share holder
 
         _safeUGOVTransfer(to, pending);
-        bs.amount = bs.amount - _amount;
+        bs.amount -= _amount;
         bs.rewardDebt = (bs.amount * pool.accuGOVPerShare) / 1e12;
         _totalShares -= _amount;
         emit Withdraw(to, _amount, _bondingShareID);

commit 6e4c4cde35bb0e6fffc94076cae5de5e009de5e1
Author: Benjamin <benjamin.mateo@protonmail.com>
Date:   Mon Jul 5 18:05:08 2021 +0200

    feat(v2) fix lint

diff --git a/contracts/MasterChefV2.sol b/contracts/MasterChefV2.sol
index fb0a516..11b543f 100644
--- a/contracts/MasterChefV2.sol
+++ b/contracts/MasterChefV2.sol
@@ -14,8 +14,6 @@ contract MasterChefV2 {
     using SafeERC20 for IERC20Ubiquity;
     using SafeERC20 for IERC20;
 
-    uint256 private _totalShares;
-
     // Info of each user.
     struct BondingShareInfo {
         uint256 amount; // bonding rights.
@@ -38,6 +36,8 @@ contract MasterChefV2 {
         uint256 accuGOVPerShare; // Accumulated uGOVs per share, times 1e12. See below.
     }
 
+    uint256 private _totalShares;
+
     // Ubiquity Manager
     UbiquityAlgorithmicDollarManager public manager;
 
@@ -106,8 +106,8 @@ contract MasterChefV2 {
         BondingShareInfo storage bs = _bsInfo[_bondingShareID];
         _updatePool();
         if (bs.amount > 0) {
-            uint256 pending = ((bs.amount * pool.accuGOVPerShare) / 1e12) -
-                bs.rewardDebt;
+            uint256 pending =
+                ((bs.amount * pool.accuGOVPerShare) / 1e12) - bs.rewardDebt;
             _safeUGOVTransfer(to, pending);
         }
         bs.amount = bs.amount + _amount;
@@ -125,8 +125,8 @@ contract MasterChefV2 {
         BondingShareInfo storage bs = _bsInfo[_bondingShareID];
         require(bs.amount >= _amount, "MC: amount too high");
         _updatePool();
-        uint256 pending = ((bs.amount * pool.accuGOVPerShare) / 1e12) -
-            bs.rewardDebt;
+        uint256 pending =
+            ((bs.amount * pool.accuGOVPerShare) / 1e12) - bs.rewardDebt;
         // send UGOV to Bonding Share holder
 
         _safeUGOVTransfer(to, pending);
@@ -151,8 +151,8 @@ contract MasterChefV2 {
         // calculate user reward
         BondingShareInfo storage user = _bsInfo[bondingShareID];
         _updatePool();
-        uint256 pending = ((user.amount * pool.accuGOVPerShare) / 1e12) -
-            user.rewardDebt;
+        uint256 pending =
+            ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
         _safeUGOVTransfer(msg.sender, pending);
         user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
         return pending;
@@ -166,8 +166,8 @@ contract MasterChefV2 {
     {
         BondingShareInfo storage user = _bsInfo[bondingShareID];
         uint256 accuGOVPerShare = pool.accuGOVPerShare;
-        uint256 lpSupply = IERC1155Ubiquity(manager.bondingShareAddress())
-        .totalSupply();
+        uint256 lpSupply =
+            IERC1155Ubiquity(manager.bondingShareAddress()).totalSupply();
 
         if (block.number > pool.lastRewardBlock && lpSupply != 0) {
             uint256 multiplier = _getMultiplier();
@@ -216,7 +216,7 @@ contract MasterChefV2 {
 
         if (isPriceDiffEnough) {
             uGOVmultiplier = IUbiquityFormulas(manager.formulasAddress())
-            .ugovMultiply(uGOVmultiplier, currentPrice);
+                .ugovMultiply(uGOVmultiplier, currentPrice);
             lastPrice = currentPrice;
         }
     }
@@ -227,8 +227,8 @@ contract MasterChefV2 {
             return;
         }
         _updateUGOVMultiplier();
-        uint256 lpSupply = IERC1155Ubiquity(manager.bondingShareAddress())
-        .totalSupply();
+        uint256 lpSupply =
+            IERC1155Ubiquity(manager.bondingShareAddress()).totalSupply();
         if (lpSupply == 0) {
             pool.lastRewardBlock = block.number;
             return;

commit 901d435436e9192a85edec89ec7c628980091793
Author: Benjamin <benjamin.mateo@protonmail.com>
Date:   Mon Jul 5 16:26:14 2021 +0200

    feat(v2) bonding v2 and updates

diff --git a/contracts/MasterChefV2.sol b/contracts/MasterChefV2.sol
index e91d09a..fb0a516 100644
--- a/contracts/MasterChefV2.sol
+++ b/contracts/MasterChefV2.sol
@@ -8,13 +8,17 @@ import "./interfaces/ITWAPOracle.sol";
 import "./BondingShareV2.sol";
 import "./interfaces/IUbiquityFormulas.sol";
 
+import "./interfaces/IERC1155Ubiquity.sol";
+
 contract MasterChefV2 {
     using SafeERC20 for IERC20Ubiquity;
     using SafeERC20 for IERC20;
+
+    uint256 private _totalShares;
+
     // Info of each user.
-    struct UserInfo {
-        bytes32 userID: // keccak256 of BS ID + UBQRights
-        uint256 amount; // How many uAD-3CRV LP tokens the user has provided.
+    struct BondingShareInfo {
+        uint256 amount; // bonding rights.
         uint256 rewardDebt; // Reward debt. See explanation below.
         //
         // We do some fancy math here. Basically, any point in time, the amount of uGOVs
@@ -46,11 +50,19 @@ contract MasterChefV2 {
     // Info of each pool.
     PoolInfo public pool;
     // Info of each user that stakes LP tokens.
-    mapping(address => UserInfo) public userInfo;
+    mapping(uint256 => BondingShareInfo) private _bsInfo;
 
-    event Deposit(address indexed user, uint256 amount);
+    event Deposit(
+        address indexed user,
+        uint256 amount,
+        uint256 indexed bondingShareId
+    );
 
-    event Withdraw(address indexed user, uint256 amount);
+    event Withdraw(
+        address indexed user,
+        uint256 amount,
+        uint256 indexed bondingShareId
+    );
 
     // ----------- Modifiers -----------
     modifier onlyTokenManager() {
@@ -86,46 +98,58 @@ contract MasterChefV2 {
     }
 
     // Deposit LP tokens to MasterChef for uGOV allocation.
-    function deposit(uint256 _amount, address sender)
-        external
-        onlyBondingContract
-    {
-        UserInfo storage user = userInfo[sender];
+    function deposit(
+        address to,
+        uint256 _amount,
+        uint256 _bondingShareID
+    ) external onlyBondingContract {
+        BondingShareInfo storage bs = _bsInfo[_bondingShareID];
         _updatePool();
-        if (user.amount > 0) {
-            uint256 pending = ((user.amount * pool.accuGOVPerShare) / 1e12) -
-                user.rewardDebt;
-            _safeUGOVTransfer(sender, pending);
+        if (bs.amount > 0) {
+            uint256 pending = ((bs.amount * pool.accuGOVPerShare) / 1e12) -
+                bs.rewardDebt;
+            _safeUGOVTransfer(to, pending);
         }
-        user.amount = user.amount + _amount;
-        user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
-        emit Deposit(sender, _amount);
+        bs.amount = bs.amount + _amount;
+        bs.rewardDebt = (bs.amount * pool.accuGOVPerShare) / 1e12;
+        _totalShares += _amount;
+        emit Deposit(to, _amount, _bondingShareID);
     }
 
     // Withdraw LP tokens from MasterChef.
-    function withdraw(uint256 _amount, address sender)
-        external
-        onlyBondingContract
-    {
-        UserInfo storage user = userInfo[sender];
-        require(user.amount >= _amount, "MC: amount too high");
+    function withdraw(
+        address to,
+        uint256 _amount,
+        uint256 _bondingShareID
+    ) external onlyBondingContract {
+        BondingShareInfo storage bs = _bsInfo[_bondingShareID];
+        require(bs.amount >= _amount, "MC: amount too high");
         _updatePool();
-        uint256 pending = ((user.amount * pool.accuGOVPerShare) / 1e12) -
-            user.rewardDebt;
-        _safeUGOVTransfer(sender, pending);
-        user.amount = user.amount - _amount;
-        user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
-        emit Withdraw(sender, _amount);
+        uint256 pending = ((bs.amount * pool.accuGOVPerShare) / 1e12) -
+            bs.rewardDebt;
+        // send UGOV to Bonding Share holder
+
+        _safeUGOVTransfer(to, pending);
+        bs.amount = bs.amount - _amount;
+        bs.rewardDebt = (bs.amount * pool.accuGOVPerShare) / 1e12;
+        _totalShares -= _amount;
+        emit Withdraw(to, _amount, _bondingShareID);
     }
 
     /// @dev get pending uGOV rewards from MasterChef.
     /// @return amount of pending rewards transfered to msg.sender
     /// @notice only send pending rewards
     function getRewards(uint256 bondingShareID) external returns (uint256) {
-        // calculate user ID
-        uint256 balance = BondingShareV2(manager.bondingShareAddress()).balanceOf(msg.sender, bondingShareID)
-uint256 rights = BondingShareV2(manager.bondingShareAddress()).balanceOf(msg.sender, bondingShareID)
-        UserInfo storage user = userInfo[msg.sender];
+        require(
+            IERC1155Ubiquity(manager.bondingShareAddress()).balanceOf(
+                msg.sender,
+                bondingShareID
+            ) == 1,
+            "MS: caller is not owner"
+        );
+
+        // calculate user reward
+        BondingShareInfo storage user = _bsInfo[bondingShareID];
         _updatePool();
         uint256 pending = ((user.amount * pool.accuGOVPerShare) / 1e12) -
             user.rewardDebt;
@@ -135,8 +159,12 @@ uint256 rights = BondingShareV2(manager.bondingShareAddress()).balanceOf(msg.sen
     }
 
     // View function to see pending uGOVs on frontend.
-    function pendingUGOV(address _user) external view returns (uint256) {
-        UserInfo storage user = userInfo[_user];
+    function pendingUGOV(uint256 bondingShareID)
+        external
+        view
+        returns (uint256)
+    {
+        BondingShareInfo storage user = _bsInfo[bondingShareID];
         uint256 accuGOVPerShare = pool.accuGOVPerShare;
         uint256 lpSupply = IERC1155Ubiquity(manager.bondingShareAddress())
         .totalSupply();
@@ -153,6 +181,24 @@ uint256 rights = BondingShareV2(manager.bondingShareAddress()).balanceOf(msg.sen
         return (user.amount * accuGOVPerShare) / 1e12 - user.rewardDebt;
     }
 
+    /**
+     * @dev get the amount of shares and the reward debt of a bonding share .
+     */
+    function getBondingShareInfo(uint256 _id)
+        external
+        view
+        returns (uint256[2] memory)
+    {
+        return [_bsInfo[_id].amount, _bsInfo[_id].rewardDebt];
+    }
+
+    /**
+     * @dev Total amount of shares .
+     */
+    function totalShares() external view virtual returns (uint256) {
+        return _totalShares;
+    }
+
     // UPDATE uGOV multiplier
     function _updateUGOVMultiplier() internal {
         // (1.05/(1+abs(1-TWAP_PRICE)))

commit 9553d36cbe9c7f00f5e80bfedb5ff705bb3e7196
Author: Benjamin <benjamin.mateo@protonmail.com>
Date:   Sun Jun 27 10:16:52 2021 +0200

    feat(v2) add v2

diff --git a/contracts/MasterChef.sol b/contracts/MasterChefV2.sol
similarity index 87%
copy from contracts/MasterChef.sol
copy to contracts/MasterChefV2.sol
index ae3a5de..e91d09a 100644
--- a/contracts/MasterChef.sol
+++ b/contracts/MasterChefV2.sol
@@ -5,14 +5,15 @@ import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
 import "./interfaces/IERC20Ubiquity.sol";
 import "./UbiquityAlgorithmicDollarManager.sol";
 import "./interfaces/ITWAPOracle.sol";
-import "./interfaces/IERC1155Ubiquity.sol";
+import "./BondingShareV2.sol";
 import "./interfaces/IUbiquityFormulas.sol";
 
-contract MasterChef {
+contract MasterChefV2 {
     using SafeERC20 for IERC20Ubiquity;
     using SafeERC20 for IERC20;
     // Info of each user.
     struct UserInfo {
+        bytes32 userID: // keccak256 of BS ID + UBQRights
         uint256 amount; // How many uAD-3CRV LP tokens the user has provided.
         uint256 rewardDebt; // Reward debt. See explanation below.
         //
@@ -92,15 +93,10 @@ contract MasterChef {
         UserInfo storage user = userInfo[sender];
         _updatePool();
         if (user.amount > 0) {
-            uint256 pending =
-                ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
+            uint256 pending = ((user.amount * pool.accuGOVPerShare) / 1e12) -
+                user.rewardDebt;
             _safeUGOVTransfer(sender, pending);
         }
-        /*  pool.lpToken.safeTransferFrom(
-            address(msg.sender),
-            address(this),
-            _amount
-        ); */
         user.amount = user.amount + _amount;
         user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
         emit Deposit(sender, _amount);
@@ -114,23 +110,25 @@ contract MasterChef {
         UserInfo storage user = userInfo[sender];
         require(user.amount >= _amount, "MC: amount too high");
         _updatePool();
-        uint256 pending =
-            ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
+        uint256 pending = ((user.amount * pool.accuGOVPerShare) / 1e12) -
+            user.rewardDebt;
         _safeUGOVTransfer(sender, pending);
         user.amount = user.amount - _amount;
         user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
-        /*  pool.lpToken.safeTransfer(msg.sender, _amount); */
         emit Withdraw(sender, _amount);
     }
 
     /// @dev get pending uGOV rewards from MasterChef.
     /// @return amount of pending rewards transfered to msg.sender
     /// @notice only send pending rewards
-    function getRewards() external returns (uint256) {
+    function getRewards(uint256 bondingShareID) external returns (uint256) {
+        // calculate user ID
+        uint256 balance = BondingShareV2(manager.bondingShareAddress()).balanceOf(msg.sender, bondingShareID)
+uint256 rights = BondingShareV2(manager.bondingShareAddress()).balanceOf(msg.sender, bondingShareID)
         UserInfo storage user = userInfo[msg.sender];
         _updatePool();
-        uint256 pending =
-            ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
+        uint256 pending = ((user.amount * pool.accuGOVPerShare) / 1e12) -
+            user.rewardDebt;
         _safeUGOVTransfer(msg.sender, pending);
         user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
         return pending;
@@ -140,8 +138,8 @@ contract MasterChef {
     function pendingUGOV(address _user) external view returns (uint256) {
         UserInfo storage user = userInfo[_user];
         uint256 accuGOVPerShare = pool.accuGOVPerShare;
-        uint256 lpSupply =
-            IERC1155Ubiquity(manager.bondingShareAddress()).totalSupply();
+        uint256 lpSupply = IERC1155Ubiquity(manager.bondingShareAddress())
+        .totalSupply();
 
         if (block.number > pool.lastRewardBlock && lpSupply != 0) {
             uint256 multiplier = _getMultiplier();
@@ -172,7 +170,7 @@ contract MasterChef {
 
         if (isPriceDiffEnough) {
             uGOVmultiplier = IUbiquityFormulas(manager.formulasAddress())
-                .ugovMultiply(uGOVmultiplier, currentPrice);
+            .ugovMultiply(uGOVmultiplier, currentPrice);
             lastPrice = currentPrice;
         }
     }
@@ -183,12 +181,8 @@ contract MasterChef {
             return;
         }
         _updateUGOVMultiplier();
-        uint256 lpSupply =
-            IERC1155Ubiquity(manager.bondingShareAddress()).totalSupply();
-        /*  IERC20(manager.stableSwapMetaPoolAddress()).balanceOf(
-                manager.bondingContractAddress()
-            ); */
-
+        uint256 lpSupply = IERC1155Ubiquity(manager.bondingShareAddress())
+        .totalSupply();
         if (lpSupply == 0) {
             pool.lastRewardBlock = block.number;
             return;

commit d59a14bd2ecab4b3d2e98eea5f36be00ab843716
Author: アレクサンダー U B I Q U I T Y <gpg@pavlovcik.com>
Date:   Fri Jun 4 15:03:01 2021 -0400

    because travis made me rush this commit

diff --git a/contracts/MasterChef.sol b/contracts/MasterChef.sol
index 3c02c17..ae3a5de 100644
--- a/contracts/MasterChef.sol
+++ b/contracts/MasterChef.sol
@@ -195,12 +195,12 @@ contract MasterChef {
         }
         uint256 multiplier = _getMultiplier();
         uint256 uGOVReward = (multiplier * uGOVPerBlock) / 1e18;
-        IERC20Ubiquity(manager.uGOVTokenAddress()).mint(
+        IERC20Ubiquity(manager.governanceTokenAddress()).mint(
             address(this),
             uGOVReward
         );
         // mint another 20% for the treasury
-        IERC20Ubiquity(manager.uGOVTokenAddress()).mint(
+        IERC20Ubiquity(manager.governanceTokenAddress()).mint(
             manager.treasuryAddress(),
             uGOVReward / 5
         );
@@ -213,7 +213,7 @@ contract MasterChef {
     // Safe uGOV transfer function, just in case if rounding
     // error causes pool to not have enough uGOVs.
     function _safeUGOVTransfer(address _to, uint256 _amount) internal {
-        IERC20Ubiquity uGOV = IERC20Ubiquity(manager.uGOVTokenAddress());
+        IERC20Ubiquity uGOV = IERC20Ubiquity(manager.governanceTokenAddress());
         uint256 uGOVBal = uGOV.balanceOf(address(this));
         if (_amount > uGOVBal) {
             uGOV.safeTransfer(_to, uGOVBal);
@@ -229,7 +229,7 @@ contract MasterChef {
     function _getTwapPrice() internal view returns (uint256) {
         return
             ITWAPOracle(manager.twapOracleAddress()).consult(
-                manager.uADTokenAddress()
+                manager.dollarTokenAddress()
             );
     }
 }

commit d824b69a7eafc6530b28029f6a6be5a9468146d0
Author: Benjamin <benjamin.mateo@protonmail.com>
Date:   Wed May 19 12:21:09 2021 +0200

    feat(ugov): mint 20% for treasury

diff --git a/contracts/MasterChef.sol b/contracts/MasterChef.sol
index df91f0a..3c02c17 100644
--- a/contracts/MasterChef.sol
+++ b/contracts/MasterChef.sol
@@ -199,6 +199,11 @@ contract MasterChef {
             address(this),
             uGOVReward
         );
+        // mint another 20% for the treasury
+        IERC20Ubiquity(manager.uGOVTokenAddress()).mint(
+            manager.treasuryAddress(),
+            uGOVReward / 5
+        );
         pool.accuGOVPerShare =
             pool.accuGOVPerShare +
             ((uGOVReward * 1e12) / lpSupply);

commit a4f3a291ac26f9c4104398ac2ff33139c7c1c6a1
Author: Benjamin <benjamin.mateo@protonmail.com>
Date:   Fri May 7 16:18:30 2021 +0200

    feat(ugov): add ugov incetive for bonding participants

diff --git a/contracts/MasterChef.sol b/contracts/MasterChef.sol
index f3a0069..df91f0a 100644
--- a/contracts/MasterChef.sol
+++ b/contracts/MasterChef.sol
@@ -84,38 +84,73 @@ contract MasterChef {
         minPriceDiffToUpdateMultiplier = _minPriceDiffToUpdateMultiplier;
     }
 
+    // Deposit LP tokens to MasterChef for uGOV allocation.
+    function deposit(uint256 _amount, address sender)
+        external
+        onlyBondingContract
+    {
+        UserInfo storage user = userInfo[sender];
+        _updatePool();
+        if (user.amount > 0) {
+            uint256 pending =
+                ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
+            _safeUGOVTransfer(sender, pending);
+        }
+        /*  pool.lpToken.safeTransferFrom(
+            address(msg.sender),
+            address(this),
+            _amount
+        ); */
+        user.amount = user.amount + _amount;
+        user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
+        emit Deposit(sender, _amount);
+    }
+
+    // Withdraw LP tokens from MasterChef.
+    function withdraw(uint256 _amount, address sender)
+        external
+        onlyBondingContract
+    {
+        UserInfo storage user = userInfo[sender];
+        require(user.amount >= _amount, "MC: amount too high");
+        _updatePool();
+        uint256 pending =
+            ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
+        _safeUGOVTransfer(sender, pending);
+        user.amount = user.amount - _amount;
+        user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
+        /*  pool.lpToken.safeTransfer(msg.sender, _amount); */
+        emit Withdraw(sender, _amount);
+    }
+
+    /// @dev get pending uGOV rewards from MasterChef.
+    /// @return amount of pending rewards transfered to msg.sender
+    /// @notice only send pending rewards
+    function getRewards() external returns (uint256) {
+        UserInfo storage user = userInfo[msg.sender];
+        _updatePool();
+        uint256 pending =
+            ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
+        _safeUGOVTransfer(msg.sender, pending);
+        user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
+        return pending;
+    }
+
     // View function to see pending uGOVs on frontend.
     function pendingUGOV(address _user) external view returns (uint256) {
         UserInfo storage user = userInfo[_user];
         uint256 accuGOVPerShare = pool.accuGOVPerShare;
         uint256 lpSupply =
             IERC1155Ubiquity(manager.bondingShareAddress()).totalSupply();
-        /*   IERC20(manager.stableSwapMetaPoolAddress()).balanceOf(
-                manager.bondingContractAddress()
-            ); */
-
-        // console.log("accuGOVPerShare", accuGOVPerShare);
-        // console.log("lpSupply", lpSupply);
 
         if (block.number > pool.lastRewardBlock && lpSupply != 0) {
             uint256 multiplier = _getMultiplier();
 
             uint256 uGOVReward = (multiplier * uGOVPerBlock) / 1e18;
-            console.log(
-                "## PENDING NEW MULTIPLIER multiplier:%s uGOVReward:%s",
-                multiplier,
-                uGOVReward
-            );
             accuGOVPerShare =
                 accuGOVPerShare +
                 ((uGOVReward * 1e12) / lpSupply);
-
-            // console.log("multiplier", multiplier);
-            // console.log("uGOVReward", uGOVReward);
         }
-        // console.log("user.amount", user.amount);
-        // console.log("user.rewardDebt", user.rewardDebt);
-        // console.log("accuGOVPerShare", accuGOVPerShare);
 
         return (user.amount * accuGOVPerShare) / 1e12 - user.rewardDebt;
     }
@@ -139,10 +174,6 @@ contract MasterChef {
             uGOVmultiplier = IUbiquityFormulas(manager.formulasAddress())
                 .ugovMultiply(uGOVmultiplier, currentPrice);
             lastPrice = currentPrice;
-            console.log(
-                "## MULTIPLIER UPDATED  uGOVmultiplier:%s",
-                uGOVmultiplier
-            );
         }
     }
 
@@ -164,11 +195,6 @@ contract MasterChef {
         }
         uint256 multiplier = _getMultiplier();
         uint256 uGOVReward = (multiplier * uGOVPerBlock) / 1e18;
-        console.log(
-            "## _updatePool  WE ARE MINTING uGOVReward:%s  uGOVPerBlock:%s",
-            uGOVReward,
-            uGOVPerBlock
-        );
         IERC20Ubiquity(manager.uGOVTokenAddress()).mint(
             address(this),
             uGOVReward
@@ -179,64 +205,19 @@ contract MasterChef {
         pool.lastRewardBlock = block.number;
     }
 
-    // Deposit LP tokens to MasterChef for uGOV allocation.
-    function deposit(uint256 _amount, address sender)
-        external
-        onlyBondingContract
-    {
-        UserInfo storage user = userInfo[sender];
-        _updatePool();
-        if (user.amount > 0) {
-            uint256 pending =
-                ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
-            _safeUGOVTransfer(sender, pending);
+    // Safe uGOV transfer function, just in case if rounding
+    // error causes pool to not have enough uGOVs.
+    function _safeUGOVTransfer(address _to, uint256 _amount) internal {
+        IERC20Ubiquity uGOV = IERC20Ubiquity(manager.uGOVTokenAddress());
+        uint256 uGOVBal = uGOV.balanceOf(address(this));
+        if (_amount > uGOVBal) {
+            uGOV.safeTransfer(_to, uGOVBal);
+        } else {
+            uGOV.safeTransfer(_to, _amount);
         }
-        /*  pool.lpToken.safeTransferFrom(
-            address(msg.sender),
-            address(this),
-            _amount
-        ); */
-        user.amount = user.amount + _amount;
-        user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
-        emit Deposit(sender, _amount);
-    }
-
-    // Withdraw LP tokens from MasterChef.
-    function withdraw(uint256 _amount, address sender)
-        external
-        onlyBondingContract
-    {
-        UserInfo storage user = userInfo[sender];
-        require(user.amount >= _amount, "MC: amount too high");
-        _updatePool();
-        uint256 pending =
-            ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
-        _safeUGOVTransfer(sender, pending);
-        user.amount = user.amount - _amount;
-        user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
-        /*  pool.lpToken.safeTransfer(msg.sender, _amount); */
-        emit Withdraw(sender, _amount);
-    }
-
-    /// @dev get pending uGOV rewards from MasterChef.
-    /// @return amount of pending rewards transfered to msg.sender
-    /// @notice only send pending rewards
-    function getRewards() external returns (uint256) {
-        UserInfo storage user = userInfo[msg.sender];
-        _updatePool();
-        uint256 pending =
-            ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
-        _safeUGOVTransfer(msg.sender, pending);
-        user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
-        return pending;
     }
 
     function _getMultiplier() internal view returns (uint256) {
-        console.log(
-            "## _getMultiplier  numberOfBlockB:%s  uGOVmultiplier:%s",
-            block.number - pool.lastRewardBlock,
-            uGOVmultiplier
-        );
         return (block.number - pool.lastRewardBlock) * uGOVmultiplier;
     }
 
@@ -246,24 +227,4 @@ contract MasterChef {
                 manager.uADTokenAddress()
             );
     }
-
-    // Safe uGOV transfer function, just in case if rounding
-    // error causes pool to not have enough uGOVs.
-    function _safeUGOVTransfer(address _to, uint256 _amount) internal {
-        IERC20Ubiquity uGOV = IERC20Ubiquity(manager.uGOVTokenAddress());
-        uint256 uGOVBal = uGOV.balanceOf(address(this));
-
-        console.log(
-            "## _safeUGOVTransfer uGOVBal:%s  _amount:%s uGOVmultiplier:%s ",
-            uGOVBal,
-            _amount,
-            uGOVmultiplier
-        );
-        if (_amount > uGOVBal) {
-            uGOV.safeTransfer(_to, uGOVBal);
-        } else {
-            console.log("## ON TRASNFERE AMOUNT");
-            uGOV.safeTransfer(_to, _amount);
-        }
-    }
 }

commit 647ef3fd5d44f3da527426bf1c57286f3d94de80
Author: Benjamin <benjamin.mateo@protonmail.com>
Date:   Wed May 5 23:09:18 2021 +0200

    feat(masterchef): refacto

diff --git a/contracts/MasterChef.sol b/contracts/MasterChef.sol
index 9e0ac99..f3a0069 100644
--- a/contracts/MasterChef.sol
+++ b/contracts/MasterChef.sol
@@ -5,6 +5,7 @@ import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
 import "./interfaces/IERC20Ubiquity.sol";
 import "./UbiquityAlgorithmicDollarManager.sol";
 import "./interfaces/ITWAPOracle.sol";
+import "./interfaces/IERC1155Ubiquity.sol";
 import "./interfaces/IUbiquityFormulas.sol";
 
 contract MasterChef {
@@ -28,7 +29,6 @@ contract MasterChef {
     }
     // Info of each pool.
     struct PoolInfo {
-        IERC20 lpToken; // Address of uAD-3CRV LP token contract.
         uint256 lastRewardBlock; // Last block number that uGOVs distribution occurs.
         uint256 accuGOVPerShare; // Accumulated uGOVs per share, times 1e12. See below.
     }
@@ -51,21 +51,24 @@ contract MasterChef {
 
     event Withdraw(address indexed user, uint256 amount);
 
-    event EmergencyWithdraw(address indexed user, uint256 amount);
-
     // ----------- Modifiers -----------
     modifier onlyTokenManager() {
         require(
             manager.hasRole(manager.UBQ_TOKEN_MANAGER_ROLE(), msg.sender),
-            "UBQ token: not manager"
+            "MasterChef: not UBQ manager"
+        );
+        _;
+    }
+    modifier onlyBondingContract() {
+        require(
+            msg.sender == manager.bondingContractAddress(),
+            "MasterChef: not Bonding Contract"
         );
         _;
     }
 
     constructor(address _manager) {
         manager = UbiquityAlgorithmicDollarManager(_manager);
-
-        pool.lpToken = IERC20(manager.stableSwapMetaPoolAddress());
         pool.lastRewardBlock = block.number;
         pool.accuGOVPerShare = 0; // uint256(1e12);
         _updateUGOVMultiplier();
@@ -85,7 +88,11 @@ contract MasterChef {
     function pendingUGOV(address _user) external view returns (uint256) {
         UserInfo storage user = userInfo[_user];
         uint256 accuGOVPerShare = pool.accuGOVPerShare;
-        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
+        uint256 lpSupply =
+            IERC1155Ubiquity(manager.bondingShareAddress()).totalSupply();
+        /*   IERC20(manager.stableSwapMetaPoolAddress()).balanceOf(
+                manager.bondingContractAddress()
+            ); */
 
         // console.log("accuGOVPerShare", accuGOVPerShare);
         // console.log("lpSupply", lpSupply);
@@ -145,7 +152,11 @@ contract MasterChef {
             return;
         }
         _updateUGOVMultiplier();
-        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
+        uint256 lpSupply =
+            IERC1155Ubiquity(manager.bondingShareAddress()).totalSupply();
+        /*  IERC20(manager.stableSwapMetaPoolAddress()).balanceOf(
+                manager.bondingContractAddress()
+            ); */
 
         if (lpSupply == 0) {
             pool.lastRewardBlock = block.number;
@@ -169,36 +180,42 @@ contract MasterChef {
     }
 
     // Deposit LP tokens to MasterChef for uGOV allocation.
-    function deposit(uint256 _amount) public {
-        UserInfo storage user = userInfo[msg.sender];
+    function deposit(uint256 _amount, address sender)
+        external
+        onlyBondingContract
+    {
+        UserInfo storage user = userInfo[sender];
         _updatePool();
         if (user.amount > 0) {
             uint256 pending =
                 ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
-            _safeUGOVTransfer(msg.sender, pending);
+            _safeUGOVTransfer(sender, pending);
         }
-        pool.lpToken.safeTransferFrom(
+        /*  pool.lpToken.safeTransferFrom(
             address(msg.sender),
             address(this),
             _amount
-        );
+        ); */
         user.amount = user.amount + _amount;
         user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
-        emit Deposit(msg.sender, _amount);
+        emit Deposit(sender, _amount);
     }
 
     // Withdraw LP tokens from MasterChef.
-    function withdraw(uint256 _amount) public {
-        UserInfo storage user = userInfo[msg.sender];
+    function withdraw(uint256 _amount, address sender)
+        external
+        onlyBondingContract
+    {
+        UserInfo storage user = userInfo[sender];
         require(user.amount >= _amount, "MC: amount too high");
         _updatePool();
         uint256 pending =
             ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
-        _safeUGOVTransfer(msg.sender, pending);
+        _safeUGOVTransfer(sender, pending);
         user.amount = user.amount - _amount;
         user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
-        pool.lpToken.safeTransfer(address(msg.sender), _amount);
-        emit Withdraw(msg.sender, _amount);
+        /*  pool.lpToken.safeTransfer(msg.sender, _amount); */
+        emit Withdraw(sender, _amount);
     }
 
     /// @dev get pending uGOV rewards from MasterChef.
@@ -214,15 +231,6 @@ contract MasterChef {
         return pending;
     }
 
-    // Withdraw without caring about rewards. EMERGENCY ONLY.
-    function emergencyWithdraw() public {
-        UserInfo storage user = userInfo[msg.sender];
-        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
-        emit EmergencyWithdraw(msg.sender, user.amount);
-        user.amount = 0;
-        user.rewardDebt = 0;
-    }
-
     function _getMultiplier() internal view returns (uint256) {
         console.log(
             "## _getMultiplier  numberOfBlockB:%s  uGOVmultiplier:%s",

commit 055f7180aba3fda3f86e30f6346a1e1ea416916a
Author: Benjamin <benjamin.mateo@protonmail.com>
Date:   Wed May 5 17:04:35 2021 +0200

    feat(masterchef): improve tests

diff --git a/contracts/MasterChef.sol b/contracts/MasterChef.sol
index c8ac748..9e0ac99 100644
--- a/contracts/MasterChef.sol
+++ b/contracts/MasterChef.sol
@@ -37,9 +37,10 @@ contract MasterChef {
     UbiquityAlgorithmicDollarManager public manager;
 
     // uGOV tokens created per block.
-    uint256 public uGOVPerBlock = 1e12;
+    uint256 public uGOVPerBlock = 1e18;
     // Bonus muliplier for early uGOV makers.
     uint256 public uGOVmultiplier = 1e18;
+    uint256 public minPriceDiffToUpdateMultiplier = 1000000000000000;
     uint256 public lastPrice = 1 ether;
     // Info of each pool.
     PoolInfo public pool;
@@ -74,6 +75,12 @@ contract MasterChef {
         uGOVPerBlock = _uGOVPerBlock;
     }
 
+    function setMinPriceDiffToUpdateMultiplier(
+        uint256 _minPriceDiffToUpdateMultiplier
+    ) external onlyTokenManager {
+        minPriceDiffToUpdateMultiplier = _minPriceDiffToUpdateMultiplier;
+    }
+
     // View function to see pending uGOVs on frontend.
     function pendingUGOV(address _user) external view returns (uint256) {
         UserInfo storage user = userInfo[_user];
@@ -84,14 +91,17 @@ contract MasterChef {
         // console.log("lpSupply", lpSupply);
 
         if (block.number > pool.lastRewardBlock && lpSupply != 0) {
-            uint256 multiplier =
-                _getMultiplier(pool.lastRewardBlock, block.number);
+            uint256 multiplier = _getMultiplier();
 
             uint256 uGOVReward = (multiplier * uGOVPerBlock) / 1e18;
-
+            console.log(
+                "## PENDING NEW MULTIPLIER multiplier:%s uGOVReward:%s",
+                multiplier,
+                uGOVReward
+            );
             accuGOVPerShare =
-                ((accuGOVPerShare + uGOVReward) * 1e12) /
-                lpSupply;
+                accuGOVPerShare +
+                ((uGOVReward * 1e12) / lpSupply);
 
             // console.log("multiplier", multiplier);
             // console.log("uGOVReward", uGOVReward);
@@ -99,6 +109,7 @@ contract MasterChef {
         // console.log("user.amount", user.amount);
         // console.log("user.rewardDebt", user.rewardDebt);
         // console.log("accuGOVPerShare", accuGOVPerShare);
+
         return (user.amount * accuGOVPerShare) / 1e12 - user.rewardDebt;
     }
 
@@ -106,14 +117,25 @@ contract MasterChef {
     function _updateUGOVMultiplier() internal {
         // (1.05/(1+abs(1-TWAP_PRICE)))
         uint256 currentPrice = _getTwapPrice();
+
+        bool isPriceDiffEnough = false;
         // a minimum price variation is needed to update the multiplier
-        if (
-            currentPrice - lastPrice > 1000100000000000000 ||
-            lastPrice - currentPrice > 1000100000000000000
-        ) {
+        if (currentPrice > lastPrice) {
+            isPriceDiffEnough =
+                currentPrice - lastPrice > minPriceDiffToUpdateMultiplier;
+        } else {
+            isPriceDiffEnough =
+                lastPrice - currentPrice > minPriceDiffToUpdateMultiplier;
+        }
+
+        if (isPriceDiffEnough) {
             uGOVmultiplier = IUbiquityFormulas(manager.formulasAddress())
                 .ugovMultiply(uGOVmultiplier, currentPrice);
             lastPrice = currentPrice;
+            console.log(
+                "## MULTIPLIER UPDATED  uGOVmultiplier:%s",
+                uGOVmultiplier
+            );
         }
     }
 
@@ -129,15 +151,20 @@ contract MasterChef {
             pool.lastRewardBlock = block.number;
             return;
         }
-        uint256 multiplier = _getMultiplier(pool.lastRewardBlock, block.number);
-        uint256 uGOVReward = multiplier * uGOVPerBlock;
+        uint256 multiplier = _getMultiplier();
+        uint256 uGOVReward = (multiplier * uGOVPerBlock) / 1e18;
+        console.log(
+            "## _updatePool  WE ARE MINTING uGOVReward:%s  uGOVPerBlock:%s",
+            uGOVReward,
+            uGOVPerBlock
+        );
         IERC20Ubiquity(manager.uGOVTokenAddress()).mint(
             address(this),
             uGOVReward
         );
         pool.accuGOVPerShare =
-            ((pool.accuGOVPerShare + uGOVReward) * 1e12) /
-            lpSupply;
+            pool.accuGOVPerShare +
+            ((uGOVReward * 1e12) / lpSupply);
         pool.lastRewardBlock = block.number;
     }
 
@@ -147,7 +174,7 @@ contract MasterChef {
         _updatePool();
         if (user.amount > 0) {
             uint256 pending =
-                (user.amount * pool.accuGOVPerShare) / (1e12 - user.rewardDebt);
+                ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
             _safeUGOVTransfer(msg.sender, pending);
         }
         pool.lpToken.safeTransferFrom(
@@ -163,7 +190,7 @@ contract MasterChef {
     // Withdraw LP tokens from MasterChef.
     function withdraw(uint256 _amount) public {
         UserInfo storage user = userInfo[msg.sender];
-        require(user.amount >= _amount, "withdraw: not good");
+        require(user.amount >= _amount, "MC: amount too high");
         _updatePool();
         uint256 pending =
             ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
@@ -174,6 +201,19 @@ contract MasterChef {
         emit Withdraw(msg.sender, _amount);
     }
 
+    /// @dev get pending uGOV rewards from MasterChef.
+    /// @return amount of pending rewards transfered to msg.sender
+    /// @notice only send pending rewards
+    function getRewards() external returns (uint256) {
+        UserInfo storage user = userInfo[msg.sender];
+        _updatePool();
+        uint256 pending =
+            ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
+        _safeUGOVTransfer(msg.sender, pending);
+        user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
+        return pending;
+    }
+
     // Withdraw without caring about rewards. EMERGENCY ONLY.
     function emergencyWithdraw() public {
         UserInfo storage user = userInfo[msg.sender];
@@ -183,12 +223,13 @@ contract MasterChef {
         user.rewardDebt = 0;
     }
 
-    function _getMultiplier(uint256 _from, uint256 _to)
-        internal
-        view
-        returns (uint256)
-    {
-        return (_to - _from) * uGOVmultiplier;
+    function _getMultiplier() internal view returns (uint256) {
+        console.log(
+            "## _getMultiplier  numberOfBlockB:%s  uGOVmultiplier:%s",
+            block.number - pool.lastRewardBlock,
+            uGOVmultiplier
+        );
+        return (block.number - pool.lastRewardBlock) * uGOVmultiplier;
     }
 
     function _getTwapPrice() internal view returns (uint256) {
@@ -203,9 +244,17 @@ contract MasterChef {
     function _safeUGOVTransfer(address _to, uint256 _amount) internal {
         IERC20Ubiquity uGOV = IERC20Ubiquity(manager.uGOVTokenAddress());
         uint256 uGOVBal = uGOV.balanceOf(address(this));
+
+        console.log(
+            "## _safeUGOVTransfer uGOVBal:%s  _amount:%s uGOVmultiplier:%s ",
+            uGOVBal,
+            _amount,
+            uGOVmultiplier
+        );
         if (_amount > uGOVBal) {
             uGOV.safeTransfer(_to, uGOVBal);
         } else {
+            console.log("## ON TRASNFERE AMOUNT");
             uGOV.safeTransfer(_to, _amount);
         }
     }

commit 1c7a843bc7da6d8c8c5ab6809ec73f1ddf3de543
Author: Benjamin <benjamin.mateo@protonmail.com>
Date:   Tue May 4 09:40:15 2021 +0200

    feat(bonding): update and improve tests

diff --git a/contracts/MasterChef.sol b/contracts/MasterChef.sol
index b71c524..c8ac748 100644
--- a/contracts/MasterChef.sol
+++ b/contracts/MasterChef.sol
@@ -8,8 +8,8 @@ import "./interfaces/ITWAPOracle.sol";
 import "./interfaces/IUbiquityFormulas.sol";
 
 contract MasterChef {
+    using SafeERC20 for IERC20Ubiquity;
     using SafeERC20 for IERC20;
-
     // Info of each user.
     struct UserInfo {
         uint256 amount; // How many uAD-3CRV LP tokens the user has provided.
@@ -35,12 +35,12 @@ contract MasterChef {
 
     // Ubiquity Manager
     UbiquityAlgorithmicDollarManager public manager;
-    // The uGOV TOKEN!
-    IERC20Ubiquity public uGOV;
+
     // uGOV tokens created per block.
     uint256 public uGOVPerBlock = 1e12;
     // Bonus muliplier for early uGOV makers.
-    uint256 public uGOVmultiplier = 2e18;
+    uint256 public uGOVmultiplier = 1e18;
+    uint256 public lastPrice = 1 ether;
     // Info of each pool.
     PoolInfo public pool;
     // Info of each user that stakes LP tokens.
@@ -56,23 +56,21 @@ contract MasterChef {
     modifier onlyTokenManager() {
         require(
             manager.hasRole(manager.UBQ_TOKEN_MANAGER_ROLE(), msg.sender),
-            "UBQ token: not minter"
+            "UBQ token: not manager"
         );
         _;
     }
 
     constructor(address _manager) {
         manager = UbiquityAlgorithmicDollarManager(_manager);
-        uGOV = IERC20Ubiquity(manager.uGOVTokenAddress());
+
         pool.lpToken = IERC20(manager.stableSwapMetaPoolAddress());
         pool.lastRewardBlock = block.number;
         pool.accuGOVPerShare = 0; // uint256(1e12);
+        _updateUGOVMultiplier();
     }
 
-    function setupUGOVPerBlock(uint256 _uGOVPerBlock)
-        external
-        onlyTokenManager
-    {
+    function setUGOVPerBlock(uint256 _uGOVPerBlock) external onlyTokenManager {
         uGOVPerBlock = _uGOVPerBlock;
     }
 
@@ -87,7 +85,7 @@ contract MasterChef {
 
         if (block.number > pool.lastRewardBlock && lpSupply != 0) {
             uint256 multiplier =
-                getMultiplier(pool.lastRewardBlock, block.number);
+                _getMultiplier(pool.lastRewardBlock, block.number);
 
             uint256 uGOVReward = (multiplier * uGOVPerBlock) / 1e18;
 
@@ -105,26 +103,38 @@ contract MasterChef {
     }
 
     // UPDATE uGOV multiplier
-    function updateUGOVMultiplier() public {
-        uGOVmultiplier = IUbiquityFormulas(manager.formulasAddress())
-            .ugovMultiply(uGOVmultiplier, getTwapPrice());
+    function _updateUGOVMultiplier() internal {
+        // (1.05/(1+abs(1-TWAP_PRICE)))
+        uint256 currentPrice = _getTwapPrice();
+        // a minimum price variation is needed to update the multiplier
+        if (
+            currentPrice - lastPrice > 1000100000000000000 ||
+            lastPrice - currentPrice > 1000100000000000000
+        ) {
+            uGOVmultiplier = IUbiquityFormulas(manager.formulasAddress())
+                .ugovMultiply(uGOVmultiplier, currentPrice);
+            lastPrice = currentPrice;
+        }
     }
 
     // Update reward variables of the given pool to be up-to-date.
-    function updatePool() public {
+    function _updatePool() internal {
         if (block.number <= pool.lastRewardBlock) {
             return;
         }
-        updateUGOVMultiplier();
+        _updateUGOVMultiplier();
         uint256 lpSupply = pool.lpToken.balanceOf(address(this));
 
         if (lpSupply == 0) {
             pool.lastRewardBlock = block.number;
             return;
         }
-        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
+        uint256 multiplier = _getMultiplier(pool.lastRewardBlock, block.number);
         uint256 uGOVReward = multiplier * uGOVPerBlock;
-        uGOV.mint(address(this), uGOVReward);
+        IERC20Ubiquity(manager.uGOVTokenAddress()).mint(
+            address(this),
+            uGOVReward
+        );
         pool.accuGOVPerShare =
             ((pool.accuGOVPerShare + uGOVReward) * 1e12) /
             lpSupply;
@@ -134,7 +144,7 @@ contract MasterChef {
     // Deposit LP tokens to MasterChef for uGOV allocation.
     function deposit(uint256 _amount) public {
         UserInfo storage user = userInfo[msg.sender];
-        updatePool();
+        _updatePool();
         if (user.amount > 0) {
             uint256 pending =
                 (user.amount * pool.accuGOVPerShare) / (1e12 - user.rewardDebt);
@@ -154,7 +164,7 @@ contract MasterChef {
     function withdraw(uint256 _amount) public {
         UserInfo storage user = userInfo[msg.sender];
         require(user.amount >= _amount, "withdraw: not good");
-        updatePool();
+        _updatePool();
         uint256 pending =
             ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
         _safeUGOVTransfer(msg.sender, pending);
@@ -173,15 +183,15 @@ contract MasterChef {
         user.rewardDebt = 0;
     }
 
-    function getMultiplier(uint256 _from, uint256 _to)
-        public
+    function _getMultiplier(uint256 _from, uint256 _to)
+        internal
         view
         returns (uint256)
     {
         return (_to - _from) * uGOVmultiplier;
     }
 
-    function getTwapPrice() public view returns (uint256) {
+    function _getTwapPrice() internal view returns (uint256) {
         return
             ITWAPOracle(manager.twapOracleAddress()).consult(
                 manager.uADTokenAddress()
@@ -191,11 +201,12 @@ contract MasterChef {
     // Safe uGOV transfer function, just in case if rounding
     // error causes pool to not have enough uGOVs.
     function _safeUGOVTransfer(address _to, uint256 _amount) internal {
+        IERC20Ubiquity uGOV = IERC20Ubiquity(manager.uGOVTokenAddress());
         uint256 uGOVBal = uGOV.balanceOf(address(this));
         if (_amount > uGOVBal) {
-            uGOV.transfer(_to, uGOVBal);
+            uGOV.safeTransfer(_to, uGOVBal);
         } else {
-            uGOV.transfer(_to, _amount);
+            uGOV.safeTransfer(_to, _amount);
         }
     }
 }

commit ebea4a2d7a516ddde56dc5901971f9288dd5dd78
Author: Alain Papazoglou <alain@kredeum.com>
Date:   Sat May 1 18:31:09 2021 +0200

    fix(lint): fix lint pbs

diff --git a/contracts/MasterChef.sol b/contracts/MasterChef.sol
index b194dd8..b71c524 100644
--- a/contracts/MasterChef.sol
+++ b/contracts/MasterChef.sol
@@ -8,7 +8,6 @@ import "./interfaces/ITWAPOracle.sol";
 import "./interfaces/IUbiquityFormulas.sol";
 
 contract MasterChef {
-    UbiquityAlgorithmicDollarManager public manager;
     using SafeERC20 for IERC20;
 
     // Info of each user.
@@ -33,6 +32,9 @@ contract MasterChef {
         uint256 lastRewardBlock; // Last block number that uGOVs distribution occurs.
         uint256 accuGOVPerShare; // Accumulated uGOVs per share, times 1e12. See below.
     }
+
+    // Ubiquity Manager
+    UbiquityAlgorithmicDollarManager public manager;
     // The uGOV TOKEN!
     IERC20Ubiquity public uGOV;
     // uGOV tokens created per block.
@@ -74,27 +76,6 @@ contract MasterChef {
         uGOVPerBlock = _uGOVPerBlock;
     }
 
-    function getTwapPrice() public view returns (uint256) {
-        return
-            ITWAPOracle(manager.twapOracleAddress()).consult(
-                manager.uADTokenAddress()
-            );
-    }
-
-    // UPDATE uGOV multiplier
-    function updateUGOVMultiplier() public {
-        uGOVmultiplier = IUbiquityFormulas(manager.formulasAddress())
-            .ugovMultiply(uGOVmultiplier, getTwapPrice());
-    }
-
-    function getMultiplier(uint256 _from, uint256 _to)
-        public
-        view
-        returns (uint256)
-    {
-        return (_to - _from) * uGOVmultiplier;
-    }
-
     // View function to see pending uGOVs on frontend.
     function pendingUGOV(address _user) external view returns (uint256) {
         UserInfo storage user = userInfo[_user];
@@ -123,6 +104,12 @@ contract MasterChef {
         return (user.amount * accuGOVPerShare) / 1e12 - user.rewardDebt;
     }
 
+    // UPDATE uGOV multiplier
+    function updateUGOVMultiplier() public {
+        uGOVmultiplier = IUbiquityFormulas(manager.formulasAddress())
+            .ugovMultiply(uGOVmultiplier, getTwapPrice());
+    }
+
     // Update reward variables of the given pool to be up-to-date.
     function updatePool() public {
         if (block.number <= pool.lastRewardBlock) {
@@ -151,7 +138,7 @@ contract MasterChef {
         if (user.amount > 0) {
             uint256 pending =
                 (user.amount * pool.accuGOVPerShare) / (1e12 - user.rewardDebt);
-            safeUGOVTransfer(msg.sender, pending);
+            _safeUGOVTransfer(msg.sender, pending);
         }
         pool.lpToken.safeTransferFrom(
             address(msg.sender),
@@ -170,7 +157,7 @@ contract MasterChef {
         updatePool();
         uint256 pending =
             ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
-        safeUGOVTransfer(msg.sender, pending);
+        _safeUGOVTransfer(msg.sender, pending);
         user.amount = user.amount - _amount;
         user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
         pool.lpToken.safeTransfer(address(msg.sender), _amount);
@@ -186,8 +173,24 @@ contract MasterChef {
         user.rewardDebt = 0;
     }
 
-    // Safe uGOV transfer function, just in case if rounding error causes pool to not have enough uGOVs.
-    function safeUGOVTransfer(address _to, uint256 _amount) internal {
+    function getMultiplier(uint256 _from, uint256 _to)
+        public
+        view
+        returns (uint256)
+    {
+        return (_to - _from) * uGOVmultiplier;
+    }
+
+    function getTwapPrice() public view returns (uint256) {
+        return
+            ITWAPOracle(manager.twapOracleAddress()).consult(
+                manager.uADTokenAddress()
+            );
+    }
+
+    // Safe uGOV transfer function, just in case if rounding
+    // error causes pool to not have enough uGOVs.
+    function _safeUGOVTransfer(address _to, uint256 _amount) internal {
         uint256 uGOVBal = uGOV.balanceOf(address(this));
         if (_amount > uGOVBal) {
             uGOV.transfer(_to, uGOVBal);

commit 58c88a47b6464c474731c02e15b7d351923b1a3c
Author: Alain Papazoglou <alain@kredeum.com>
Date:   Sat May 1 13:28:19 2021 +0200

    feat(formulas): change formula library to a contract

diff --git a/contracts/MasterChef.sol b/contracts/MasterChef.sol
index 89628d0..b194dd8 100644
--- a/contracts/MasterChef.sol
+++ b/contracts/MasterChef.sol
@@ -5,12 +5,11 @@ import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
 import "./interfaces/IERC20Ubiquity.sol";
 import "./UbiquityAlgorithmicDollarManager.sol";
 import "./interfaces/ITWAPOracle.sol";
-import "./libs/UbiquityFormulas.sol";
+import "./interfaces/IUbiquityFormulas.sol";
 
 contract MasterChef {
     UbiquityAlgorithmicDollarManager public manager;
     using SafeERC20 for IERC20;
-    using UbiquityFormulas for uint256;
 
     // Info of each user.
     struct UserInfo {
@@ -84,7 +83,8 @@ contract MasterChef {
 
     // UPDATE uGOV multiplier
     function updateUGOVMultiplier() public {
-        uGOVmultiplier = uGOVmultiplier.ugovMultiply(getTwapPrice());
+        uGOVmultiplier = IUbiquityFormulas(manager.formulasAddress())
+            .ugovMultiply(uGOVmultiplier, getTwapPrice());
     }
 
     function getMultiplier(uint256 _from, uint256 _to)

commit a31487295facdafadfea4e626b5c65fb3b8f1748
Author: Alain Papazoglou <alain@kredeum.com>
Date:   Sat May 1 11:44:03 2021 +0200

    fix(ugov): adjust constants dimensions

diff --git a/contracts/MasterChef.sol b/contracts/MasterChef.sol
index d6f530f..89628d0 100644
--- a/contracts/MasterChef.sol
+++ b/contracts/MasterChef.sol
@@ -99,18 +99,28 @@ contract MasterChef {
     function pendingUGOV(address _user) external view returns (uint256) {
         UserInfo storage user = userInfo[_user];
         uint256 accuGOVPerShare = pool.accuGOVPerShare;
-
         uint256 lpSupply = pool.lpToken.balanceOf(address(this));
 
+        // console.log("accuGOVPerShare", accuGOVPerShare);
+        // console.log("lpSupply", lpSupply);
+
         if (block.number > pool.lastRewardBlock && lpSupply != 0) {
             uint256 multiplier =
                 getMultiplier(pool.lastRewardBlock, block.number);
-            uint256 uGOVReward = multiplier * uGOVPerBlock;
+
+            uint256 uGOVReward = (multiplier * uGOVPerBlock) / 1e18;
+
             accuGOVPerShare =
-                (accuGOVPerShare + uGOVReward) *
-                (1e12 / lpSupply);
+                ((accuGOVPerShare + uGOVReward) * 1e12) /
+                lpSupply;
+
+            // console.log("multiplier", multiplier);
+            // console.log("uGOVReward", uGOVReward);
         }
-        return user.amount * (accuGOVPerShare / 1e12) - user.rewardDebt;
+        // console.log("user.amount", user.amount);
+        // console.log("user.rewardDebt", user.rewardDebt);
+        // console.log("accuGOVPerShare", accuGOVPerShare);
+        return (user.amount * accuGOVPerShare) / 1e12 - user.rewardDebt;
     }
 
     // Update reward variables of the given pool to be up-to-date.
@@ -129,8 +139,8 @@ contract MasterChef {
         uint256 uGOVReward = multiplier * uGOVPerBlock;
         uGOV.mint(address(this), uGOVReward);
         pool.accuGOVPerShare =
-            (pool.accuGOVPerShare + uGOVReward) *
-            (1e12 / lpSupply);
+            ((pool.accuGOVPerShare + uGOVReward) * 1e12) /
+            lpSupply;
         pool.lastRewardBlock = block.number;
     }
 

commit 49809765261d85135011cbc667b820213fb8a23e
Author: Alain Papazoglou <alain@kredeum.com>
Date:   Fri Apr 30 22:53:15 2021 +0200

    feat(ugov): add deposit and withdraw with tests (wip)

diff --git a/contracts/MasterChef.sol b/contracts/MasterChef.sol
index f52825d..d6f530f 100644
--- a/contracts/MasterChef.sol
+++ b/contracts/MasterChef.sol
@@ -36,20 +36,14 @@ contract MasterChef {
     }
     // The uGOV TOKEN!
     IERC20Ubiquity public uGOV;
-    // Block number when bonus uGOV period ends.
-    uint256 public bonusEndBlock;
     // uGOV tokens created per block.
-    uint256 public uGOVPerBlock;
+    uint256 public uGOVPerBlock = 1e12;
     // Bonus muliplier for early uGOV makers.
-    uint256 public constant BONUS_MULTIPLIER = 10;
-    // UGOV muliplier
-    uint256 public uGOVmultiplier = 1;
+    uint256 public uGOVmultiplier = 2e18;
     // Info of each pool.
     PoolInfo public pool;
     // Info of each user that stakes LP tokens.
     mapping(address => UserInfo) public userInfo;
-    // The block number when uGOV mining starts.
-    uint256 public startBlock;
 
     event Deposit(address indexed user, uint256 amount);
 
@@ -69,7 +63,9 @@ contract MasterChef {
     constructor(address _manager) {
         manager = UbiquityAlgorithmicDollarManager(_manager);
         uGOV = IERC20Ubiquity(manager.uGOVTokenAddress());
-        pool.lpToken = IERC20Ubiquity(manager.curve3PoolTokenAddress());
+        pool.lpToken = IERC20(manager.stableSwapMetaPoolAddress());
+        pool.lastRewardBlock = block.number;
+        pool.accuGOVPerShare = 0; // uint256(1e12);
     }
 
     function setupUGOVPerBlock(uint256 _uGOVPerBlock)
@@ -79,17 +75,6 @@ contract MasterChef {
         uGOVPerBlock = _uGOVPerBlock;
     }
 
-    function setupbonusEndBlock(uint256 _bonusEndBlock)
-        external
-        onlyTokenManager
-    {
-        bonusEndBlock = _bonusEndBlock;
-    }
-
-    function setupstartBlock(uint256 _startBlock) external onlyTokenManager {
-        startBlock = _startBlock;
-    }
-
     function getTwapPrice() public view returns (uint256) {
         return
             ITWAPOracle(manager.twapOracleAddress()).consult(
@@ -98,9 +83,6 @@ contract MasterChef {
     }
 
     // UPDATE uGOV multiplier
-    //
-    // ugov_mint_multiplier = ugov_mint_multiplier * (1.05/(1+abs(1-TWAP_PRICE)))
-    // 5>=multiplier >=0.2
     function updateUGOVMultiplier() public {
         uGOVmultiplier = uGOVmultiplier.ugovMultiply(getTwapPrice());
     }
@@ -110,22 +92,16 @@ contract MasterChef {
         view
         returns (uint256)
     {
-        if (_to <= bonusEndBlock) {
-            return (_to - _from) * BONUS_MULTIPLIER;
-        } else if (_from >= bonusEndBlock) {
-            return _to - _from;
-        } else {
-            return
-                ((bonusEndBlock - _from) * BONUS_MULTIPLIER) +
-                (_to - bonusEndBlock);
-        }
+        return (_to - _from) * uGOVmultiplier;
     }
 
     // View function to see pending uGOVs on frontend.
-    function pendinguGOV(address _user) external view returns (uint256) {
+    function pendingUGOV(address _user) external view returns (uint256) {
         UserInfo storage user = userInfo[_user];
         uint256 accuGOVPerShare = pool.accuGOVPerShare;
+
         uint256 lpSupply = pool.lpToken.balanceOf(address(this));
+
         if (block.number > pool.lastRewardBlock && lpSupply != 0) {
             uint256 multiplier =
                 getMultiplier(pool.lastRewardBlock, block.number);
@@ -142,7 +118,9 @@ contract MasterChef {
         if (block.number <= pool.lastRewardBlock) {
             return;
         }
+        updateUGOVMultiplier();
         uint256 lpSupply = pool.lpToken.balanceOf(address(this));
+
         if (lpSupply == 0) {
             pool.lastRewardBlock = block.number;
             return;
@@ -163,7 +141,7 @@ contract MasterChef {
         if (user.amount > 0) {
             uint256 pending =
                 (user.amount * pool.accuGOVPerShare) / (1e12 - user.rewardDebt);
-            safeuGOVTransfer(msg.sender, pending);
+            safeUGOVTransfer(msg.sender, pending);
         }
         pool.lpToken.safeTransferFrom(
             address(msg.sender),
@@ -182,7 +160,7 @@ contract MasterChef {
         updatePool();
         uint256 pending =
             ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
-        safeuGOVTransfer(msg.sender, pending);
+        safeUGOVTransfer(msg.sender, pending);
         user.amount = user.amount - _amount;
         user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
         pool.lpToken.safeTransfer(address(msg.sender), _amount);
@@ -199,7 +177,7 @@ contract MasterChef {
     }
 
     // Safe uGOV transfer function, just in case if rounding error causes pool to not have enough uGOVs.
-    function safeuGOVTransfer(address _to, uint256 _amount) internal {
+    function safeUGOVTransfer(address _to, uint256 _amount) internal {
         uint256 uGOVBal = uGOV.balanceOf(address(this));
         if (_amount > uGOVBal) {
             uGOV.transfer(_to, uGOVBal);

commit 4ac95a46f929613bc274460b4f63519a4d836091
Author: Alain Papazoglou <alain@kredeum.com>
Date:   Fri Apr 30 13:25:20 2021 +0200

    feat(ugov): add mint multiplier formula with tests

diff --git a/contracts/MasterChef.sol b/contracts/MasterChef.sol
index 567f417..f52825d 100644
--- a/contracts/MasterChef.sol
+++ b/contracts/MasterChef.sol
@@ -4,14 +4,17 @@ pragma solidity 0.8.3;
 import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
 import "./interfaces/IERC20Ubiquity.sol";
 import "./UbiquityAlgorithmicDollarManager.sol";
+import "./interfaces/ITWAPOracle.sol";
+import "./libs/UbiquityFormulas.sol";
 
 contract MasterChef {
     UbiquityAlgorithmicDollarManager public manager;
     using SafeERC20 for IERC20;
+    using UbiquityFormulas for uint256;
 
     // Info of each user.
     struct UserInfo {
-        uint256 amount; // How many LP tokens the user has provided.
+        uint256 amount; // How many uAD-3CRV LP tokens the user has provided.
         uint256 rewardDebt; // Reward debt. See explanation below.
         //
         // We do some fancy math here. Basically, any point in time, the amount of uGOVs
@@ -27,27 +30,24 @@ contract MasterChef {
     }
     // Info of each pool.
     struct PoolInfo {
-        IERC20 lpToken; // Address of LP token contract.
-        uint256 allocPoint; // How many allocation points assigned to this pool. uGOVs to distribute per block.
+        IERC20 lpToken; // Address of uAD-3CRV LP token contract.
         uint256 lastRewardBlock; // Last block number that uGOVs distribution occurs.
         uint256 accuGOVPerShare; // Accumulated uGOVs per share, times 1e12. See below.
     }
     // The uGOV TOKEN!
     IERC20Ubiquity public uGOV;
-    // Dev address.
-    address public devaddr;
     // Block number when bonus uGOV period ends.
     uint256 public bonusEndBlock;
     // uGOV tokens created per block.
     uint256 public uGOVPerBlock;
     // Bonus muliplier for early uGOV makers.
     uint256 public constant BONUS_MULTIPLIER = 10;
+    // UGOV muliplier
+    uint256 public uGOVmultiplier = 1;
     // Info of each pool.
-    PoolInfo public poolInfo;
+    PoolInfo public pool;
     // Info of each user that stakes LP tokens.
     mapping(address => UserInfo) public userInfo;
-    // Total allocation poitns. Must be the sum of all allocation points in all pools.
-    uint256 public totalAllocPoint = 0;
     // The block number when uGOV mining starts.
     uint256 public startBlock;
 
@@ -58,38 +58,53 @@ contract MasterChef {
     event EmergencyWithdraw(address indexed user, uint256 amount);
 
     // ----------- Modifiers -----------
-    modifier onlyMinter() {
+    modifier onlyTokenManager() {
         require(
-            manager.hasRole(manager.UBQ_MINTER_ROLE(), msg.sender),
+            manager.hasRole(manager.UBQ_TOKEN_MANAGER_ROLE(), msg.sender),
             "UBQ token: not minter"
         );
         _;
     }
 
-    constructor(
-        address _manager // ,
-    ) // uint256 _uGOVPerBlock,
-    // uint256 _startBlock,
-    // uint256 _bonusEndBlock
-    {
+    constructor(address _manager) {
         manager = UbiquityAlgorithmicDollarManager(_manager);
         uGOV = IERC20Ubiquity(manager.uGOVTokenAddress());
+        pool.lpToken = IERC20Ubiquity(manager.curve3PoolTokenAddress());
+    }
 
-        // uGOVPerBlock = _uGOVPerBlock;
-        // bonusEndBlock = _bonusEndBlock;
-        // startBlock = _startBlock;
+    function setupUGOVPerBlock(uint256 _uGOVPerBlock)
+        external
+        onlyTokenManager
+    {
+        uGOVPerBlock = _uGOVPerBlock;
     }
 
-    // Update the given pool's uGOV allocation point. Can only be called by the owner.
-    function set(uint256 _allocPoint, bool _withUpdate) public onlyMinter {
-        if (_withUpdate) {
-            updatePool();
-        }
-        totalAllocPoint = totalAllocPoint - poolInfo.allocPoint + _allocPoint;
-        poolInfo.allocPoint = _allocPoint;
+    function setupbonusEndBlock(uint256 _bonusEndBlock)
+        external
+        onlyTokenManager
+    {
+        bonusEndBlock = _bonusEndBlock;
+    }
+
+    function setupstartBlock(uint256 _startBlock) external onlyTokenManager {
+        startBlock = _startBlock;
+    }
+
+    function getTwapPrice() public view returns (uint256) {
+        return
+            ITWAPOracle(manager.twapOracleAddress()).consult(
+                manager.uADTokenAddress()
+            );
+    }
+
+    // UPDATE uGOV multiplier
+    //
+    // ugov_mint_multiplier = ugov_mint_multiplier * (1.05/(1+abs(1-TWAP_PRICE)))
+    // 5>=multiplier >=0.2
+    function updateUGOVMultiplier() public {
+        uGOVmultiplier = uGOVmultiplier.ugovMultiply(getTwapPrice());
     }
 
-    // Return reward multiplier over the given _from to _to block.
     function getMultiplier(uint256 _from, uint256 _to)
         public
         view
@@ -108,16 +123,13 @@ contract MasterChef {
 
     // View function to see pending uGOVs on frontend.
     function pendinguGOV(address _user) external view returns (uint256) {
-        PoolInfo storage pool = poolInfo;
         UserInfo storage user = userInfo[_user];
         uint256 accuGOVPerShare = pool.accuGOVPerShare;
         uint256 lpSupply = pool.lpToken.balanceOf(address(this));
         if (block.number > pool.lastRewardBlock && lpSupply != 0) {
             uint256 multiplier =
                 getMultiplier(pool.lastRewardBlock, block.number);
-            uint256 uGOVReward =
-                (multiplier * uGOVPerBlock) *
-                    (pool.allocPoint / totalAllocPoint);
+            uint256 uGOVReward = multiplier * uGOVPerBlock;
             accuGOVPerShare =
                 (accuGOVPerShare + uGOVReward) *
                 (1e12 / lpSupply);
@@ -127,7 +139,6 @@ contract MasterChef {
 
     // Update reward variables of the given pool to be up-to-date.
     function updatePool() public {
-        PoolInfo storage pool = poolInfo;
         if (block.number <= pool.lastRewardBlock) {
             return;
         }
@@ -137,8 +148,7 @@ contract MasterChef {
             return;
         }
         uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
-        uint256 uGOVReward =
-            multiplier * uGOVPerBlock * (pool.allocPoint / totalAllocPoint);
+        uint256 uGOVReward = multiplier * uGOVPerBlock;
         uGOV.mint(address(this), uGOVReward);
         pool.accuGOVPerShare =
             (pool.accuGOVPerShare + uGOVReward) *
@@ -148,7 +158,6 @@ contract MasterChef {
 
     // Deposit LP tokens to MasterChef for uGOV allocation.
     function deposit(uint256 _amount) public {
-        PoolInfo storage pool = poolInfo;
         UserInfo storage user = userInfo[msg.sender];
         updatePool();
         if (user.amount > 0) {
@@ -168,7 +177,6 @@ contract MasterChef {
 
     // Withdraw LP tokens from MasterChef.
     function withdraw(uint256 _amount) public {
-        PoolInfo storage pool = poolInfo;
         UserInfo storage user = userInfo[msg.sender];
         require(user.amount >= _amount, "withdraw: not good");
         updatePool();
@@ -183,7 +191,6 @@ contract MasterChef {
 
     // Withdraw without caring about rewards. EMERGENCY ONLY.
     function emergencyWithdraw() public {
-        PoolInfo storage pool = poolInfo;
         UserInfo storage user = userInfo[msg.sender];
         pool.lpToken.safeTransfer(address(msg.sender), user.amount);
         emit EmergencyWithdraw(msg.sender, user.amount);

commit ed88ecbd410284e437b210edfa2c4deee0ebbbce
Author: Alain Papazoglou <alain@kredeum.com>
Date:   Thu Apr 29 19:29:25 2021 +0200

    feat(ugov): init MasterChef and first tests (wip)

diff --git a/contracts/MasterChef.sol b/contracts/MasterChef.sol
new file mode 100644
index 0000000..567f417
--- /dev/null
+++ b/contracts/MasterChef.sol
@@ -0,0 +1,203 @@
+// SPDX-License-Identifier: MIT
+pragma solidity 0.8.3;
+
+import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
+import "./interfaces/IERC20Ubiquity.sol";
+import "./UbiquityAlgorithmicDollarManager.sol";
+
+contract MasterChef {
+    UbiquityAlgorithmicDollarManager public manager;
+    using SafeERC20 for IERC20;
+
+    // Info of each user.
+    struct UserInfo {
+        uint256 amount; // How many LP tokens the user has provided.
+        uint256 rewardDebt; // Reward debt. See explanation below.
+        //
+        // We do some fancy math here. Basically, any point in time, the amount of uGOVs
+        // entitled to a user but is pending to be distributed is:
+        //
+        //   pending reward = (user.amount * pool.accuGOVPerShare) - user.rewardDebt
+        //
+        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
+        //   1. The pool's `accuGOVPerShare` (and `lastRewardBlock`) gets updated.
+        //   2. User receives the pending reward sent to his/her address.
+        //   3. User's `amount` gets updated.
+        //   4. User's `rewardDebt` gets updated.
+    }
+    // Info of each pool.
+    struct PoolInfo {
+        IERC20 lpToken; // Address of LP token contract.
+        uint256 allocPoint; // How many allocation points assigned to this pool. uGOVs to distribute per block.
+        uint256 lastRewardBlock; // Last block number that uGOVs distribution occurs.
+        uint256 accuGOVPerShare; // Accumulated uGOVs per share, times 1e12. See below.
+    }
+    // The uGOV TOKEN!
+    IERC20Ubiquity public uGOV;
+    // Dev address.
+    address public devaddr;
+    // Block number when bonus uGOV period ends.
+    uint256 public bonusEndBlock;
+    // uGOV tokens created per block.
+    uint256 public uGOVPerBlock;
+    // Bonus muliplier for early uGOV makers.
+    uint256 public constant BONUS_MULTIPLIER = 10;
+    // Info of each pool.
+    PoolInfo public poolInfo;
+    // Info of each user that stakes LP tokens.
+    mapping(address => UserInfo) public userInfo;
+    // Total allocation poitns. Must be the sum of all allocation points in all pools.
+    uint256 public totalAllocPoint = 0;
+    // The block number when uGOV mining starts.
+    uint256 public startBlock;
+
+    event Deposit(address indexed user, uint256 amount);
+
+    event Withdraw(address indexed user, uint256 amount);
+
+    event EmergencyWithdraw(address indexed user, uint256 amount);
+
+    // ----------- Modifiers -----------
+    modifier onlyMinter() {
+        require(
+            manager.hasRole(manager.UBQ_MINTER_ROLE(), msg.sender),
+            "UBQ token: not minter"
+        );
+        _;
+    }
+
+    constructor(
+        address _manager // ,
+    ) // uint256 _uGOVPerBlock,
+    // uint256 _startBlock,
+    // uint256 _bonusEndBlock
+    {
+        manager = UbiquityAlgorithmicDollarManager(_manager);
+        uGOV = IERC20Ubiquity(manager.uGOVTokenAddress());
+
+        // uGOVPerBlock = _uGOVPerBlock;
+        // bonusEndBlock = _bonusEndBlock;
+        // startBlock = _startBlock;
+    }
+
+    // Update the given pool's uGOV allocation point. Can only be called by the owner.
+    function set(uint256 _allocPoint, bool _withUpdate) public onlyMinter {
+        if (_withUpdate) {
+            updatePool();
+        }
+        totalAllocPoint = totalAllocPoint - poolInfo.allocPoint + _allocPoint;
+        poolInfo.allocPoint = _allocPoint;
+    }
+
+    // Return reward multiplier over the given _from to _to block.
+    function getMultiplier(uint256 _from, uint256 _to)
+        public
+        view
+        returns (uint256)
+    {
+        if (_to <= bonusEndBlock) {
+            return (_to - _from) * BONUS_MULTIPLIER;
+        } else if (_from >= bonusEndBlock) {
+            return _to - _from;
+        } else {
+            return
+                ((bonusEndBlock - _from) * BONUS_MULTIPLIER) +
+                (_to - bonusEndBlock);
+        }
+    }
+
+    // View function to see pending uGOVs on frontend.
+    function pendinguGOV(address _user) external view returns (uint256) {
+        PoolInfo storage pool = poolInfo;
+        UserInfo storage user = userInfo[_user];
+        uint256 accuGOVPerShare = pool.accuGOVPerShare;
+        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
+        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
+            uint256 multiplier =
+                getMultiplier(pool.lastRewardBlock, block.number);
+            uint256 uGOVReward =
+                (multiplier * uGOVPerBlock) *
+                    (pool.allocPoint / totalAllocPoint);
+            accuGOVPerShare =
+                (accuGOVPerShare + uGOVReward) *
+                (1e12 / lpSupply);
+        }
+        return user.amount * (accuGOVPerShare / 1e12) - user.rewardDebt;
+    }
+
+    // Update reward variables of the given pool to be up-to-date.
+    function updatePool() public {
+        PoolInfo storage pool = poolInfo;
+        if (block.number <= pool.lastRewardBlock) {
+            return;
+        }
+        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
+        if (lpSupply == 0) {
+            pool.lastRewardBlock = block.number;
+            return;
+        }
+        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
+        uint256 uGOVReward =
+            multiplier * uGOVPerBlock * (pool.allocPoint / totalAllocPoint);
+        uGOV.mint(address(this), uGOVReward);
+        pool.accuGOVPerShare =
+            (pool.accuGOVPerShare + uGOVReward) *
+            (1e12 / lpSupply);
+        pool.lastRewardBlock = block.number;
+    }
+
+    // Deposit LP tokens to MasterChef for uGOV allocation.
+    function deposit(uint256 _amount) public {
+        PoolInfo storage pool = poolInfo;
+        UserInfo storage user = userInfo[msg.sender];
+        updatePool();
+        if (user.amount > 0) {
+            uint256 pending =
+                (user.amount * pool.accuGOVPerShare) / (1e12 - user.rewardDebt);
+            safeuGOVTransfer(msg.sender, pending);
+        }
+        pool.lpToken.safeTransferFrom(
+            address(msg.sender),
+            address(this),
+            _amount
+        );
+        user.amount = user.amount + _amount;
+        user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
+        emit Deposit(msg.sender, _amount);
+    }
+
+    // Withdraw LP tokens from MasterChef.
+    function withdraw(uint256 _amount) public {
+        PoolInfo storage pool = poolInfo;
+        UserInfo storage user = userInfo[msg.sender];
+        require(user.amount >= _amount, "withdraw: not good");
+        updatePool();
+        uint256 pending =
+            ((user.amount * pool.accuGOVPerShare) / 1e12) - user.rewardDebt;
+        safeuGOVTransfer(msg.sender, pending);
+        user.amount = user.amount - _amount;
+        user.rewardDebt = (user.amount * pool.accuGOVPerShare) / 1e12;
+        pool.lpToken.safeTransfer(address(msg.sender), _amount);
+        emit Withdraw(msg.sender, _amount);
+    }
+
+    // Withdraw without caring about rewards. EMERGENCY ONLY.
+    function emergencyWithdraw() public {
+        PoolInfo storage pool = poolInfo;
+        UserInfo storage user = userInfo[msg.sender];
+        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
+        emit EmergencyWithdraw(msg.sender, user.amount);
+        user.amount = 0;
+        user.rewardDebt = 0;
+    }
+
+    // Safe uGOV transfer function, just in case if rounding error causes pool to not have enough uGOVs.
+    function safeuGOVTransfer(address _to, uint256 _amount) internal {
+        uint256 uGOVBal = uGOV.balanceOf(address(this));
+        if (_amount > uGOVBal) {
+            uGOV.transfer(_to, uGOVBal);
+        } else {
+            uGOV.transfer(_to, _amount);
+        }
+    }
+}
