# Quiver — Project Brief

## The Problem

Claude Code skills (.md command files) live locally on each machine. Marketplace plugins add more skills, commands, and agents. There is no unified view and no way to browse or manage everything from one place. Every user with multiple machines is solving this manually with dotfiles, git repos, or Obsidian hacks.

## The Product

**Quiver** — a skill management tool with a **local web UI as the primary interface** and a CLI for power users. It handles inventory, import/export, and browsing — showing both local skills and marketplace plugin skills in one place.

The target user is someone who uses Claude Code but isn't a heavy terminal user. The web UI (launched via `quiver ui`, the Quiver.app, or auto-started on login) is the default experience. The CLI exists as the engine underneath and as a power-user escape hatch.

**Domain:** SkillQuiver.com (available)

---

## What's Built (MVP)

### 1. Inventory
- Scans local skills from `~/.claude/skills/`
- Scans marketplace plugin skills from `~/.claude/plugins/marketplaces/*/plugins/*/`
- Reads YAML frontmatter from SKILL.md and plugin.json for metadata
- Colour-coded by source: indigo (local), teal (marketplace/plugin)
- Source badges on each card

### 2. Web UI (primary interface)
- `quiver ui` — launches Express server, auto-opens browser at http://localhost:3456
- Tabs: All / Local / Marketplace (with styled tooltips)
- Search across name, description, tags, source, plugin name
- Skill detail panel with full content, file path, Copy Path + Reveal in Finder
- Drag-and-drop .skill.zip import
- Launch on startup toggle (macOS LaunchAgent)
- Light/dark mode (follows OS preference)

### 3. CLI
- `quiver list` — shows skills with NAME, SOURCE, FILES, DESCRIPTION columns
- `quiver add <path>` — symlink (default) or copy a skill into `~/.claude/skills/`
- `quiver remove <name>` — remove a skill
- `quiver import <zip>` — unpack a .skill.zip
- `quiver export <name>` — package a skill as a .skill.zip
- `quiver config` — get/set configuration

### 4. macOS Distribution
- **Quiver.app** — standalone .app bundle (esbuild + shell launcher, ~1.8MB)
- **Bootstrap skill** — a meta Claude Code skill that installs and launches Quiver
- **LaunchAgent** — optional auto-start on login for bookmark persistence

---

## Architecture

```
quiver/
├── bin/quiver.js          # CLI entry point
├── src/
│   ├── core/              # Shared logic (CLI and web UI both call this)
│   │   ├── inventory.js   # Scan local skills + marketplace plugins
│   │   ├── add.js         # Symlink/copy skills into ~/.claude/skills/
│   │   ├── remove.js      # Remove skills
│   │   ├── import.js      # Unzip + register skill archives
│   │   ├── export.js      # Package skills as zips
│   │   ├── config.js      # Config read/write (~/.quiver/config.json)
│   │   └── paths.js       # Path constants (SKILLS_DIR, PLUGINS_DIR, etc.)
│   ├── cli.js             # Commander.js CLI
│   ├── server.js          # Express server — REST API + serves web UI
│   └── routes.js          # API routes (thin wrappers around core/)
├── ui/                    # Web UI (Preact + HTM via CDN, no build step)
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── build/                 # macOS .app build tooling
│   ├── build-macos.sh
│   ├── Info.plist
│   └── sea-entry.js
├── bootstrap/             # Meta skill for installing Quiver
│   └── quiver-launcher/SKILL.md
└── package.json
```

**Tech stack:**
- Node.js + Express for the server
- Commander.js for CLI
- Preact + HTM (CDN, no build step) for the web UI
- esbuild for .app bundling
- gray-matter for YAML frontmatter parsing
- adm-zip for import/export

**Key architectural principle:** All logic lives in `src/core/`. The CLI and the web API are both thin interfaces over the same core modules.

---

## Future Features

### Sync (Phase 3)
- Git backend for push/pull across machines
- `quiver status` — diff between local and remote
- Path-based backends (iCloud, Dropbox) with last-write-wins

### Other Ideas
- Skill editing from the web UI
- Skill search/discovery from a community registry
- Windows / Linux support
- Landing page at SkillQuiver.com

---

## Design Decisions

- **Symlinks by default** — `quiver add` symlinks rather than copies, keeping one source of truth. `--copy` flag available.
- **Web UI first** — target users aren't terminal-heavy, so the GUI is the primary interface
- **No cloud skill support** — claude.ai desktop app skills have no API and no local cache. Documented as a known limitation.
- **macOS only for now** — .app bundle and LaunchAgent are macOS-specific. CLI works cross-platform.
- **Requires Node.js** — Homebrew Node doesn't support SEA (Single Executable Application), so the .app uses a shell launcher that finds the user's Node installation. Claude Code users will have Node.

## Notes

- Anthropic has an open issue for account-level settings sync (anthropics/claude-code#22648) — if they ship cloud skill APIs, Quiver could integrate
- Open source from day one — community contribution is how the backend ecosystem grows
