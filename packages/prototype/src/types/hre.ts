import { ConfigurationVariableResolver } from "../configuration-variables.js";
import { HardhatConfig, HardhatUserConfig } from "../types/config.js";
import { Hooks } from "./hooks.js";
import { UserInterruptions } from "./user-interruptions.js";

export interface HardhatRuntimeEnvionment {
  readonly userConfig: HardhatUserConfig;
  readonly config: HardhatConfig;
  readonly hooks: Hooks;
  readonly interruptions: UserInterruptions;
  readonly configVariables: ConfigurationVariableResolver;

  // Network
  // Build system
  // Task runner
}
