/**
 * Just enough of ~/.ssh/config to show what a host resolves to, with
 * OpenSSH's rules: the first value obtained wins, and a Host block applies
 * when one of its patterns matches and none of its !negations do.
 */

export interface SshHostConfig {
  hostName?: string;
  user?: string;
  port?: string;
}

const KEYS: Record<string, keyof SshHostConfig> = {
  hostname: "hostName",
  user: "user",
  port: "port",
};

export const resolveSshHost = (config: string, host: string): SshHostConfig => {
  const result: SshHostConfig = {};
  let applies = true; // lines before the first Host apply to every host

  for (const raw of config.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(\S+?)(?:\s*=\s*|\s+)(.*)$/.exec(line);
    if (!match) continue;
    const keyword = match[1].toLowerCase();
    const value = match[2].trim().replace(/^"(.*)"$/, "$1");

    if (keyword === "host") {
      applies = hostMatches(value.split(/\s+/), host);
    } else if (keyword === "match") {
      applies = false; // not evaluated
    } else if (applies && KEYS[keyword] && result[KEYS[keyword]] === undefined) {
      result[KEYS[keyword]] = value;
    }
  }
  return result;
};

/** Host aliases defined in ~/.ssh/config, without wildcard patterns */
export const sshHosts = (config: string) =>
  config
    .split(/\r?\n/)
    .flatMap((line) => /^\s*Host\s+(.+)$/i.exec(line)?.[1].split(/\s+/) ?? [])
    .filter((h) => h && !/[*?!]/.test(h));

const hostMatches = (patterns: string[], host: string) => {
  let matched = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith("!");
    if (glob(negated ? pattern.slice(1) : pattern).test(host)) {
      if (negated) return false;
      matched = true;
    }
  }
  return matched;
};

const glob = (pattern: string) =>
  new RegExp(
    "^" +
      pattern
        .split("")
        .map((c) => (c === "*" ? ".*" : c === "?" ? "." : c.replace(/[.+^${}()|[\]\\]/g, "\\$&")))
        .join("") +
      "$",
    "i"
  );
