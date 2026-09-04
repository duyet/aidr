import "./preview-shim.js";
import { applyAppearance, loadSettings } from "./settings.js";
import { watchStoreUpdates } from "./update.js";

watchStoreUpdates();

const settings = await loadSettings();
applyAppearance(settings);
