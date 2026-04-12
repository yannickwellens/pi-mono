import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const nodeModulesDir = join(packageDir, "node_modules");
const backupRoot = join(nodeModulesDir, ".prepack-backups");
const markerFile = join(backupRoot, "manifest.json");

if (existsSync(markerFile)) {
	const manifest = JSON.parse(readFileSync(markerFile, "utf8"));
	for (const entry of manifest) {
		rmSync(entry.targetDir, { recursive: true, force: true });
		if (entry.action === "restore" && existsSync(entry.backupDir)) {
			mkdirSync(dirname(entry.targetDir), { recursive: true });
			renameSync(entry.backupDir, entry.targetDir);
		}
	}
}

rmSync(backupRoot, { recursive: true, force: true });
