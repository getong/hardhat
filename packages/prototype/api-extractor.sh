#!/usr/bin/env bash
cat <<EOF > src/api-extractor-entrypoint.ts
export * from "./index.js";
export type * from "./index.js";

export type * from "./types/config.js";
export type * from "./types/hooks.js";
export type * from "./types/hre.js";
export type * from "./types/plugins.js";
export type * from "./types/user-interruptions.js";
export type * from "./types/utils.js";

export * from "./config.js";
export type * from "./config.js";

export * from "./internal/builtin-functionality.js";
export type * from "./internal/builtin-functionality.js";
EOF

pnpm tsc || rm src/api-extractor-entrypoint.ts
pnpm api-extractor run || rm src/api-extractor-entrypoint.ts
rm src/api-extractor-entrypoint.ts
rm -rf temp
