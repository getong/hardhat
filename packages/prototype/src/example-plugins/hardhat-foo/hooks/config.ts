import { z } from "zod";
import { validateUserConfigZodType } from "../../../internal/config/validation-utils.js";
import { ConfigHooks } from "../../../types/hooks.js";

export default async () => {
  const fooUserConfigType = z.object({
    bar: z.optional(z.union([z.number(), z.array(z.number())])),
  });

  const hardhatUserConfig = z.object({
    foo: z.optional(fooUserConfigType),
  });

  const hooks: Partial<ConfigHooks> = {
    validateUserConfig: async (userConfig) => {
      return validateUserConfigZodType(userConfig, hardhatUserConfig);
    },
    resolveUserConfig: async (
      userConfig,
      resolveConfigurationVariable,
      next,
    ) => {
      const resolvedConfig = await next(
        userConfig,
        resolveConfigurationVariable,
      );

      const bar = userConfig.foo?.bar ?? [42];

      return {
        ...resolvedConfig,
        foo: {
          ...resolvedConfig.foo,
          bar: typeof bar === "number" ? [bar] : bar,
        },
      };
    },
  };

  return hooks;
};
