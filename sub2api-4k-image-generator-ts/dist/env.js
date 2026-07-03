import { existsSync, readFileSync } from "node:fs";
import { env } from "node:process";
export function loadDotEnv(path = ".env") {
    if (!existsSync(path)) {
        return;
    }
    for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || !line.includes("=")) {
            continue;
        }
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();
        if (!key || env[key] !== undefined) {
            continue;
        }
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        env[key] = value;
    }
}
export function maskApiKey(apiKey) {
    const trimmed = apiKey.trim();
    if (!trimmed) {
        return "";
    }
    if (trimmed.length <= 10) {
        return "***";
    }
    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}
