import type { HardhatPlugin } from "./types/plugins.js";
import { z } from "zod";
import { validateUserConfig } from "./config/validation-utils.js";

const SolidityUserConfig = z.object({
  version: z.string(),
});

const HardhatUserConfig = z.object({
  solidity: z.optional(z.union([z.string(), SolidityUserConfig])),
});

export default {
  id: "builtin-functionality",
  hooks: {
    config: {
      validateUserConfig: async (config) => {
        return validateUserConfig(config, HardhatUserConfig);
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

        return resolvedConfig;
      },
    },
  },
  dependencies: [],
} satisfies HardhatPlugin;
