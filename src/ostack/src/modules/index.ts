import { gtm } from "./gtm/index.js";
import type { ModuleCode } from "./types.js";

/** Modules that ship code. Every module also needs a modules/<id>/module.md. */
export const MODULE_CODE: Record<string, ModuleCode> = { gtm };
