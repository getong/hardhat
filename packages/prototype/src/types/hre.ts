import { HardhatConfig, HardhatUserConfig } from "../types/config.js";
import { ConfigurationVariableResolver } from "./configuration-variables.js";
import { HookManager } from "./hooks.js";
import { UserInterruptionManager } from "./user-interruptions.js";

/**
 * The Hardhat Runtime Environment (HRE) is an object that exposes
 * all the functionality available through Hardhat.
 */
export interface HardhatRuntimeEnvironment {
  readonly userConfig: HardhatUserConfig;
  readonly config: HardhatConfig;
  readonly hooks: HookManager;
  readonly interruptions: UserInterruptionManager;
  readonly configVariables: ConfigurationVariableResolver;

  // Network
  // Build system
  // Task runner
}
