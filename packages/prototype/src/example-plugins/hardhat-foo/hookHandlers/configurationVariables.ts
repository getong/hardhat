import { ConfigurationVariableHooks } from "../../../types/hooks.js";

export default async () => {
  const handlers: Partial<ConfigurationVariableHooks> = {
    resolve: async (context, variable, _next) => {
      return context.interruptions.requestSecretInput(
        "Plugin that overrides the config vars resolution",
        variable.name,
      );
    },
  };

  return handlers;
};
