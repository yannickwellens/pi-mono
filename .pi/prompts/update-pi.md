---
description: Sync pi-mono with upstream/main, preserve the Claude OAuth fix, rebuild the coding-agent tarball, and reinstall global pi.
---

Update this repo to match `upstream/main` as closely and as fast as possible.

Rules:
- Preserve the Claude OAuth fix in `packages/ai/src/providers/anthropic.ts`.
- Preserve the AGENTS.md note documenting that fix.
- Everything else should match `upstream/main` unless the user explicitly asks otherwise.

Process:
1. Check current branch and status.
2. Ensure `upstream` remote exists, then fetch it.
3. Inspect local drift with `git diff --name-status upstream/main...HEAD`.
4. Restore tree from `upstream/main` with `git restore --source=upstream/main -- .`.
5. Reapply only the two preserved changes:
   - `AGENTS.md`
   - `packages/ai/src/providers/anthropic.ts`
6. Verify the only diff vs upstream is those two files.
7. If `pi` is broken, missing, or the tarball must be refreshed, do this from repo root:
   - `command -v pi`
   - `ls -l "$(command -v pi)"`
   - `cd ~/repo/pi-mono && npm install`
   - `cd ~/repo/pi-mono/packages/tui && npm run build`
   - `cd ~/repo/pi-mono/packages/ai && npm run build`
   - `cd ~/repo/pi-mono/packages/agent && npm run build`
   - `cd ~/repo/pi-mono/packages/coding-agent && npm run build`
   - `npm pack`
   - `npm install -g ./mariozechner-pi-coding-agent-0.66.1.tgz`
   - `hash -r`
   - `command -v pi`
   - `pi --version`
   - `ls ~/repo/pi-mono/packages/coding-agent/mariozechner-pi-coding-agent-0.66.1.tgz`
   - `pi install local:/home/snoozer/repo/pi-mono/packages/coding-agent/mariozechner-pi-coding-agent-0.66.1.tgz`
8. If shell still points at old broken binary:
   - `hash -r`
   - `exec bash`
9. If error says missing `dark.json` or assets:
   - rebuild coding-agent
   - `npm pack`
   - reinstall global pi
   - `hash -r`
10. If code changed, run `npm run check` from repo root.

Never use destructive git commands like `git reset --hard`, `git clean -fd`, `git stash`, or broad staging like `git add .`.
