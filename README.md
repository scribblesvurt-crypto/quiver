# Quiver

A local web UI and CLI for browsing, installing, and managing Claude Code skills.

Quiver scans your local skills (`~/.claude/skills/`) and marketplace plugins, showing everything in one searchable interface with source-based colour coding.

## Features

- **Unified inventory** — local skills and marketplace plugins in one view
- **Web UI** — tabs, search, drag-and-drop import, skill detail with file paths
- **CLI** — list, add, remove, import, export skills from the terminal
- **macOS app** — standalone Quiver.app bundle (~1.8MB)
- **Launch on startup** — optional auto-start so your bookmark always works

## Quick Start

```bash
# Install dependencies
npm install

# Launch the web UI
node bin/quiver.js ui
```

Opens http://localhost:3456 in your browser.

## CLI Usage

```bash
# List all skills
node bin/quiver.js list

# Add a skill (symlink)
node bin/quiver.js add /path/to/my-skill

# Add a skill (copy)
node bin/quiver.js add /path/to/my-skill --copy

# Remove a skill
node bin/quiver.js remove my-skill

# Export a skill as .zip
node bin/quiver.js export my-skill -o ./exports

# Import a skill from .zip
node bin/quiver.js import ./my-skill.skill.zip
```

## Global Install

```bash
npm install -g .
quiver ui
```

## Build macOS App

```bash
bash build/build-macos.sh
```

Creates `dist/Quiver.app` and `dist/Quiver.zip`.

Requires Node.js on the machine — the app uses a shell launcher to find your Node installation.

## How It Works

Quiver reads skills from two locations:

| Source | Path | Badge Colour |
|--------|------|-------------|
| Local | `~/.claude/skills/` | Indigo |
| Marketplace | `~/.claude/plugins/marketplaces/*/plugins/*/` | Teal |

Skills are `.md` files with optional YAML frontmatter for metadata (name, description, tags).

## Tech Stack

- Node.js + Express
- Preact + HTM (CDN, no build step)
- Commander.js (CLI)
- esbuild (app bundling)
- gray-matter (frontmatter parsing)

## License

MIT
