import { ConfigurationVariableHooks } from "../../../types/hooks.js";

export default async () => {
  const hooks: Partial<ConfigurationVariableHooks> = {
    resolve: async (context, variable, _next) => {
      console.trace("Resolving variable", context, variable);
      return context.interruptions.requestSecretInput(
        "Plugin that overrides the config vars resolution",
        variable.name,
      );
    },
  };

  return hooks;
};
