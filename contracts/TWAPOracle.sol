// SPDX-License-Identifier: Apache-2.0
pragma solidity =0.6.6;

import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "@uniswap/v2-periphery/contracts/libraries/SafeMath.sol";

import "./interfaces/IMetaPool.sol";

// sliding window oracle that uses observations collected over a window to provide moving price
// averages in the past `windowSize` with a precision of `windowSize / granularity`
// note this is a singleton oracle and only needs to be deployed once per desired parameters, which
// differs from the simple oracle which must be deployed once per pair.
contract TWAPOracle {
    using FixedPoint for *;
    using SafeMath for uint256;

    struct Observation {
        uint256 timestamp;
        uint256 price;
    }

    address public immutable pool;
    // the desired amount of time over which the moving average should be computed, e.g. 24 hours
    uint256 public immutable windowSize;
    // the number of observations stored for each pair, i.e. how many price observations are stored
    // for the window. As granularity increases from 1, more frequent updates are needed, but
    // moving averages become more precise. averages are computed over intervals with sizes in the
    // range: [windowSize - (windowSize / granularity) * 2, windowSize]
    // e.g. if the window size is 24 hours, and the granularity is 24, the oracle will return the
    // average price for the period: [now - [22 hours, 24 hours], now]
    uint8 public immutable granularity;
    // this is redundant with granularity and windowSize, but stored for gas savings &
    // informational purposes.
    uint256 public immutable periodSize;

    // list of price observations
    Observation[] public observations;

    constructor(
        address pool_,
        uint256 windowSize_,
        uint8 granularity_
    ) public {
        require(granularity_ > 1, "SlidingWindowOracle: GRANULARITY");
        require(
            (periodSize = windowSize_ / granularity_) * granularity_ ==
                windowSize_,
            "SlidingWindowOracle: WINDOW_NOT_EVENLY_DIVISIBLE"
        );
        pool = pool_;
        windowSize = windowSize_;
        granularity = granularity_;
    }

    // returns the index of the observation corresponding to the given timestamp
    function observationIndexOf(uint256 timestamp)
        public
        view
        returns (uint8 index)
    {
        uint256 epochPeriod = timestamp / periodSize;
        return uint8(epochPeriod % granularity);
    }

    // returns the observation from the oldest epoch (at the beginning of the window) relative to
    // the current time
    function _getFirstObservationInWindow()
        private
        view
        returns (Observation storage firstObservation)
    {
        uint8 observationIndex = observationIndexOf(block.timestamp);
        // no overflow issue. if observationIndex + 1 overflows, result is still zero.
        uint8 firstObservationIndex = (observationIndex + 1) % granularity;
        firstObservation = observations[firstObservationIndex];
    }

    // update the cumulative price for the observation at the current timestamp. each observation
    // is updated at most once per epoch period.
    function update() external {
        // populate the array with empty observations (first call only)
        for (uint256 i = observations.length; i < granularity; i++) {
            observations.push();
        }

        // get the observation for the current period
        uint8 observationIndex = observationIndexOf(block.timestamp);
        Observation storage observation = observations[observationIndex];

        // we only want to commit updates once per period (i.e. windowSize / granularity)
        uint256 timeElapsed = block.timestamp - observation.timestamp;
        if (timeElapsed > periodSize) {
            uint256 price = IMetaPool(pool).get_virtual_price();
            observation.timestamp = block.timestamp;
            observation.price = price;
        }
    }

    // given the cumulative prices of the start and end of a period, and the length of the period,
    //compute the average price in terms of how much amount out is received for the amount in
    function _computeAmountOut(
        uint256 priceStart,
        uint256 priceEnd,
        uint256 timeElapsed,
        uint256 amountIn
    ) private pure returns (uint256 amountOut) {
        // overflow is desired.
        FixedPoint.uq112x112 memory priceAverage =
            FixedPoint.uq112x112(
                uint224((priceEnd - priceStart) / timeElapsed)
            );
        amountOut = priceAverage.mul(amountIn).decode144();
    }

    // returns the amount out corresponding to the amount in for a given token using the moving
    // average over the time range [now - [windowSize, windowSize - periodSize * 2], now]
    // update must have been called for the bucket corresponding to timestamp `now - windowSize`
    function consult(uint256 amountIn)
        external
        view
        returns (uint256 amountOut)
    {
        Observation storage firstObservation = _getFirstObservationInWindow();

        uint256 timeElapsed = block.timestamp - firstObservation.timestamp;
        require(
            timeElapsed <= windowSize,
            "SlidingWindowOracle: MISSING_HISTORICAL_OBSERVATION"
        );
        // should never happen.
        require(
            timeElapsed >= windowSize - periodSize * 2,
            "SlidingWindowOracle: UNEXPECTED_TIME_ELAPSED"
        );

        uint256 price = IMetaPool(pool).get_virtual_price();

        return
            _computeAmountOut(
                firstObservation.price,
                price,
                timeElapsed,
                amountIn
            );
    }
}
