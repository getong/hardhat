import { HardhatConfig, HardhatUserConfig } from "./config.js";

// We add the plugins to the config type here
// to avoid a circular dependency and/or having
// a huge file with everything.
declare module "./config.js" {
  export interface HardhatUserConfig {
    plugins?: HardhatPlugin[];
  }

  export interface HardhatConfig {
    // The plugins in a topological order
    plugins: HardhatPlugin[];
  }
}

export interface HardhatPlugin {
  id: string;
  npmPackage?: string;
  hooks: HardhatPluginHooks;
  dependencies?: HardhatPlugin[];
}

export interface HardhatPluginHooks {
  config?: HardhatPluginConfigHooks | URL;
  userInterruption?: UserInterruptionsHooks | URL;
}

export interface HardhatPluginConfigHooks {
  extendUserConfig?: (
    config: HardhatUserConfig,
    next: (c: HardhatUserConfig) => Promise<HardhatUserConfig>,
  ) => Promise<HardhatUserConfig>;

  validateUserConfig?: (
    config: HardhatUserConfig,
  ) => Promise<HardhatUserConfigValidationError[]>;

  resolveUserConfig?: (
    config: HardhatUserConfig,
    next: (userConfig: HardhatUserConfig) => Promise<HardhatConfig>,
  ) => Promise<HardhatConfig>;
}

export interface HardhatUserConfigValidationError {
  path: Array<string | number>;
  message: string;
}

export interface UserInterruptionsHooks {
  displayMessage?: (
    message: string,
    requester: string,
    next: (m: string, r: string) => Promise<void>,
  ) => Promise<void>;

  requestInput?: (
    inputDescription: string,
    requester: string,
    next: (id: string, r: string) => Promise<string>,
  ) => Promise<string>;

  requestSecretInput?: (
    inputDescription: string,
    requester: string,
    next: (id: string, r: string) => Promise<string>,
  ) => Promise<string>;
}
