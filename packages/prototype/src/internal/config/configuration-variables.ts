import { ConfigurationVariable } from "../../types/config.js";
import { ConfigurationVariableResolver } from "../../types/configuration-variables.js";
import { HookManager } from "../../types/hooks.js";
import { UserInterruptionManager } from "../../types/user-interruptions.js";

export class ConfigurationVariableResolverImplementation
  implements ConfigurationVariableResolver
{
  readonly #userInterruptions: UserInterruptionManager;
  readonly #hooks: HookManager;

  constructor(userInterruptions: UserInterruptionManager, hooks: HookManager) {
    this.#userInterruptions = userInterruptions;
    this.#hooks = hooks;

    void this.#hooks;
  }

  public async resolve(
    variable: ConfigurationVariable | string,
  ): Promise<string> {
    if (typeof variable === "string") {
      return variable;
    }

    return this.#hooks.runHooksChain(
      "configurationVariables",
      "resolve",
      [this.#userInterruptions, variable],
      async (_i, v) => {
        const value = process.env[v.name];

        if (typeof value !== "string") {
          throw new Error("Variable not found");
        }

        return value;
      },
    );
  }
}
