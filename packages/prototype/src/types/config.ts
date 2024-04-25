/**
 * A configuration variable to be resolved
 * at runtime.
 */
export interface ConfigurationVariable {
  _type: "ConfigurationVariable";
  name: string;
}

/**
 * A sensitive string, which can be provided as a literal
 * string or as a configuration variable.
 */
export type SensitiveString = string | ConfigurationVariable;

/**
 * The user's Hardhat configuration, as exported in their
 * config file.
 */
export interface HardhatUserConfig {
  solidity?: string | SolidityUserConfig;
  privateKey?: SensitiveString;
}

/**
 * The resolved Hardhat configuration.
 */
export interface HardhatConfig {
  solidity: SolidityConfig;
  privateKey?: SensitiveString;
}

/**
 * The solidity configuration as provided by the user.
 */
export interface SolidityUserConfig {
  version: string;
}

/**
 * The resolved solidity configuration.
 */
export interface SolidityConfig {
  version: string;
}
