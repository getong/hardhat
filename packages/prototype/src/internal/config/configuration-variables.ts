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

    const password = await this.#userInterruptions.requestSecretInput(
      "Encryption password",
      "Configuration variables",
    );

    void password;

    return "foo";
  }
}
