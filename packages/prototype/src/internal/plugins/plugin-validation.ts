import { HardhatPlugin } from "../../types/plugins.js";

export async function validatePlugin(_plugin: HardhatPlugin) {
  // If it has an npm package, validate their peer dependencies
  // If any is missing, throw
}
