import type { HardhatUserConfig } from "./types/config.js";
import hardhatFoo from "./example-plugins/hardhat-foo/index.js";

export default {
  plugins: [hardhatFoo],
  solidity: "0.8.22",
  foo: {
    bar: 12,
  },
  privateKey: "asd",
} satisfies HardhatUserConfig;
