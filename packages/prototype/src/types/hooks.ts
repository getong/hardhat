import {
  ConfigurationVariable,
  HardhatConfig,
  HardhatUserConfig,
  ResolvedConfigurationVariable,
} from "./config.js";
import { UserInterruptionManager } from "./user-interruptions.js";
import {
  LastParameter,
  ParametersExceptFirst,
  ParametersExceptFirstAndLast,
  ParametersExceptLast,
  Params,
  Return,
} from "./utils.js";

/**
 * The context that is passed to hook implementations.
 */
export interface HookContext {
  readonly hooks: HookManager;
  readonly config: HardhatConfig;
  readonly interruptions: UserInterruptionManager;
}

/**
 * The different hooks that a plugin can define.
 */
export interface HardhatHooks {
  config: ConfigHooks;
  userInterruptions: UserInterruptionHooks;
  configurationVariables: ConfigurationVariableHooks;
}

/**
 * Config-related hooks.
 */
export interface ConfigHooks {
  /**
   * Provide an implementation of this hook to extend the user's config,
   * before any validation or resolution is done.
   *
   * @param config - The user's config.
   * @param next - A function to call to the next hook.
   * @returns The extended config.
   */
  extendUserConfig: (
    config: HardhatUserConfig,
    next: (c: HardhatUserConfig) => Promise<HardhatUserConfig>,
  ) => Promise<HardhatUserConfig>;

  /**
   * Provide an implementation of this hook to run validations on the user's
   * config.
   *
   * @param config - The user's config.
   * @returns An array of validation errors.
   */
  validateUserConfig: (
    config: HardhatUserConfig,
  ) => Promise<HardhatUserConfigValidationError[]>;

  /**
   * Provide an implementation of this hook to resolve parts of the user's
   * config into the final HardhatConfig.
   *
   * To use this hook, plugins are encouraged to call `next(config)` first,
   * and construct a resolved config based on its result. Note that While
   * that result is typed as `HardhatConfig`, it may actually be incomplete, as
   * other plugins may not have resolved their parts of the config yet.
   *
   * @param config - The user's config.
   * @param next - A function to call to the next hook.
   * @returns The resolved config.
   */
  resolveUserConfig: (
    config: HardhatUserConfig,
    resolveConfigurationVariable: (
      variableOrString: ConfigurationVariable | string,
    ) => ResolvedConfigurationVariable,
    next: (
      userConfig: HardhatUserConfig,
      nextResolveConfigurationVariable: (
        variableOrString: ConfigurationVariable | string,
      ) => ResolvedConfigurationVariable,
    ) => Promise<HardhatConfig>,
  ) => Promise<HardhatConfig>;
}

/**
 * A HardhatUser validation error.
 */
export interface HardhatUserConfigValidationError {
  path: Array<string | number>;
  message: string;
}

/**
 * Configuration variable-related hooks.
 */
export interface ConfigurationVariableHooks {
  /**
   * Provide an implementation of this hook to customize how to resolve
   * a configuration variable into its actual value.
   *
   * @param interruptions - A `UserInterruptionManager` that can be used to
   *  interact with the user.
   * @param variable - The configuration variable or string to resolve.
   * @param next - A function to call if the hook implementation decides to not
   *  handle the resolution of this variable.
   */
  resolve: (
    context: HookContext,
    variable: ConfigurationVariable,
    next: (
      nextContext: HookContext,
      nextVariable: ConfigurationVariable,
    ) => Promise<string>,
  ) => Promise<string>;
}

/**
 * User interruptions-related hooks.
 */
export interface UserInterruptionHooks {
  /**
   * Provide an implementation of this hook to customize how the
   * `UserInterruptionManager` displays messages to the user.
   *
   *
   * @see UserInterruptionManager#displayMessage to understand when the returned
   *  promise should be resolved.
   * @param interruptor - A name or description of the module trying to display
   *  the message.
   * @param message - The message to display.
   * @param next - A function to call if the hook implementation decides to not
   *  handle the message.
   */
  displayMessage: (
    context: HookContext,
    interruptor: string,
    message: string,
    next: (
      nextContext: HookContext,
      nextInterruptor: string,
      nextMesage: string,
    ) => Promise<void>,
  ) => Promise<void>;

