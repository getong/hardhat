import {
  ChainedHook,
  HookContext,
  HookManager,
  InitialHookParams as InitialHookParams,
  InitialChainedHookParams,
  HardhatHooks,
} from "../types/hooks.js";
import { HardhatPlugin } from "../types/plugins.js";
import { LastParameter, Return } from "../types/utils.js";
import builtinFunctionality from "./builtin-functionality.js";
import { validatePlugin } from "./plugins/plugin-validation.js";

export class HookManagerImplementation implements HookManager {
  readonly #plugins: HardhatPlugin[];

  readonly #validatedPlugins = new Set<string>();

  #context: HookContext | undefined;

  readonly #staticHookCategories: Map<
    string,
    Map<keyof HardhatHooks, Partial<HardhatHooks[keyof HardhatHooks]>>
  > = new Map();

  readonly #dynamicHookCategories: Map<
    keyof HardhatHooks,
    Array<Partial<HardhatHooks[keyof HardhatHooks]>>
  > = new Map();

  constructor(plugins: HardhatPlugin[]) {
    this.#plugins = plugins;
  }

  public setContext(context: HookContext): void {
    this.#context = context;
  }

  public async getHooks<
    HookCategoryNameT extends keyof HardhatHooks,
    HookNameT extends keyof HardhatHooks[HookCategoryNameT],
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
  ): Promise<Array<HardhatHooks[HookCategoryNameT][HookNameT]>> {
    const pluginHooks = await this.#getPluginHooks(hookCategoryName, hookName);

    const dynamicHooks = await this.#getDynamicHooks(
      hookCategoryName,
      hookName,
    );

    return [...pluginHooks, ...dynamicHooks];
  }

  public registerHooks<HookCategoryNameT extends keyof HardhatHooks>(
    hookCategoryName: HookCategoryNameT,
    hookCategory: Partial<HardhatHooks[HookCategoryNameT]>,
  ): void {
    let categories = this.#dynamicHookCategories.get(hookCategoryName);
    if (categories === undefined) {
      categories = [];
      this.#dynamicHookCategories.set(hookCategoryName, categories);
    }

    categories.push(hookCategory);
  }

  public unregisterHooks<HookCategoryNameT extends keyof HardhatHooks>(
    hookCategoryName: HookCategoryNameT,
    hookCategory: Partial<HardhatHooks[HookCategoryNameT]>,
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
    HookCategoryNameT extends keyof HardhatHooks,
    HookNameT extends keyof HardhatHooks[HookCategoryNameT],
    HookT extends ChainedHook<HardhatHooks[HookCategoryNameT][HookNameT]>,
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
    params: InitialChainedHookParams<HookCategoryNameT, HookT>,
    defaultImplementation: LastParameter<HookT>,
  ): Promise<Awaited<Return<HardhatHooks[HookCategoryNameT][HookNameT]>>> {
    console.log(
      `Running hook chain ${hookCategoryName}.${hookName.toString()}`,
    );

    const hooks = await this.getHooks(hookCategoryName, hookName);

    let hookParams: Parameters<typeof defaultImplementation>;
    if (hookCategoryName !== "config") {
      // TODO: assert that this.#context is not undefinded
      if (this.#context === undefined) {
        throw new Error(`Context must be set before running non-config hooks`);
      }

      hookParams = [this.#context, ...params] as any;
    } else {
      hookParams = params as any;
    }

    let index = hooks.length - 1;
    const next = async (...nextParams: typeof hookParams) => {
      console.log(`\t next#${index}`);

      const result =
        index >= 0
          ? await (hooks[index--] as any)(...nextParams, next)
          : await defaultImplementation(...nextParams);

      console.log(`\t result#${index}`, result);

      return result;
    };

    return next(...hookParams);
  }

  public async runHooksInOrder<
    HookCategoryNameT extends keyof HardhatHooks,
    HookNameT extends keyof HardhatHooks[HookCategoryNameT],
    HookT extends HardhatHooks[HookCategoryNameT][HookNameT],
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
    params: InitialHookParams<HookCategoryNameT, HookT>,
  ): Promise<
    Array<Awaited<Return<HardhatHooks[HookCategoryNameT][HookNameT]>>>
  > {
    const hooks = await this.getHooks(hookCategoryName, hookName);

    let hookParams: any;
    if (hookCategoryName !== "config") {
      // TODO: assert that this.#context is not undefinded
      if (this.#context === undefined) {
        throw new Error(`Context must be set before running non-config hooks`);
      }

      hookParams = [this.#context, ...params];
    } else {
      hookParams = params;
    }

    const result = [];
    for (const hook of hooks) {
      result.push(await (hook as any)(...hookParams));
    }

    return result;
  }

  async #getDynamicHooks<
    HookCategoryNameT extends keyof HardhatHooks,
    HookNameT extends keyof HardhatHooks[HookCategoryNameT],
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
  ): Promise<Array<HardhatHooks[HookCategoryNameT][HookNameT]>> {
    const hookCategories = this.#dynamicHookCategories.get(hookCategoryName) as
      | Array<Partial<HardhatHooks[HookCategoryNameT]>>
      | undefined;

    if (hookCategories === undefined) {
      return [];
    }

    return hookCategories.flatMap((hookCategory) => {
      return (hookCategory[hookName] ?? []) as Array<
        HardhatHooks[HookCategoryNameT][HookNameT]
      >;
    });
  }

  async #getPluginHooks<
    HookCategoryNameT extends keyof HardhatHooks,
    HookNameT extends keyof HardhatHooks[HookCategoryNameT],
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
  ): Promise<Array<HardhatHooks[HookCategoryNameT][HookNameT]>> {
    const hookCategories: Array<
      Partial<HardhatHooks[HookCategoryNameT]> | undefined
    > = await Promise.all(
      this.#plugins.map(async (plugin) => {
        const hookCategoryFactory = plugin.hooks?.[hookCategoryName];

        if (hookCategoryFactory === undefined) {
          return;
        }

        if (!this.#validatedPlugins.has(plugin.id)) {
          await validatePlugin(plugin);
          this.#validatedPlugins.add(plugin.id);
        }

        if (typeof hookCategoryFactory === "string") {
          const loadedHookCategory = await this.#loadHookCategory(
            plugin.id,
            hookCategoryName,
            hookCategoryFactory,
          );

          return loadedHookCategory as Partial<HardhatHooks[HookCategoryNameT]>;
        }

        // We don't print warning of inline hooks for the builtin functionality
        if (plugin.id !== builtinFunctionality.id) {
          console.warn(
            `WARNING: Inline hooks found in plugin "${plugin.id}", category "${hookCategoryName}". User paths in production.`,
          );
        }

        const category = await hookCategoryFactory();

        return category as Partial<HardhatHooks[HookCategoryNameT]>;
      }),
    );

    return hookCategories.flatMap((hookCategory) => {
      const hook = hookCategory?.[hookName];
      if (hook === undefined) {
        return [];
      }

      return hook as HardhatHooks[HookCategoryNameT][HookNameT];
    });
  }

  async #loadHookCategory<HookCategoryNameT extends keyof HardhatHooks>(
    pluginId: string,
    hookCategoryName: HookCategoryNameT,
    path: string,
  ): Promise<Partial<HardhatHooks[HookCategoryNameT]>> {
    if (!this.#staticHookCategories.has(pluginId)) {
      this.#staticHookCategories.set(pluginId, new Map());
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const pluginCategories = this.#staticHookCategories.get(pluginId)!;

    let category = pluginCategories.get(hookCategoryName) as
      | Partial<HardhatHooks[HookCategoryNameT]>
      | undefined;

    if (category === undefined) {
      const mod = await import(path);

      const factory = mod.default;

      // TODO: Assert that the factory is a function
      if (typeof factory !== "function") {
        throw new Error(`Source ${path} doesn't export a hooks factory`);
      }

      category = await factory();

      // TODO: Assert that category is not undefined and it's an object
      if (typeof category !== "object" || category === null) {
        throw new Error("Invalid category");
      }

      pluginCategories.set(hookCategoryName, category);
    }

    return category;
  }
}
