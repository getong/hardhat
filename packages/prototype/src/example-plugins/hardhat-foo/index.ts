import { HardhatPlugin } from "../../types/plugins.js";
import "./type-extensions.js";

export default {
  id: "hardhat-foo",
  hooks: {
    config: new URL("./hooks/config.js", import.meta.url).toString(),
    hre: {
      created: async (hre) => {
        hre.hooks.registerHooks("configurationVariables", {
          resolve: async (interruptions, variable, _next) => {
            return interruptions.requestSecretInput(
              "Plugin that overrides the config vars resolution",
              variable.name,
            );
          },
        });
      },
    },
  },
} satisfies HardhatPlugin;
