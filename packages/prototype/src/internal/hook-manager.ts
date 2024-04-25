import {
  HookManager,
  LastParameter,
  ParametersExceptLast,
} from "../types/hooks.js";
import { HardhatPlugin, HardhatPluginHooks } from "../types/plugins.js";
import builtinFunctionality from "./builtin-functionality.js";
import { validatePlugin } from "./plugins/plugin-validation.js";

export class HookManagerImplementation implements HookManager {
  readonly #plugins: HardhatPlugin[];

  readonly #validatedPlugins = new Set<string>();

  readonly #dynamicHookCategories: Map<
    keyof HardhatPluginHooks,
    Array<Partial<HardhatPluginHooks[keyof HardhatPluginHooks]>>
  > = new Map();

  constructor(plugins: HardhatPlugin[]) {
    this.#plugins = plugins;
  }

  public async getHooks<
    HookCategoryNameT extends keyof HardhatPluginHooks,
    HookNameT extends keyof HardhatPluginHooks[HookCategoryNameT],
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
  ): Promise<Array<HardhatPluginHooks[HookCategoryNameT][HookNameT]>> {
    const pluginHooks = await this.#getPluginHooks(hookCategoryName, hookName);

    const dynamicHooks = await this.#getDynamicHooks(
      hookCategoryName,
      hookName,
    );

    return [...pluginHooks, ...dynamicHooks];
  }

  public registerHooks<HookCategoryNameT extends keyof HardhatPluginHooks>(
    hookCategoryName: HookCategoryNameT,
    hookCategory: Partial<HardhatPluginHooks[HookCategoryNameT]>,
  ): void {
    let categories = this.#dynamicHookCategories.get(hookCategoryName);
    if (categories === undefined) {
      categories = [];
      this.#dynamicHookCategories.set(hookCategoryName, categories);
    }

    categories.push(hookCategory);
  }

  public unregisterHooks<HookCategoryNameT extends keyof HardhatPluginHooks>(
    hookCategoryName: HookCategoryNameT,
    hookCategory: Partial<HardhatPluginHooks[HookCategoryNameT]>,
  ): void {
    const categories = this.#dynamicHookCategories.get(hookCategoryName);
    if (categories === undefined) {
      return;
    }

    this.#dynamicHookCategories.set(
      hookCategoryName,
      categories.filter((c) => c !== hookCategory),
    );
  }

  public async runHooksChain<
    HookCategoryNameT extends keyof HardhatPluginHooks,
    HookNameT extends keyof HardhatPluginHooks[HookCategoryNameT],
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
    initialParams: ParametersExceptLast<
      HardhatPluginHooks[HookCategoryNameT][HookNameT]
    >,
    defaultHandler: LastParameter<
      HardhatPluginHooks[HookCategoryNameT][HookNameT]
    >,
  ): Promise<
    Awaited<ReturnType<HardhatPluginHooks[HookCategoryNameT][HookNameT]>>
  > {
    if (typeof defaultHandler !== "function") {
      throw new Error("Default handler must be a function");
    }

    const hooks = await this.getHooks(hookCategoryName, hookName);

    let index = hooks.length - 1;
    const next = async (...params: typeof initialParams) => {
      if (index >= 0) {
        return hooks[index--](...params, next);
      }

      return defaultHandler(...params);
    };

    return next(...initialParams);
  }

  public async runHooksInParallel<
    HookCategoryNameT extends keyof HardhatPluginHooks,
    HookNameT extends keyof HardhatPluginHooks[HookCategoryNameT],
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
    params: Parameters<HardhatPluginHooks[HookCategoryNameT][HookNameT]>,
  ): Promise<
    Array<Awaited<ReturnType<HardhatPluginHooks[HookCategoryNameT][HookNameT]>>>
  > {
    const hooks = await this.getHooks(hookCategoryName, hookName);

    return Promise.all(hooks.map((hook) => hook(...params)));
  }

  async #getDynamicHooks<
    HookCategoryNameT extends keyof HardhatPluginHooks,
    HookNameT extends keyof HardhatPluginHooks[HookCategoryNameT],
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
  ): Promise<Array<HardhatPluginHooks[HookCategoryNameT][HookNameT]>> {
    const hookCategories = this.#dynamicHookCategories.get(hookCategoryName) as
      | Array<Partial<HardhatPluginHooks[HookCategoryNameT]>>
      | undefined;

    if (hookCategories === undefined) {
      return [];
    }

    return hookCategories.flatMap((hookCategory) => {
      return (hookCategory[hookName] ?? []) as Array<
        HardhatPluginHooks[HookCategoryNameT][HookNameT]
      >;
    });
  }

  async #getPluginHooks<
    HookCategoryNameT extends keyof HardhatPluginHooks,
    HookNameT extends keyof HardhatPluginHooks[HookCategoryNameT],
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
  ): Promise<Array<HardhatPluginHooks[HookCategoryNameT][HookNameT]>> {
    const hookCategories: Array<
      Partial<HardhatPluginHooks[HookCategoryNameT]> | undefined
    > = await Promise.all(
      this.#plugins.map(async (plugin) => {
        const hookCategory = plugin.hooks?.[hookCategoryName];

        if (hookCategory === undefined) {
          return;
        }

        if (!this.#validatedPlugins.has(plugin.id)) {
          await validatePlugin(plugin);
          this.#validatedPlugins.add(plugin.id);
        }

        if (typeof hookCategory === "string") {
          const loadedHookCategory = await this.#loadHookCategory(hookCategory);

          return loadedHookCategory as Partial<
            HardhatPluginHooks[HookCategoryNameT]
          >;
        }

        // We don't print warning of inline hooks for the builtin functionality
        if (plugin.id !== builtinFunctionality.id) {
          console.warn(
            `WARNING: Inline hooks found in plugin "${plugin.id}", category "${hookCategoryName}". User paths in production.`,
          );
        }

        return hookCategory as Partial<HardhatPluginHooks[HookCategoryNameT]>;
      }),
    );

    return hookCategories.flatMap((hookCategory) => {
      const hook = hookCategory?.[hookName];
      if (hook === undefined) {
        return [];
      }

      return hook as HardhatPluginHooks[HookCategoryNameT][HookNameT];
    });
  }

  async #loadHookCategory(path: string): Promise<unknown> {
    const mod = await import(path);

    const obj = mod.default;

    if (obj === undefined || obj === null || Object.keys(obj).length === 0) {
      throw new Error(`Source ${path} doesn't export hooks`);
    }

    return obj;
  }
}
