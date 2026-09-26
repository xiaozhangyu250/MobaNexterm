function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** One startup command, never delayed input into an already interactive program. */
export function cwdIntegrationCommand(reconnectCwd?: string): string {
  const script = [
    '__mnl_emit_cwd() {',
    'local __mnl_status=$? __mnl_path="$PWD";',
    '__mnl_path=${__mnl_path//%/%25};',
    '__mnl_path=${__mnl_path//#/%23};',
    '__mnl_path=${__mnl_path//\\?/%3F};',
    '__mnl_path=${__mnl_path// /%20};',
    '__mnl_path=${__mnl_path//\\\\/%5C};',
    "__mnl_path=${__mnl_path//$'\\n'/%0A};",
    "__mnl_path=${__mnl_path//$'\\r'/%0D};",
    'printf \'\\033]7;file://remote%s\\007\' "$__mnl_path";',
    'return "$__mnl_status";',
    '};',
    'if [ "${__mnl_cwd_hook_installed-}" != 1 ]; then',
    'if [ -n "${BASH_VERSION-}" ]; then',
    'case "$(declare -p PROMPT_COMMAND 2>/dev/null)" in',
    '\'declare -a \'*) PROMPT_COMMAND=(__mnl_emit_cwd "${PROMPT_COMMAND[@]}");;',
    '*) PROMPT_COMMAND="__mnl_emit_cwd${PROMPT_COMMAND:+;$PROMPT_COMMAND}";;',
    'esac;',
    'else precmd_functions+=(__mnl_emit_cwd); fi;',
    '__mnl_cwd_hook_installed=1;',
    'fi;',
    reconnectCwd?.startsWith('/') ? `cd ${quote(reconnectCwd)} 2>/dev/null || true;` : '',
    '__mnl_emit_cwd;',
  ]
    .filter(Boolean)
    .join(' ');
  // Keep Bash/Zsh syntax inside eval: unsupported POSIX shells can skip it safely.
  return ` if [ -n "\${BASH_VERSION-}\${ZSH_VERSION-}" ]; then eval ${quote(script)}; fi\r`;
}
