export interface ConfigurationVariable {
  _type: "ConfigurationVariable";
  name: string;
}

export type SensitiveString = string | ConfigurationVariable;

export interface HardhatUserConfig {
  solidity?: string | SolidityUserConfig;
  privateKey?: SensitiveString;
}

export interface HardhatConfig {
  solidity: SolidityConfig;
  privateKey: SensitiveString;
}

export interface SolidityUserConfig {
  version: string;
}

export interface SolidityConfig {
  version: string;
}
