// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.6.6;

import "hardhat/console.sol";
import "./interfaces/IMetaPool.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "./libs/UQ112x112.sol";

contract FORMERTWAPOracle {
    using FixedPoint for *;
    using UQ112x112 for uint224;

    address public immutable pool;
    address public immutable token0;
    address public immutable token1;

    uint112 private _reserve0;
    uint112 private _reserve1;
    uint32 public reservesBlockTimestampLast;
    uint32 public pricesBlockTimestampLast;

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;

    FixedPoint.uq112x112 public price0Average;
    FixedPoint.uq112x112 public price1Average;

    constructor(
        address _pool,
        address _token0,
        address _token1
    ) {
        pool = _pool;
        token0 = _token0;
        token1 = _token1;

        _reserve0 = uint112(IMetaPool(_pool).balances(0));
        _reserve1 = uint112(IMetaPool(_pool).balances(1));

        // ensure that there's liquidity in the pair
        require(_reserve0 != 0 && _reserve1 != 0, "TWAPOracle: NO_RESERVES");

        uint32 currentBlockTimestamp = _currentBlockTimestamp();
        reservesBlockTimestampLast = currentBlockTimestamp;
        pricesBlockTimestampLast = currentBlockTimestamp;
    }

    function update() external {
        _update();

        (
            uint256 price0Cumulative,
            uint256 price1Cumulative,
            uint32 blockTimestamp
        ) = _currentCumulativePrices();

        // overflow is desired
        uint32 timeElapsed = blockTimestamp - pricesBlockTimestampLast;

        price0Average = FixedPoint.uq112x112(
            uint224((price0Cumulative - price0CumulativeLast) / timeElapsed)
        );
        price1Average = FixedPoint.uq112x112(
            uint224((price1Cumulative - price1CumulativeLast) / timeElapsed)
        );

        price0CumulativeLast = price0Cumulative;
        price1CumulativeLast = price1Cumulative;
        pricesBlockTimestampLast = blockTimestamp;
    }

    // note this will always return 0 before update has been called successfully
    // for the first time.
    function consult(address token, uint256 amountIn)
        external
        view
        returns (uint256 amountOut)
    {
        if (token == token0) {
            amountOut = price0Average.mul(amountIn).decode144();
        } else {
            require(token == token1, "TWAPOracle: INVALID_TOKEN");
            amountOut = price1Average.mul(amountIn).decode144();
        }
    }

    // helper function that returns the current block timestamp within the
    // range of uint32, i.e. [0, 2**32 - 1]
    function _currentBlockTimestamp() internal view returns (uint32) {
        return uint32(block.timestamp % 2**32);
    }

    function _currentCumulativePrices()
        internal
        view
        returns (
            uint256 price0Cumulative,
            uint256 price1Cumulative,
            uint32 blockTimestamp
        )
    {
        blockTimestamp = _currentBlockTimestamp();

        price0Cumulative = price0CumulativeLast;
        price1Cumulative = price1CumulativeLast;

        if (pricesBlockTimestampLast != blockTimestamp) {
            // subtraction overflow is desired
            uint32 timeElapsed = blockTimestamp - pricesBlockTimestampLast;

            // addition overflow is desired
            price0Cumulative +=
                uint256(FixedPoint.fraction(_reserve1, _reserve0)._x) *
                timeElapsed;

            price1Cumulative +=
                uint256(FixedPoint.fraction(_reserve0, _reserve1)._x) *
                timeElapsed;
        }
    }

    // update reserves
    function _update() private {
        _reserve0 = uint112(IMetaPool(pool).balances(0));
        _reserve1 = uint112(IMetaPool(pool).balances(1));

        uint32 blockTimestamp = _currentBlockTimestamp();
        // overflow is desired
        uint32 timeElapsed = blockTimestamp - reservesBlockTimestampLast;

        if (timeElapsed > 0 && _reserve0 != 0 && _reserve1 != 0) {
            // * never overflows, and + overflow is desired
            price0CumulativeLast +=
                uint256(UQ112x112.encode(_reserve1).uqdiv(_reserve0)) *
                timeElapsed;
            price1CumulativeLast +=
                uint256(UQ112x112.encode(_reserve0).uqdiv(_reserve1)) *
                timeElapsed;
        }

        reservesBlockTimestampLast = blockTimestamp;
    }
}
