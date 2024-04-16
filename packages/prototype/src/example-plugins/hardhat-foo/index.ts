import { HardhatPlugin } from "../../types/plugins.js";
import "./type-extensions.js";

export default {
  id: "hardhat-foo",
  hooks: {
    config: new URL("./hooks/config.js", import.meta.url),
  },
} satisfies HardhatPlugin;
