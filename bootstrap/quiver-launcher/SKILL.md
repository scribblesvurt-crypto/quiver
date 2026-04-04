---
name: quiver-launcher
description: >
  Launch Quiver — the web UI for browsing, installing, and managing Claude Code skills.
  Use this skill when the user wants to manage their skills, open quiver,
  launch quiver, view installed skills in a GUI, or organise their Claude skills.
---

# Quiver Launcher

You are launching Quiver — a web UI for managing Claude Code skills.

## Steps

1. **Check if Node.js is available:**
   Run `node --version`. If it fails, tell the user they need Node.js installed and suggest: `brew install node`

2. **Check if quiver is installed:**
   Run `npm list -g quiver 2>/dev/null`.

3. **If NOT installed, install it:**
   Run `npm install -g quiver`

   If the npm registry package isn't available yet, clone and link:
   ```
   git clone https://github.com/YOUR_USERNAME/quiver.git /tmp/quiver
   cd /tmp/quiver && npm install && npm link
   ```

4. **Launch the web UI:**
   Run `quiver ui`

   This starts a local server and opens the browser automatically.

5. **Confirm to the user:**
   Tell them "Quiver is running — check your browser at http://localhost:3456"

## Important
- This is a LOCAL tool — nothing is sent to any server. All data stays on the user's machine.
- If port 3456 is busy, use `quiver ui --port 3457` instead.
- If the user wants to stop it, they can close the terminal or press Ctrl+C.
