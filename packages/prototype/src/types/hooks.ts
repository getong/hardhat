import { HardhatPlugin } from "./plugins.js";

export type HookCategoryName = keyof HardhatPlugin["hooks"];

export type HookCategory<HookCategoryNameT extends HookCategoryName> = Exclude<
  HardhatPlugin["hooks"][HookCategoryNameT],
  undefined | URL
>;

export type HookName<HookCategoryNameT extends HookCategoryName> =
  keyof HookCategory<HookCategoryNameT>;

export type Hook<
  HookCategoryNameT extends HookCategoryName,
  HookNameT extends HookName<HookCategoryNameT>,
> = HookCategory<HookCategoryNameT>[HookNameT];

export interface Hooks {
  getHooks<
    HookCategoryNameT extends HookCategoryName,
    HookNameT extends HookName<HookCategoryNameT>,
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
  ): Promise<Array<Hook<HookCategoryNameT, HookNameT>>>;

  registerHooks<HookCategoryNameT extends HookCategoryName>(
    hookCategoryName: HookCategoryNameT,
    hookCategory: HookCategory<HookCategoryNameT>,
  ): void;

  unregisterHooks<HookCategoryNameT extends HookCategoryName>(
    hookCategoryName: HookCategoryNameT,
    hookCategory: HookCategory<HookCategoryNameT>,
  ): void;

  runHooksChain<
    HookCategoryNameT extends HookCategoryName,
    HookNameT extends HookName<HookCategoryNameT>,
    HookT extends Hook<HookCategoryNameT, HookNameT>,
  >(
    hookCategoryName: HookCategoryNameT,
    hookName: HookNameT,
    initialParams: ParametersExceptLast<HookT>,
    defaultHandler: LastParameter<HookT>,
  ): Promise<Awaited<ReturnType<HookT>>>;
}

type ParametersExceptLast<T extends (...args: any[]) => any> =
  Parameters<T> extends [...infer Params, any] ? Params : never;

type LastParameter<T extends (...args: any[]) => Promise<any>> =
  Parameters<T> extends [...infer _, infer Last] ? Last : never;
