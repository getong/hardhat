import type { HardhatPlugin } from "../types/plugins.js";
import { z } from "zod";
import {
  SensitiveStringType,
  validateUserConfigZodType,
} from "./config/validation-utils.js";

const SolidityUserConfig = z.object({
  version: z.string(),
});

const HardhatUserConfig = z.object({
  solidity: z.optional(z.union([z.string(), SolidityUserConfig])),
  privateKey: z.optional(SensitiveStringType),
});

export default {
  id: "builtin-functionality",
  hooks: {
    config: {
      validateUserConfig: async (config) => {
        return validateUserConfigZodType(config, HardhatUserConfig);
      },
      resolveUserConfig: async (userConfig, next) => {
        const resolvedConfig = await next(userConfig);

        const version =
          typeof userConfig.solidity === "string"
            ? userConfig.solidity
            : userConfig.solidity?.version ?? "0.8.2";

        resolvedConfig.solidity = {
          ...resolvedConfig.solidity,
          version,
        };

        resolvedConfig.privateKey = userConfig.privateKey;

        return resolvedConfig;
      },
    },
    hre: {
      created: async (hre) => {
        let configVariablesStore: Record<string, string> | undefined;

        hre.hooks.registerHooks("configurationVariables", {
          resolve: async (interruptions, variable, _next) => {
            if (configVariablesStore === undefined) {
              const password = await interruptions.requestSecretInput(
                "Configuration variables",
                "Encryption password",
              );

              void password;
              configVariablesStore = {
                [variable.name]: `decrypted value of ${variable.name} with password "${password}"`,
              };
            }

            return configVariablesStore[variable.name];
          },
        });
      },
    },
  },
  dependencies: [],
} satisfies HardhatPlugin;
