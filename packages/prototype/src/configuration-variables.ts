import { ConfigurationVariable } from "./types/config.js";
import { Hooks } from "./types/hooks.js";
import { UserInterruptions } from "./types/user-interruptions.js";

export interface ConfigurationVariableResolver {
  /**
   * Resolves a configuration variable into a string.
   *
   * If the variable is a string, it will be resolved to that
   * same string.
   *
   * If the variable is a ConfigurationVariable, it will be
   * resolved to the value it represents.
   *
   * @param variable The configuration variable or string to resolve.
   * @returns The resolved value.
   */
  resolve(variable: ConfigurationVariable | string): Promise<string>;
}

export class ConfigurationVariableResolverImplementation
  implements ConfigurationVariableResolver
{
  readonly #userInterruptions: UserInterruptions;
  readonly #hooks: Hooks;

  constructor(userInterruptions: UserInterruptions, hooks: Hooks) {
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
