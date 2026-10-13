export const LOCAL_KEY_VAR: "ANYROUTER_LOCAL_API_KEY";
export const PROD_KEY_VAR: "ANYROUTER_API_KEY";
export function readEnvLocal(file?: string): Record<string, string>;
export function resolveLlmKey(
  env: Record<string, string | undefined>,
  fileVars?: Record<string, string>
): { key: string; error?: undefined } | { key?: undefined; error: string };
export function requireLlmKey(
  env?: Record<string, string | undefined>,
  fileVars?: Record<string, string>
): string;
