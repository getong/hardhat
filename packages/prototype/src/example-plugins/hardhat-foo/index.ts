import { HardhatPlugin } from "../../types/plugins.js";
import "./type-extensions.js";

export default {
  id: "hardhat-foo",
  hookHandlers: {
    config: new URL("./hookHandlers/config.js", import.meta.url).toString(),
    configurationVariables: new URL(
      "./hookHandlers/configurationVariables.js",
      import.meta.url,
    ).toString(),
  },
} satisfies HardhatPlugin;
