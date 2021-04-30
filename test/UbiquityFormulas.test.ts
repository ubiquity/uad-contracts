/* eslint-disable @typescript-eslint/no-use-before-define */

import { expect } from "chai";
import { BigNumber } from "ethers";
import { UbiquityFormulas } from "../artifacts/types/UbiquityFormulas";
import { bondingSetup } from "./BondingSetup";

describe("UbiquityFormulas", () => {
  const one: BigNumber = BigNumber.from(10).pow(18); // one = 1 ether = 10^18
  const ten9: BigNumber = BigNumber.from(10).pow(9); // ten9 = 10^-9 ether = 10^9
  const zzz1: BigNumber = BigNumber.from(10).pow(15); // zzz1 = zerozerozero1 = 0.0001 ether = 10^15

  let ubiquityFormulas: UbiquityFormulas;

  before(async () => {
    ({ ubiquityFormulas } = await bondingSetup());
  });

  describe("durationMultiply", () => {
    it("durationMultiply of 0 should be 1", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment , @typescript-eslint/no-unsafe-call
      const mult = await ubiquityFormulas.durationMultiply(one, 0, zzz1);

      expect(mult).to.eq(one);
    });

    it("durationMultiply of 1 should be 1.001", async () => {
      // 1.001000000 * 10**18 = 10**9 * 1001000000
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(
        await ubiquityFormulas.durationMultiply(one, 1, zzz1)
      );
      const epsilon = ten9.mul(1001000000).sub(mult);

      // 10**-9 expected precision on following calculations
      expect(epsilon.div(ten9)).to.be.equal(0);
    });

    it("durationMultiply of 6 should be 1.014696938", async () => {
      // 1.014696938 * 10**18 = 10**9 * 1014696938
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(
        await ubiquityFormulas.durationMultiply(one, 6, zzz1)
      );
      const epsilon = ten9.mul(1014696938).sub(mult);

      expect(epsilon.div(ten9)).to.be.equal(0);
    });

    it("durationMultiply of 24 should be 1.117575507", async () => {
      // 1.117575507 * 10**18 = 10**9 * 1117575507
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(
        await ubiquityFormulas.durationMultiply(one, 24, zzz1)
      );
      const epsilon = ten9.mul(1117575507).sub(mult);

      expect(epsilon.div(ten9)).to.be.equal(0);
    });

    it("durationMultiply of 52 should be 1.374977332", async () => {
      // 1.3749773326 * 10**18 = 10**9 * 1374977332
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(
        await ubiquityFormulas.durationMultiply(one, 52, zzz1)
      );
      const epsilon = ten9.mul(1374977332).sub(mult);

      expect(epsilon.div(ten9)).to.be.equal(0);
    });

    it("durationMultiply of 520 should be 12.857824421", async () => {
      // 12.857824421 * 10**18 = 10**10 * 12857824421
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mult = BigNumber.from(
        await ubiquityFormulas.durationMultiply(one, 520, zzz1)
      );
      const epsilon = ten9.mul(12857824421).sub(mult);

      expect(epsilon.div(ten9)).to.be.equal(0);
    });
  });
});
