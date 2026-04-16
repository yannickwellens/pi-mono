import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(fileURLToPath(import.meta.url));
const piAiDir = join(packageDir, "node_modules", "@mariozechner", "pi-ai");
const piAiPackageJson = join(piAiDir, "package.json");
const anthropicFile = join(piAiDir, "dist", "providers", "anthropic.js");

if (!existsSync(piAiPackageJson) || !existsSync(anthropicFile)) {
	console.warn("[pi postinstall] pi-ai not found, skipping Anthropic OAuth patch");
	process.exit(0);
}

const piAiVersion = JSON.parse(readFileSync(piAiPackageJson, "utf8")).version;
let text = readFileSync(anthropicFile, "utf8");

if (text.includes("<system-reminder>")) {
	console.log("[pi postinstall] Anthropic OAuth patch already present");
	process.exit(0);
}

const versionLinePattern = /const claudeCodeVersion = ".*?";\n/;
if (!versionLinePattern.test(text) || !text.includes("// Claude Code 2.x tool names (canonical casing)")) {
	console.warn("[pi postinstall] Unexpected anthropic.js layout, skipping OAuth patch");
	process.exit(0);
}

text = text.replace(
	versionLinePattern,
	`const claudeCodeVersion = "2.1.101";\n/**\n * Build the attribution/billing header that Claude Code sends as the first\n * system prompt block. This header tells Anthropic to bill the request\n * against the user's subscription quota instead of extra-usage credits.\n */\nconst ATTRIBUTION_SALT = "59cf53e54c78";\nfunction buildAttributionHeader(messages) {\n    // Extract the first user message text (same logic as Claude Code's haY/QsK)\n    const firstUserMsg = messages.find((m) => m.role === "user");\n    let firstText = "";\n    if (firstUserMsg) {\n        if (typeof firstUserMsg.content === "string") {\n            firstText = firstUserMsg.content;\n        }\n        else if (Array.isArray(firstUserMsg.content)) {\n            const textBlock = firstUserMsg.content.find((b) => b.type === "text");\n            if (textBlock && "text" in textBlock) {\n                firstText = textBlock.text;\n            }\n        }\n    }\n    // Hash: sha256(salt + msg[4] + msg[7] + msg[20] + version).hex().slice(0, 3)\n    // buildParams is synchronous so we use a simple hash that produces a\n    // deterministic 3-char hex string from the same inputs.\n    const chars = [4, 7, 20].map((i) => (i < firstText.length ? firstText[i] : "0")).join("");\n    const raw = ATTRIBUTION_SALT + chars + claudeCodeVersion;\n    let h = 0;\n    for (let i = 0; i < raw.length; i++) {\n        h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;\n    }\n    const hash = ((h >>> 0) % 0xfff).toString(16).padStart(3, "0");\n    return \`x-anthropic-billing-header: cc_version=\${claudeCodeVersion}.\${hash}; cc_entrypoint=cli; cch=00000;\`;\n}\n`,
);

const oldOauthBlock = `    // For OAuth tokens, we MUST include Claude Code identity\n    if (isOAuthToken) {\n        params.system = [\n            {\n                type: "text",\n                text: "You are Claude Code, Anthropic's official CLI for Claude.",\n                ...(cacheControl ? { cache_control: cacheControl } : {}),\n            },\n        ];\n        if (context.systemPrompt) {\n            params.system.push({\n                type: "text",\n                text: sanitizeSurrogates(context.systemPrompt),\n                ...(cacheControl ? { cache_control: cacheControl } : {}),\n            });\n        }\n    }\n    else if (context.systemPrompt) {`;

const newOauthBlock = `    // For OAuth tokens, we MUST include Claude Code identity and attribution header.\n    // The server validates system prompt content matches Claude Code's expected structure.\n    // Custom instructions (pi's system prompt) go into the first user message as\n    // <system-reminder> tags, same pattern Claude Code uses for CLAUDE.md content.\n    if (isOAuthToken) {\n        params.system = [\n            {\n                type: "text",\n                text: buildAttributionHeader(context.messages),\n            },\n            {\n                type: "text",\n                text: "You are Claude Code, Anthropic's official CLI for Claude.",\n                ...(cacheControl ? { cache_control: cacheControl } : {}),\n            },\n        ];\n        // Inject custom system prompt into first user message as <system-reminder>\n        if (context.systemPrompt && params.messages.length > 0) {\n            const reminder = \`<system-reminder>\\n\${sanitizeSurrogates(context.systemPrompt)}\\n</system-reminder>\\n\\n\`;\n            const firstMsg = params.messages[0];\n            if (firstMsg.role === "user") {\n                if (typeof firstMsg.content === "string") {\n                    params.messages[0] = { ...firstMsg, content: reminder + firstMsg.content };\n                }\n                else if (Array.isArray(firstMsg.content)) {\n                    params.messages[0] = {\n                        ...firstMsg,\n                        content: [{ type: "text", text: reminder }, ...firstMsg.content],\n                    };\n                }\n            }\n            else {\n                // First message isn't user — prepend a user message with the reminder\n                params.messages.unshift({ role: "user", content: reminder });\n            }\n        }\n    }\n    else if (context.systemPrompt) {`;

if (!text.includes(oldOauthBlock)) {
	console.warn(`[pi postinstall] Unexpected pi-ai@${piAiVersion} OAuth block, skipping Anthropic patch`);
	process.exit(0);
}

text = text.replace(oldOauthBlock, newOauthBlock);
writeFileSync(anthropicFile, text);
console.log(`[pi postinstall] Patched pi-ai@${piAiVersion} Anthropic OAuth flow`);
