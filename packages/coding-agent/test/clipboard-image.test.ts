import type { SpawnSyncReturns } from "child_process";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
	return {
		spawnSync: vi.fn<(command: string, args: string[], options: unknown) => SpawnSyncReturns<Buffer>>(),
		clipboard: {
			hasImage: vi.fn<() => boolean>(),
			getImageBinary: vi.fn<() => Promise<Uint8Array | null>>(),
		},
		fs: {
			readFileSync: vi.fn<(path: string, encoding?: BufferEncoding) => string | Buffer>(),
			unlinkSync: vi.fn<(path: string) => void>(),
		},
	};
});

vi.mock("child_process", () => {
	return {
		spawnSync: mocks.spawnSync,
	};
});

vi.mock("../src/utils/clipboard-native.js", () => {
	return {
		clipboard: mocks.clipboard,
	};
});

vi.mock("fs", () => {
	return {
		readFileSync: mocks.fs.readFileSync,
		unlinkSync: mocks.fs.unlinkSync,
	};
});

function spawnOk(stdout: Buffer): SpawnSyncReturns<Buffer> {
	return {
		pid: 123,
		output: [Buffer.alloc(0), stdout, Buffer.alloc(0)],
		stdout,
		stderr: Buffer.alloc(0),
		status: 0,
		signal: null,
	};
}

function spawnError(error: Error): SpawnSyncReturns<Buffer> {
	return {
		pid: 123,
		output: [Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0)],
		stdout: Buffer.alloc(0),
		stderr: Buffer.alloc(0),
		status: null,
		signal: null,
		error,
	};
}

describe("readClipboardImage", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.spawnSync.mockReset();
		mocks.clipboard.hasImage.mockReset();
		mocks.clipboard.getImageBinary.mockReset();
		mocks.fs.readFileSync.mockReset();
		mocks.fs.unlinkSync.mockReset();
	});

	test("Wayland: uses wl-paste and never calls clipboard", async () => {
		mocks.clipboard.hasImage.mockImplementation(() => {
			throw new Error("clipboard.hasImage should not be called on Wayland");
		});

		mocks.spawnSync.mockImplementation((command, args, _options) => {
			if (command === "wl-paste" && args[0] === "--list-types") {
				return spawnOk(Buffer.from("text/plain\nimage/png\n", "utf-8"));
			}
			if (command === "wl-paste" && args[0] === "--type") {
				return spawnOk(Buffer.from([1, 2, 3]));
			}
			throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
		});

		const { readClipboardImage } = await import("../src/utils/clipboard-image.js");
		const result = await readClipboardImage({ platform: "linux", env: { WAYLAND_DISPLAY: "1" } });
		expect(result).not.toBeNull();
		expect(result?.mimeType).toBe("image/png");
		expect(Array.from(result?.bytes ?? [])).toEqual([1, 2, 3]);
	});

	test("Wayland: falls back to xclip when wl-paste is missing", async () => {
		mocks.clipboard.hasImage.mockImplementation(() => {
			throw new Error("clipboard.hasImage should not be called on Wayland");
		});

		const enoent = new Error("spawn ENOENT");
		(enoent as { code?: string }).code = "ENOENT";

		mocks.spawnSync.mockImplementation((command, args, _options) => {
			if (command === "wl-paste") {
				return spawnError(enoent);
			}

			if (command === "xclip" && args.includes("TARGETS")) {
				return spawnOk(Buffer.from("image/png\n", "utf-8"));
			}

			if (command === "xclip" && args.includes("image/png")) {
				return spawnOk(Buffer.from([9, 8]));
			}

			return spawnOk(Buffer.alloc(0));
		});

		const { readClipboardImage } = await import("../src/utils/clipboard-image.js");
		const result = await readClipboardImage({ platform: "linux", env: { XDG_SESSION_TYPE: "wayland" } });
		expect(result).not.toBeNull();
		expect(result?.mimeType).toBe("image/png");
		expect(Array.from(result?.bytes ?? [])).toEqual([9, 8]);
	});

	test("Non-Wayland: uses clipboard", async () => {
		mocks.spawnSync.mockImplementation(() => {
			throw new Error("spawnSync should not be called for non-Wayland sessions");
		});

		mocks.clipboard.hasImage.mockReturnValue(true);
		mocks.clipboard.getImageBinary.mockResolvedValue(new Uint8Array([7]));

		const { readClipboardImage } = await import("../src/utils/clipboard-image.js");
		const result = await readClipboardImage({ platform: "linux", env: {} });
		expect(result).not.toBeNull();
		expect(result?.mimeType).toBe("image/png");
		expect(Array.from(result?.bytes ?? [])).toEqual([7]);
	});

	test("Non-Wayland: returns null when clipboard has no image", async () => {
		mocks.spawnSync.mockImplementation(() => {
			throw new Error("spawnSync should not be called for non-Wayland sessions");
		});

		mocks.clipboard.hasImage.mockReturnValue(false);

		const { readClipboardImage } = await import("../src/utils/clipboard-image.js");
		const result = await readClipboardImage({ platform: "linux", env: {} });
		expect(result).toBeNull();
	});

	test("WSL: PowerShell fallback inlines escaped Windows path", async () => {
		const enoent = new Error("spawn ENOENT");
		(enoent as { code?: string }).code = "ENOENT";
		let powershellScript = "";
		let powershellEnv: NodeJS.ProcessEnv | undefined;

		mocks.fs.readFileSync.mockImplementation((path, encoding) => {
			if (encoding === "utf-8") {
				throw new Error(`Unexpected utf-8 readFileSync call: ${path}`);
			}
			return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		});
		mocks.fs.unlinkSync.mockImplementation(() => {});

		mocks.spawnSync.mockImplementation((command, args, options) => {
			if (command === "wl-paste" || command === "xclip") {
				return spawnError(enoent);
			}

			if (command === "wslpath") {
				return spawnOk(Buffer.from("C:\\Users\\O'Brien\\AppData\\Local\\Temp\\pi.png\n", "utf-8"));
			}

			if (command === "powershell.exe") {
				powershellScript = args[2] ?? "";
				powershellEnv = (options as { env?: NodeJS.ProcessEnv } | undefined)?.env;
				return spawnOk(Buffer.from("ok\n", "utf-8"));
			}

			throw new Error(`Unexpected spawnSync call: ${command} ${args.join(" ")}`);
		});

		const { readClipboardImage } = await import("../src/utils/clipboard-image.js");
		const result = await readClipboardImage({ platform: "linux", env: { WSL_DISTRO_NAME: "Ubuntu" } });

		expect(result).not.toBeNull();
		expect(result?.mimeType).toBe("image/png");
		expect(Array.from(result?.bytes ?? [])).toEqual([0x89, 0x50, 0x4e, 0x47]);
		expect(powershellScript).toContain("$path = 'C:\\Users\\O''Brien\\AppData\\Local\\Temp\\pi.png'");
		expect(powershellScript).not.toContain("PI_WSL_CLIPBOARD_IMAGE_PATH");
		expect(powershellEnv?.PI_WSL_CLIPBOARD_IMAGE_PATH).toBeUndefined();
	});
});
