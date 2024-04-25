import { ConfigurationVariable } from "./config.js";

/**
 * An interface to resolve configuration variables into their
 * actual values.
 */
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
   * @param variable - The configuration variable or string to resolve.
   * @returns The resolved value.
   */
  resolve(variable: ConfigurationVariable | string): Promise<string>;
}
