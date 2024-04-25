import type { HardhatRuntimeEnvionment as IHardhatRuntimeEnvionment } from "./types/hre.js";
import { HardhatUserConfig, HardhatConfig } from "./types/config.js";
import { Hook, Hooks } from "./types/hooks.js";
import { HooksUtils } from "./hook-utils.js";
import builtinFunctionality from "./builtin-functionality.js";
import { reverseTopologicalSort } from "./plugins/sort.js";
import {
  HardhatPlugin,
  HardhatUserConfigValidationError,
} from "./types/plugins.js";
import { UserInterruptions } from "./types/user-interruptions.js";
import { UserInteractionsUtils } from "./user-interruptions.js";
import {
  ConfigurationVariableResolver,
  ConfigurationVariableResolverImplementation,
} from "./configuration-variables.js";

export class HardhatRuntimeEnvironment implements IHardhatRuntimeEnvionment {
  public static async create(
    config: HardhatUserConfig,
  ): Promise<HardhatRuntimeEnvironment> {
    // Clone with lodash or https://github.com/davidmarkclements/rfdc
    const clonedConfig = config;

    // Topological sort of plugins
    const sortedPlugins = reverseTopologicalSort([
      builtinFunctionality,
      ...(clonedConfig.plugins ?? []),
    ]);

    const hooks = new HooksUtils(sortedPlugins);
    const interruptions = new UserInteractionsUtils(hooks);
    const configVariables = new ConfigurationVariableResolverImplementation(
      interruptions,
      hooks,
    );

    // extend user config:
    const userConfig = await runUserConfigExtensions(hooks, clonedConfig);

    // validate config
    const userConfigValidationErrors = await validateUserConfig(
      hooks,
      userConfig,
    );

    if (userConfigValidationErrors.length > 0) {
      throw new Error(
        `Invalid config:\n\t${userConfigValidationErrors
          .map(
            (error) =>
              `* Config error in .${error.path.join(".")}: ${error.message}`,
          )
          .join("\n\t")}`,
      );
    }

    // Resolve config

    const resolvedConfig = await resolveUserConfig(
      hooks,
      sortedPlugins,
      config,
    );

    return new HardhatRuntimeEnvironment(
      userConfig,
      resolvedConfig,
      hooks,
      interruptions,
      configVariables,
    );
  }

  private constructor(
    public readonly userConfig: HardhatUserConfig,
    public readonly config: HardhatConfig,
    public readonly hooks: Hooks,
    public readonly interruptions: UserInterruptions,
    public readonly configVariables: ConfigurationVariableResolver,
  ) {}
}

export class T {
  readonly #f: number;

  private constructor(f: number) {
    this.#f = f;
    this.#foo();
    this.#bar();
  }

  #foo() {
    console.log(this.#f);
  }

  #bar() {}
}

async function runUserConfigExtensions(
  hooks: Hooks,
  config: HardhatUserConfig,
): Promise<HardhatUserConfig> {
  const extendUserConfigHooks = await hooks.getHooks(
    "config",
    "extendUserConfig",
  );

  let index = extendUserConfigHooks.length - 1;
  const next = async (userConfig: HardhatUserConfig) => {
    if (index >= 0) {
      return extendUserConfigHooks[index--](userConfig, next);
    }

    return userConfig;
  };

  return next(config);
}

async function validateUserConfig(
  hooks: Hooks,
  config: HardhatUserConfig,
): Promise<HardhatUserConfigValidationError[]> {
  const validateUserConfigHooks = await hooks.getHooks(
    "config",
    "validateUserConfig",
  );

  const hookResults = await Promise.all(
    validateUserConfigHooks.map(async (h) => h(config)),
  );

  return hookResults.flat(1);
}

async function resolveUserConfig(
  hooks: Hooks,
  sortedPlugins: HardhatPlugin[],
  config: HardhatUserConfig,
): Promise<HardhatConfig> {
  const initialResolvedConfig = {
    plugins: sortedPlugins,
  } as HardhatConfig;

  return hooks.runHooksChain(
    "config",
    "resolveUserConfig",
    [config],
    async (_) => {
      return initialResolvedConfig;
    },
  );
}
