import { ConfigurationVariable } from "./api.js";

export function configVariable(name: string): ConfigurationVariable {
  return { _type: "ConfigurationVariable", name };
}
