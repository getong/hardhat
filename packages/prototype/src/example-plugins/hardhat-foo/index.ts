import { HardhatPlugin } from "../../types/plugins.js";
import "./type-extensions.js";

export default {
  id: "hardhat-foo",
  hooks: {
    config: new URL("./hooks/config.js", import.meta.url).toString(),
    configurationVariables: new URL(
      "./hooks/configurationVariables.js",
      import.meta.url,
    ).toString(),
    hre: async () => ({
      created: async (_context, _hre) => {
        console.log("HRE created");
      },
    }),
  },
} satisfies HardhatPlugin;
