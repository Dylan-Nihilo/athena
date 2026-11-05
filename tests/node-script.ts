/** Portable executable JS fixture, including Node installations with spaces or quotes. */
export function nodeShebang(executable = process.execPath): string {
  const quoted = "'" + executable.replaceAll("'", "'\\''") + "'";
  return "#!/bin/sh\n':' //; exec " + quoted + ' "$0" "$@"';
}
