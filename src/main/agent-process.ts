import path from 'node:path';

export function cliEnvironment(
  executable: string,
  preserveProviderConfiguration = false,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${path.dirname(executable)}${path.delimiter}${process.env.PATH ?? '/usr/bin:/bin'}`,
  };
  // Preserve the existing Codex login-only contract; other CLIs retain their own provider config.
  if (!preserveProviderConfiguration) {
    delete env.OPENAI_API_KEY;
    delete env.CODEX_API_KEY;
    delete env.CODEX_ACCESS_TOKEN;
  }
  return env;
}