  /**
   * Provide an implementation of this hook to customize how the
   * `UserInterruptionManager` requests input from the user.
   *
   * @param interruptor - A name or description of the module trying to request
   *  input form the user.
   * @param inputDescription - A description of the input that is being
   *  requested.
   * @param next - A function to call if the hook implementation decides to not
   *  handle the input request.
   */
  requestInput: (
    nextContext: HookContext,
    interruptor: string,
    inputDescription: string,
    next: (
      nextContext: HookContext,
      nextInterruptor: string,
      nextInputDescription: string,
    ) => Promise<string>,
  ) => Promise<string>;

  /**
   * Provide an implementation of this hook to customize how the
   * `UserInterruptionManager` requests a secret input from the user.
   *
   * Note that your implementation of this hook should take care of to
   * not display the user's input in the console, and not leak it in any way.
   *
   * @param interruptor - A name or description of the module trying to request
   *  input form the user.
   * @param inputDescription - A description of the input that is being
   *  requested.
   * @param next - A function to call if the hook implementation decides to not
   *  handle the input request.
   */
  requestSecretInput: (
    nextContext: HookContext,
    interruptor: string,
    inputDescription: string,
    next: (
      nextContext: HookContext,
      nextInterruptor: string,
      nextInputDescription: string,
    ) => Promise<string>,
  ) => Promise<string>;
}

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
    HookCategoryNameT extends keyof HardhatHooks,
    HookNameT extends keyof HardhatHooks[HookCategoryNameT],
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
  ): Promise<Array<HardhatHooks[HookCategoryNameT][HookNameT]>>;

  /**
   * Registers hooks in a category.
   */
  registerHooks<HookCategoryNameT extends keyof HardhatHooks>(
    hookCategoryName: HookCategoryNameT,
    hookCategory: Partial<HardhatHooks[HookCategoryNameT]>,
  ): void;

  /**
   * Removes previously registered hooks.
   */
  unregisterHooks<HookCategoryNameT extends keyof HardhatHooks>(
    hookCategoryName: HookCategoryNameT,
    hookCategory: Partial<HardhatHooks[HookCategoryNameT]>,
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
   * @param defaultImplementation - The last function to execute in the chain. This is also
   *   called if there are no hooks.
   * @returns The result of executing the chained hooks
   */
  runHooksChain<
    HookCategoryNameT extends keyof HardhatHooks,
    HookNameT extends keyof HardhatHooks[HookCategoryNameT],
    HookT extends ChainedHook<HardhatHooks[HookCategoryNameT][HookNameT]>,
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
    initialParams: InitialChainedHookParams<HookCategoryNameT, HookT>,
    defaultImplementation: LastParameter<HookT>,
  ): Promise<Awaited<Return<HookT>>>;

  /**
   * Runs all the hooks in the same order that `getHooks` returns them.
   *
   * @param hookCategoryName - The name of the category of the hook to run.
   * @param hookName - The name of the hook to run.
   * @param params - The params to pass to the hooks.
   */
  runHooksInOrder<
    HookCategoryNameT extends keyof HardhatHooks,
    HookNameT extends keyof HardhatHooks[HookCategoryNameT],
    HookT extends HardhatHooks[HookCategoryNameT][HookNameT],
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
    params: InitialHookParams<HookCategoryNameT, HookT>,
  ): Promise<Array<Awaited<Return<HookT>>>>;
}

/**
 * Utility to get a type only if A and B are equal.
 */
export type IfEqual<A, B, Result> = [A] extends [B]
  ? [B] extends [A]
    ? Result
    : never
  : never;

/**
 * A chained hook or never.
 */
export type ChainedHook<HookT> = HookT extends (
  ...params: [
    ...infer ParamsT,
    next: (...paramasNext: infer NextParamsT) => infer NextRetT,
  ]
) => infer RetT
  ? IfEqual<ParamsT, NextParamsT, IfEqual<RetT, NextRetT, HookT>>
  : never;

/**
 * The intial parameters to run a chain of hooks.
 */
export type InitialChainedHookParams<
  HookCategoryNameT extends keyof HardhatHooks,
  HookT,
> = HookCategoryNameT extends "config"
  ? ParametersExceptLast<HookT>
  : ParametersExceptFirstAndLast<HookT>;

/**
 * The intial parameters to run a chain of hooks.
 */
export type InitialHookParams<
  HookCategoryNameT extends keyof HardhatHooks,
  HookT,
> = HookCategoryNameT extends "config"
  ? Params<HookT>
  : ParametersExceptFirst<HookT>;
