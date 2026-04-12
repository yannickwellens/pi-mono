import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoDir = resolve(packageDir, "../..");
const nodeModulesDir = join(packageDir, "node_modules");
const backupRoot = join(nodeModulesDir, ".prepack-backups");
const markerFile = join(backupRoot, "manifest.json");

const stagedPackages = [
	{
		name: "@mariozechner/pi-ai",
		stage(targetDir) {
			const sourceDir = resolve(packageDir, "../ai");
			mkdirSync(targetDir, { recursive: true });
			cpSync(join(sourceDir, "dist"), join(targetDir, "dist"), { recursive: true });
			cpSync(join(sourceDir, "package.json"), join(targetDir, "package.json"));
		},
	},
	...[
		"@anthropic-ai/sdk",
		"@aws-sdk/client-bedrock-runtime",
		"@google/genai",
		"@mistralai/mistralai",
		"@sinclair/typebox",
		"ajv",
		"ajv-formats",
		"chalk",
		"openai",
		"partial-json",
		"protobufjs",
		"proxy-agent",
		"undici",
		"zod-to-json-schema",
	].map((name) => ({
		name,
		stage(targetDir) {
			const sourceDir = join(repoDir, "node_modules", ...name.split("/"));
			cpSync(sourceDir, targetDir, { recursive: true });
		},
	})),
];

rmSync(backupRoot, { recursive: true, force: true });
mkdirSync(backupRoot, { recursive: true });

const manifest = [];
for (const pkg of stagedPackages) {
	const targetDir = join(nodeModulesDir, ...pkg.name.split("/"));
	const backupDir = join(backupRoot, pkg.name.replaceAll("/", "__"));
	mkdirSync(dirname(targetDir), { recursive: true });
	if (existsSync(targetDir)) {
		renameSync(targetDir, backupDir);
		manifest.push({ name: pkg.name, action: "restore", backupDir, targetDir });
	} else {
		manifest.push({ name: pkg.name, action: "remove", backupDir, targetDir });
	}
	pkg.stage(targetDir);
}

writeFileSync(markerFile, JSON.stringify(manifest, null, 2));
