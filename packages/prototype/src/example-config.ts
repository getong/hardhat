import type { HardhatUserConfig } from "./types/config.js";
import hardhatFoo from "./example-plugins/hardhat-foo/index.js";
import { configVariable } from "./config.js";

export default {
  plugins: [hardhatFoo],
  solidity: "0.8.22",
  foo: {
    bar: 12,
  },
  privateKey: configVariable("PRIVATE_KEY"),
} satisfies HardhatUserConfig;
