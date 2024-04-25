import { HardhatPluginHooks } from "./plugins.js";

/**
 * An interface with utilities to interact with hooks.
 *
 * This interface provides methods register/unregister hooks, fetching hooks
 * in the correct order, and run them in the most common execution patterns.
 */
export interface HookManager {
  /**
   * Returns an array of hooks in the right execution order. This means the
   * plugin hooks first, in the resolved plugins' order, followed by the
   * dynamically registerd hooks in registration order.
   */
  getHooks<
    HookCategoryNameT extends keyof HardhatPluginHooks,
    HookNameT extends keyof HardhatPluginHooks[HookCategoryNameT],
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
  ): Promise<Array<HardhatPluginHooks[HookCategoryNameT][HookNameT]>>;

  /**
   * Registers hooks in a category.
   */
  registerHooks<HookCategoryNameT extends keyof HardhatPluginHooks>(
    hookCategoryName: HookCategoryNameT,
    hookCategory: Partial<HardhatPluginHooks[HookCategoryNameT]>,
  ): void;

  /**
   * Removes previously registered hooks.
   */
  unregisterHooks<HookCategoryNameT extends keyof HardhatPluginHooks>(
    hookCategoryName: HookCategoryNameT,
    hookCategory: Partial<HardhatPluginHooks[HookCategoryNameT]>,
  ): void;

  /**
   * Runs hooks in a chained fashion, where the last hook (as returned by getHooks)
   * is called first, and can optionally call the next hook in the chain.
   *
   * For a hook to work with this method, it should look like
   *  `(arg1: Type1, ..., argN: TypeN, next: (a1: Type1, ..., aN: TypeN) => Promise<ReturnType>) => Promise<ReturnType>`
   *
   * Calling `next` will invoke the next hook in the chain. Note that `next`
   * must only be called once.
   *
   * @param hookCategoryName - The name of the category of the hook to run.
   * @param hookName - The name of the hook to run.
   * @param initialParams - The params to pass to the first hook in the chain.
   * @param defaultHandler - The last function to execute in the chain. This is also
   *   called if there are no hooks.
   * @returns The result of executing the chained hooks
   */
  runHooksChain<
    HookCategoryNameT extends keyof HardhatPluginHooks,
    HookNameT extends keyof HardhatPluginHooks[HookCategoryNameT],
    HookT extends HardhatPluginHooks[HookCategoryNameT][HookNameT],
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
    initialParams: ParametersExceptLast<HookT>,
    defaultHandler: LastParameter<HookT>,
  ): Promise<Awaited<Return<HookT>>>;

  /**
   * Runs all the hooks in the same order that `getHooks` returns them.
   *
   * @param hookCategoryName - The name of the category of the hook to run.
   * @param hookName - The name of the hook to run.
   * @param params - The params to pass to the hooks.
   */
  runHooksInOrder<
    HookCategoryNameT extends keyof HardhatPluginHooks,
    HookNameT extends keyof HardhatPluginHooks[HookCategoryNameT],
    HookT extends HardhatPluginHooks[HookCategoryNameT][HookNameT],
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
    params: Params<HookT>,
  ): Promise<Array<Awaited<Return<HookT>>>>;
}

/**
 * All the parameters of a function.
 */
export type Params<T> = T extends (...args: infer P) => any ? P : never;

/**
 * All the parameters of a function, except the last one.
 */
export type ParametersExceptLast<T> = T extends (
  ...args: [...infer P, any]
) => any
  ? P
  : never;

/**
 * The last parameter of a function.
 */
export type LastParameter<T> = T extends (
  ...args: [...infer _P, infer Last]
) => any
  ? Last
  : never;

export type Return<T> = T extends (...args: any[]) => infer Ret ? Ret : never;
