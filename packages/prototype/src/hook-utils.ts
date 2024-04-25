import builtinFunctionality from "./builtin-functionality.js";
import {
  Hook,
  HookCategory,
  HookCategoryName,
  HookName,
  Hooks,
} from "./types/hooks.js";
import { HardhatPlugin } from "./types/plugins.js";
import { validatePlugin } from "./plugins/plugin-validation.js";

export class HooksUtils implements Hooks {
  readonly #plugins: HardhatPlugin[];

  readonly #visitedPlugins = new Set<string>();

  readonly #dynamicHookCategories: Map<
    HookCategoryName,
    Array<HookCategory<HookCategoryName>>
  > = new Map();

  constructor(plugins: HardhatPlugin[]) {
    this.#plugins = plugins;
  }

  public async getHooks<
    HookCategoryNameT extends HookCategoryName,
    HookNameT extends HookName<HookCategoryNameT>,
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
  ): Promise<Array<Hook<HookCategoryNameT, HookNameT>>> {
    const pluginHooks = await getPluginHooks(
      this.#plugins,
      this.#visitedPlugins,
      hookCategoryName,
      hookName,
    );

    const dynamicHooks = await getDynamicHooks(
      this.#dynamicHookCategories,
      hookCategoryName,
      hookName,
    );

    return [...pluginHooks, ...dynamicHooks];
  }

  public registerHooks<HookCategoryNameT extends HookCategoryName>(
    hookCategoryName: HookCategoryNameT,
    hookCategory: HookCategory<HookCategoryNameT>,
  ): void {
    let categories = this.#dynamicHookCategories.get(hookCategoryName);
    if (categories === undefined) {
      categories = [];
      this.#dynamicHookCategories.set(hookCategoryName, categories);
    }

    categories.push(hookCategory);
  }

  public unregisterHooks<HookCategoryNameT extends HookCategoryName>(
    hookCategoryName: HookCategoryNameT,
    hookCategory: HookCategory<HookCategoryNameT>,
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
}

async function getDynamicHooks<
  HookCategoryNameT extends HookCategoryName,
  HookNameT extends HookName<HookCategoryNameT>,
>(
  dynamicHookCategories: ReadonlyMap<
    HookCategoryName,
    Array<HookCategory<HookCategoryName>>
  >,
  hookCategoryName: HookCategoryNameT,
  hookName: HookNameT,
): Promise<Array<Hook<HookCategoryNameT, HookNameT>>> {
  const hookCategories = dynamicHookCategories.get(hookCategoryName) as
    | Array<HookCategory<HookCategoryNameT>>
    | undefined;

  if (hookCategories === undefined) {
    return [];
  }

  return hookCategories.flatMap((hookCategory) => {
    return (hookCategory[hookName] ?? []) as Array<
      Hook<HookCategoryNameT, HookNameT>
    >;
  });
}

async function getPluginHooks<
  HookCategoryNameT extends HookCategoryName,
  HookNameT extends HookName<HookCategoryNameT>,
>(
  plugins: HardhatPlugin[],
  validatedPlugins: Set<string>,
  hookCategoryName: HookCategoryNameT,
  hookName: HookNameT,
): Promise<Array<Hook<HookCategoryNameT, HookNameT>>> {
  const hookCategories: Array<HookCategory<HookCategoryNameT> | undefined> =
    await Promise.all(
      plugins.map(async (plugin) => {
        const hookCategory = plugin.hooks[hookCategoryName];

        if (hookCategory === undefined) {
          return;
        }

        await validatePlugin(validatedPlugins, plugin);

        if (hookCategory instanceof URL) {
          const loadedHookCategory = await loadHookCategory(hookCategory);

          return loadedHookCategory as HookCategory<HookCategoryNameT>;
        }

        // We don't print warning of inline hooks for the builtin functionality
        if (plugin.id !== builtinFunctionality.id) {
          console.error(
            `WARNING: Inline hooks found in plugin "${plugin.id}", category "${hookCategoryName}". User URLs in production.`,
          );
        }

        return hookCategory as HookCategory<HookCategoryNameT>;
      }),
    );

  return hookCategories.flatMap((hookCategory) => {
    const hook = hookCategory?.[hookName];
    if (hook === undefined) {
      return [];
    }

    return hook as Hook<HookCategoryNameT, HookNameT>;
  });
}

async function loadHookCategory(url: URL): Promise<unknown> {
  const mod = await import(url.toString());

  const obj = mod.default;

  if (obj === undefined || obj === null || Object.keys(obj).length === 0) {
    throw new Error(`Source ${url.toString()} doesn't export hooks`);
  }

  return obj;
}

export async function runHooksChain<
  HookT extends (...args: any[]) => Promise<any>,
>(
  hooks: HookT[],
  initialParams: ParametersExceptLast<HookT>,
  defaultHandler: LastParameter<HookT>,
): Promise<Awaited<ReturnType<HookT>>> {
  if (typeof defaultHandler !== "function") {
    throw new Error("Default handler must be a function");
  }

  let index = hooks.length - 1;
  const next = async (...params: typeof initialParams) => {
    if (index >= 0) {
      return hooks[index--](...params, next);
    }

    return defaultHandler(...params);
  };

  return next(...initialParams);
}

type ParametersExceptLast<T extends (...args: any[]) => any> =
  Parameters<T> extends [...infer Params, any] ? Params : never;

type LastParameter<T extends (...args: any[]) => Promise<any>> =
  Parameters<T> extends [...infer _, infer Last] ? Last : never;
