import { HardhatHooks } from "./hooks.js";

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
  hooks?: LazyLoadedHookCategoryFactories;

  /**
   * An arary of plugins that this plugins depends on.
   */
  dependencies?: HardhatPlugin[];
}

/**
 * An object with the factories for the different hook categories that a plugin can define.
 *
 * @see HardhatPlugin#hooks
 */
export type LazyLoadedHookCategoryFactories = {
  [HookCategoryNameT in keyof HardhatHooks]?:
    | HookCategoryFactory<HookCategoryNameT>
    | string;
};

export type HookCategoryFactory<CategoryNameT extends keyof HardhatHooks> =
  () => Promise<Partial<HardhatHooks[CategoryNameT]>>;
