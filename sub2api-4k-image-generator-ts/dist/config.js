import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { env, platform } from "node:process";
export const CONFIG_DIR_NAME = "sub2api-4k-image-generator";
export const CONFIG_FILE_NAME = "config.env";
export function userConfigDir() {
    const home = homedir();
    if (platform === "win32") {
        const appData = env.APPDATA?.trim();
        return join(appData || join(home, "AppData", "Roaming"), CONFIG_DIR_NAME);
    }
    const xdg = env.XDG_CONFIG_HOME?.trim();
    return join(xdg || join(home, ".config"), CONFIG_DIR_NAME);
}
export function userConfigPath() {
    return join(userConfigDir(), CONFIG_FILE_NAME);
}
export function readConfig(path = userConfigPath()) {
    if (!existsSync(path)) {
        return {};
    }
    const values = {};
    for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || !line.includes("=")) {
            continue;
        }
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();
        if (!key) {
            continue;
        }
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        values[key] = value;
    }
    return values;
}
/**
 * Load the user-level config without overriding anything already present in the
 * process environment or a project-level `.env` file.
 */
export function loadUserConfig(path = userConfigPath()) {
    for (const [key, value] of Object.entries(readConfig(path))) {
        if (env[key] === undefined) {
            env[key] = value;
        }
    }
}
export function saveUserConfig(values, path = userConfigPath()) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const lines = Object.entries(values)
        .filter(([key, value]) => key && value !== undefined && value !== "")
        .map(([key, value]) => `${key}=${value}`);
    writeFileSync(path, `${lines.join("\n")}\n`, { mode: 0o600 });
    chmodSync(path, 0o600);
    return path;
}
export function isInteractive() {
    return Boolean(process.stdin.isTTY);
}
/** Set the saved values on the current process so the same run can continue. */
export function applyConfig(values) {
    for (const [key, value] of Object.entries(values)) {
        env[key] = value;
    }
}
