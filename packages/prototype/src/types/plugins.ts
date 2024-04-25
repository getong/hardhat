import { HardhatConfig, HardhatUserConfig } from "./config.js";

// We add the plugins to the config with a module augmentation
// to keep everything plugin-related here, and at the same time
// to avoid a circular dependency and/or having
// a huge file with everything.
declare module "./config.js" {
  export interface HardhatUserConfig {
    plugins?: HardhatPlugin[];
  }

  export interface HardhatConfig {
    // The plugins in a topological order
    plugins: HardhatPlugin[];
  }
}

/**
 * A Hardhat plugin.
 */
export interface HardhatPlugin {
  /**
   * A unique id of the plugin.
   */
  id: string;

  /**
   * The npm package where the plugin is located, if any.
   */
  npmPackage?: string;

  /**
   * An object with the different hooks that this plugin defines.
   *
   * Each entry in this object is a a category of hooks, for example `"config"`
   * or `"userInterruption"`.
   *
   * You can define each category as an object with keys that are the hook
   * names, and values that are the hook implementations, but this way of
   * defining hooks is only for development.
   *
   * In production, you must use a `string` with the path to a file that
   * exports as `default` an object with the hook implementations.
   */
  hooks?: LazyLoadedOptionalHooks;

  /**
   * An arary of plugins that this plugins depends on.
   */
  dependencies?: HardhatPlugin[];
}

/**
 * An object with the different hook that a plugin can define.
 *
 * @see HardhatPlugin#hooks
 */
export type LazyLoadedOptionalHooks = {
  [K in keyof HardhatPluginHooks]?: Partial<HardhatPluginHooks[K]> | string;
};

/**
 * The different hooks that a plugin can define.
 */
export interface HardhatPluginHooks {
  config: HardhatPluginConfigHooks;
  userInterruption: UserInterruptionsHooks;
}

/**
 * The base interface for all hook categories.
 */
export interface HookCategory {
  [hookName: string]: (...any: any[]) => any;
}

/**
 * Config-related hooks.
 */
export interface HardhatPluginConfigHooks extends HookCategory {
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
    next: (userConfig: HardhatUserConfig) => Promise<HardhatConfig>,
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
 * User interruptions-related hooks.
 */
export interface UserInterruptionsHooks extends HookCategory {
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
    interruptor: string,
    message: string,
    next: (i: string, m: string) => Promise<void>,
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
    interruptor: string,
    inputDescription: string,
    next: (i: string, id: string) => Promise<string>,
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
    interruptor: string,
    inputDescription: string,
    next: (i: string, id: string) => Promise<string>,
  ) => Promise<string>;
}
