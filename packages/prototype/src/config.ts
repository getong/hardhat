import { ConfigurationVariable } from "./api-extractor-entrypoint.js";

export function configVariable(name: string): ConfigurationVariable {
  return { _type: "ConfigurationVariable", name };
}
