import type EthersT from "ethers";
import type { Contract, Transaction } from "ethers";
import type { AssertWithSsfi, Ssfi } from "../utils";

import { AssertionError } from "chai";
import util from "util";

import { buildAssert } from "../utils";
import { ASSERTION_ABORTED, EMIT_MATCHER } from "./constants";
import { HardhatChaiMatchersAssertionError } from "./errors";
import { assertIsNotNull, preventAsyncMatcherChaining } from "./utils";

type EventFragment = EthersT.EventFragment;
type Provider = EthersT.Provider;
type AssertArgsArraysEqual = (
  context: any,
  Assertion: Chai.AssertionStatic,
  chaiUtils: Chai.ChaiUtils,
  expectedArgs: any[],
  log: any,
  assert: AssertWithSsfi,
  ssfi: Ssfi
) => void;

export const EMIT_CALLED = "emitAssertionCalled";

async function waitForPendingTransaction(
  tx: Promise<Transaction> | Transaction | string,
  provider: Provider
) {
  let hash: string | null;
  if (tx instanceof Promise) {
    ({ hash } = await tx);
  } else if (typeof tx === "string") {
    hash = tx;
  } else {
    ({ hash } = tx);
  }
  if (hash === null) {
    throw new Error(`${JSON.stringify(tx)} is not a valid transaction`);
  }
  return provider.getTransactionReceipt(hash);
}

export function supportEmit(
  Assertion: Chai.AssertionStatic,
  chaiUtils: Chai.ChaiUtils
) {
  Assertion.addMethod(
    EMIT_MATCHER,
    function (this: any, contract: Contract, eventName: string) {
      // capture negated flag before async code executes; see buildAssert's jsdoc
      const negated = this.__flags.negate;
      const tx = this._obj;

      preventAsyncMatcherChaining(this, EMIT_MATCHER, chaiUtils, true);

      const promise = this.then === undefined ? Promise.resolve() : this;

      const onSuccess = (receipt: EthersT.TransactionReceipt) => {
        // abort if the assertion chain was aborted, for example because
        // a `.not` was combined with a `.withArgs`
        if (chaiUtils.flag(this, ASSERTION_ABORTED) === true) {
          return;
        }

        const assert = buildAssert(negated, onSuccess);

        let eventFragment: EventFragment | null = null;
        try {
          eventFragment = contract.interface.getEvent(eventName);
        } catch (e) {
          // ignore error
        }

        if (eventFragment === null) {
          throw new AssertionError(
            `Event "${eventName}" doesn't exist in the contract`
          );
        }

        const topic = eventFragment.topicHash;
        const contractAddress = contract.target;
        if (typeof contractAddress !== "string") {
          throw new HardhatChaiMatchersAssertionError(
            `The contract target should be a string`
          );
        }
        this.logs = receipt.logs
          .filter((log) => log.topics.includes(topic))
          .filter(
            (log) => log.address.toLowerCase() === contractAddress.toLowerCase()
          );

        assert(
          this.logs.length > 0,
          `Expected event "${eventName}" to be emitted, but it wasn't`,
          `Expected event "${eventName}" NOT to be emitted, but it was`
        );
        chaiUtils.flag(this, "eventName", eventName);
        chaiUtils.flag(this, "contract", contract);
      };

      const derivedPromise = promise.then(() => {
        // abort if the assertion chain was aborted, for example because
        // a `.not` was combined with a `.withArgs`
        if (chaiUtils.flag(this, ASSERTION_ABORTED) === true) {
          return;
        }

        if (contract.runner === null || contract.runner.provider === null) {
          throw new HardhatChaiMatchersAssertionError(
            "contract.runner.provider shouldn't be null"
          );
        }

        return waitForPendingTransaction(tx, contract.runner.provider).then(
          (receipt) => {
            assertIsNotNull(receipt, "receipt");
            return onSuccess(receipt);
          }
        );
      });

      chaiUtils.flag(this, EMIT_CALLED, true);

      this.then = derivedPromise.then.bind(derivedPromise);
      this.catch = derivedPromise.catch.bind(derivedPromise);
      this.promise = derivedPromise;
      return this;
    }
  );
}

export async function emitWithArgs(
  context: any,
  Assertion: Chai.AssertionStatic,
  chaiUtils: Chai.ChaiUtils,
  expectedArgs: any[],
  ssfi: Ssfi,
  assertArgsArraysEqual: AssertArgsArraysEqual
) {
  const negated = false; // .withArgs cannot be negated
  const assert = buildAssert(negated, ssfi);

  tryAssertArgsArraysEqual(
    context,
    Assertion,
    chaiUtils,
    expectedArgs,
    context.logs,
    assert,
    ssfi,
    assertArgsArraysEqual
  );
}

const tryAssertArgsArraysEqual = (
  context: any,
  Assertion: Chai.AssertionStatic,
  chaiUtils: Chai.ChaiUtils,
  expectedArgs: any[],
  logs: any[],
  assert: AssertWithSsfi,
  ssfi: Ssfi,
  assertArgsArraysEqual: AssertArgsArraysEqual
) => {
  if (logs.length === 1)
    return assertArgsArraysEqual(
      context,
      Assertion,
      chaiUtils,
      expectedArgs,
      logs[0],
      assert,
      ssfi
    );
  for (const index in logs) {
    if (index === undefined) {
      break;
    } else {
      try {
        assertArgsArraysEqual(
          context,
          Assertion,
          chaiUtils,
          expectedArgs,
          logs[index],
          assert,
          ssfi
        );
        return;
      } catch {}
    }
  }
  const eventName = chaiUtils.flag(context, "eventName");
  assert(
    false,
    `The specified arguments (${util.inspect(
      expectedArgs
    )}) were not included in any of the ${
      context.logs.length
    } emitted "${eventName}" events`
  );
};
