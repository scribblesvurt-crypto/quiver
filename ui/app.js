import { h, render } from './vendor/preact.mjs';
import { useState, useEffect, useCallback } from './vendor/preact-hooks.mjs';
import htm from './vendor/htm.mjs';

const html = htm.bind(h);

// --- API helpers ---
const api = {
  async list() {
    const res = await fetch('/api/skills');
    return res.json();
  },
  async detail(name) {
    const res = await fetch(`/api/skills/${encodeURIComponent(name)}`);
    return res.json();
  },
  async remove(name) {
    const res = await fetch(`/api/skills/${encodeURIComponent(name)}`, { method: 'DELETE' });
    return res.json();
  },
  async importZip(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/skills/import', { method: 'POST', body: form });
    return res.json();
  },
  async reveal(path) {
    const res = await fetch('/api/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    return res.json();
  },
  async getStartup() {
    const res = await fetch('/api/startup');
    return res.json();
  },
  async setStartup(enabled) {
    const res = await fetch('/api/startup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    return res.json();
  },
  async save(name, raw) {
    const res = await fetch(`/api/skills/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw })
    });
    return res.json();
  },
  exportUrl(name) {
    return `/api/skills/${encodeURIComponent(name)}/export`;
  },
  async registryPlugins(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api/registry/plugins${qs ? '?' + qs : ''}`);
    return res.json();
  },
  async registryInstall(name, marketplace) {
    const res = await fetch('/api/registry/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, marketplace })
    });
    return res.json();
  },
  async registrySources() {
    const res = await fetch('/api/registry/sources');
    return res.json();
  },
  async setSourceEnabled(id, enabled) {
    const res = await fetch('/api/registry/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled })
    });
    return res.json();
  },
  async registryCategories() {
    const res = await fetch('/api/registry/categories');
    return res.json();
  },
  async syncStatus() {
    const res = await fetch('/api/sync/status');
    return res.json();
  },
  async syncInit() {
    const res = await fetch('/api/sync/init', { method: 'POST' });
    return res.json();
  },
  async syncRemote(url) {
    const res = await fetch('/api/sync/remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return res.json();
  },
  async syncPush() {
    const res = await fetch('/api/sync/push', { method: 'POST' });
    return res.json();
  },
  async syncPull() {
    const res = await fetch('/api/sync/pull', { method: 'POST' });
    return res.json();
  }
};

// --- Toast ---
function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, []);
  if (!message) return null;
  return html`<div class="toast">${message}</div>`;
}

// --- Drop Zone ---
function ImportZone({ onImport }) {
  const [active, setActive] = useState(false);
  const fileRef = useCallback((el) => {
    if (el) el.addEventListener('change', (e) => {
      if (e.target.files[0]) onImport(e.target.files[0]);
    });
  }, []);

  function handleDrop(e) {
    e.preventDefault();
    setActive(false);
    const file = e.dataTransfer?.files[0];
    if (file) onImport(file);
  }

  return html`
    <div
      class="drop-zone ${active ? 'active' : ''}"
      onDragOver=${(e) => { e.preventDefault(); setActive(true); }}
      onDragLeave=${() => setActive(false)}
      onDrop=${handleDrop}
      onClick=${() => document.getElementById('zip-input').click()}
    >
      <input id="zip-input" type="file" accept=".zip" ref=${fileRef} />
      <strong>Drop a .skill.zip here</strong> or click to browse
    </div>
  `;
}

// --- Skill Card ---
function SkillCard({ skill, onClick }) {
  const sourceClass = skill.source === 'local' ? 'source-local' : 'source-plugin';
  const badgeClass = skill.source === 'local' ? 'local' : 'plugin';
  const badgeLabel = skill.source === 'local' ? 'Local' : skill.pluginName || 'Plugin';

  return html`
    <div class="skill-card ${sourceClass}" onClick=${() => onClick(skill)}>
      <div class="skill-card-header">
        <h3>${skill.name}</h3>
        <span class="source-badge ${badgeClass}">${badgeLabel}</span>
      </div>
      <p>${skill.description || 'No description'}</p>
      <div class="skill-card-meta">
        ${(skill.tags || []).map(t => html`<span class="tag" key=${t}>${t}</span>`)}
        ${skill.isSymlink && html`<span class="tag">symlink</span>`}
        <span class="file-count">${skill.fileCount} file${skill.fileCount !== 1 ? 's' : ''}</span>
      </div>
    </div>
  `;
}

// --- Skill Detail Panel ---
function SkillDetail({ skill, onClose, onRemove, onExport, onToast, onRefresh }) {
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const badgeClass = skill.source === 'local' ? 'local' : 'plugin';
  const badgeLabel = skill.source === 'local' ? 'Local Skill' : skill.pluginName || 'Plugin';
  const isLocal = skill.source === 'local';

  useEffect(() => {
    setDetail(null);
    setEditing(false);
    api.detail(skill.name).then(setDetail);
  }, [skill.name]);

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(skill.path);
      onToast('Path copied to clipboard');
    } catch {
      onToast('Failed to copy');
    }
  }

  async function revealInFinder() {
    try {
      await api.reveal(skill.path);
    } catch {
      onToast('Failed to open Finder');
    }
  }

  function startEditing() {
    if (!detail) return;
    // Reconstruct the raw file content (frontmatter + content)
    const fm = detail.frontmatter || {};
    const hasFrontmatter = Object.keys(fm).length > 0;
    let raw = '';
    if (hasFrontmatter) {
      raw = '---\n';
      for (const [k, v] of Object.entries(fm)) {
        if (Array.isArray(v)) {
          raw += `${k}:\n${v.map(i => `  - ${i}`).join('\n')}\n`;
        } else {
          raw += `${k}: ${v}\n`;
        }
      }
      raw += '---\n';
    }
    raw += detail.content || '';
    setEditContent(raw);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await api.save(skill.dirName, editContent);
      if (result.ok) {
        onToast('Saved');
        setEditing(false);
        const updated = await api.detail(skill.name);
        setDetail(updated);
        onRefresh();
      } else {
        onToast(result.error || 'Save failed');
      }
    } catch {
      onToast('Save failed');
    }
    setSaving(false);
  }

  return html`
    <div class="detail-overlay" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="detail-panel">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
          <h2 style="margin: 0;">${skill.name}</h2>
          <span class="source-badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <p class="description">${skill.description || 'No description'}</p>

        <div class="detail-section">
          <h4>Location</h4>
          <div class="detail-path">
            <span class="detail-path-text">${skill.path}</span>
            <div class="detail-path-actions">
              <button class="btn btn-sm" onClick=${copyPath}>Copy</button>
              <button class="btn btn-sm" onClick=${revealInFinder}>Reveal</button>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h4>Metadata</h4>
          <dl class="detail-meta">
            <dt>Source</dt><dd>${skill.source === 'local' ? 'Local skill' : 'Plugin: ' + (skill.pluginName || 'unknown')}</dd>
            <dt>Files</dt><dd>${skill.fileCount}</dd>
            ${skill.isSymlink && html`<dt>Symlink</dt><dd>Yes</dd>`}
            <dt>Modified</dt><dd>${new Date(skill.modified).toLocaleDateString()}</dd>
            ${skill.version && html`<dt>Version</dt><dd>${skill.version}</dd>`}
            ${skill.author && html`<dt>Author</dt><dd>${skill.author}</dd>`}
          </dl>
        </div>

        ${editing ? html`
          <div class="detail-section">
            <h4>Editing SKILL.md</h4>
            <textarea
              class="edit-textarea"
              value=${editContent}
              onInput=${(e) => setEditContent(e.target.value)}
            />
          </div>
        ` : html`
          ${detail?.content && html`
            <div class="detail-section">
              <h4>Content</h4>
              <div class="detail-content">${detail.content.trim()}</div>
            </div>
          `}

          ${skill.files?.length > 0 && html`
            <div class="detail-section">
              <h4>Files</h4>
              <div class="detail-content">${skill.files.join('\n')}</div>
            </div>
          `}
        `}

        <div class="detail-actions">
          ${editing ? html`
            <button class="btn btn-primary" onClick=${handleSave} disabled=${saving}>
              ${saving ? 'Saving...' : 'Save'}
            </button>
            <button class="btn" onClick=${() => setEditing(false)}>Cancel</button>
          ` : html`
            ${isLocal && html`
              <button class="btn btn-primary" onClick=${startEditing}>Edit</button>
            `}
            <button class="btn" onClick=${() => onExport(skill)}>Export .zip</button>
            ${isLocal && html`
              <button class="btn btn-danger" onClick=${() => onRemove(skill)}>Remove</button>
            `}
          `}
          <button class="btn" onClick=${onClose} style="margin-left: auto;">Close</button>
        </div>
      </div>
    </div>
  `;
}

// --- Sources Panel ---
function SourcesPanel({ onClose, onChanged }) {
  const [sources, setSources] = useState([]);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api.registrySources().then(d => setSources(d.sources || []));
  }, []);

  async function toggle(id, enabled) {
    setBusy(id);
    await api.setSourceEnabled(id, enabled);
    const updated = await api.registrySources();
    setSources(updated.sources || []);
    setBusy(null);
    onChanged();
  }

  return html`
    <div class="detail-overlay" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="detail-panel">
        <h2 style="margin: 0 0 4px 0;">Marketplace Sources</h2>
        <p class="description">Enable community marketplaces to browse more plugins. Enabled sources are fetched from GitHub.</p>

        <div class="sources-list">
          ${sources.map(s => html`
            <div class="source-item" key=${s.id}>
              <div class="source-info">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <strong>${s.name}</strong>
                  ${s.local && html`<span class="source-badge plugin" style="font-size: 9px;">LOCAL</span>`}
                </div>
                <a class="source-repo" href="https://github.com/${s.repo}" target="_blank" rel="noopener">${s.repo}</a>
                <span style="font-size: 12px; color: var(--text-secondary)">${s.description}</span>
              </div>
              <label class="startup-toggle">
                <input type="checkbox" checked=${s.enabled}
                  disabled=${busy === s.id}
                  onChange=${() => toggle(s.id, !s.enabled)} />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
              </label>
            </div>
          `)}
        </div>

        <div class="detail-actions">
          <button class="btn" onClick=${onClose} style="margin-left: auto;">Close</button>
        </div>
      </div>
    </div>
  `;
}

// --- Browse Card ---
function BrowseCard({ plugin, onClick }) {
  return html`
    <div class="browse-card ${plugin.installed ? 'installed' : ''}" onClick=${() => onClick(plugin)}>
      <div class="browse-card-header">
        <h3>${plugin.name}</h3>
        <span class="status-badge ${plugin.installed ? 'installed' : 'available'}">
          ${plugin.installed ? 'Installed' : 'Available'}
        </span>
      </div>
      <p>${plugin.description || 'No description'}</p>
      <div class="browse-card-meta">
        ${plugin.category && html`<span class="source-badge registry">${plugin.category}</span>`}
        ${plugin.author && html`<span class="tag">${plugin.author}</span>`}
      </div>
    </div>
  `;
}

// --- Browse Detail Panel ---
function BrowseDetail({ plugin, onClose, onToast, onRefresh }) {
  const [installing, setInstalling] = useState(false);
  const installCmd = `claude /plugin install ${plugin.name}`;

  async function handleInstall() {
    setInstalling(true);
    const result = await api.registryInstall(plugin.name, plugin.marketplace);
    if (result.ok) {
      onToast(`Installed: ${plugin.name}`);
      onRefresh();
      onClose();
    } else {
      onToast(result.error || 'Install failed');
    }
    setInstalling(false);
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(installCmd);
      onToast('Command copied to clipboard');
    } catch {
      onToast('Failed to copy');
    }
  }

  return html`
    <div class="detail-overlay" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="detail-panel">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
          <h2 style="margin: 0;">${plugin.name}</h2>
          <span class="status-badge ${plugin.installed ? 'installed' : 'available'}">
            ${plugin.installed ? 'Installed' : 'Available'}
          </span>
        </div>
        <p class="description">${plugin.description || 'No description'}</p>

        <div class="detail-section">
          <h4>Details</h4>
          <dl class="detail-meta">
            ${plugin.category && html`<dt>Category</dt><dd>${plugin.category}</dd>`}
            ${plugin.author && html`<dt>Author</dt><dd>${plugin.author}</dd>`}
            <dt>Source</dt><dd>${plugin.sourceType}</dd>
            <dt>Marketplace</dt><dd>${plugin.marketplace}</dd>
          </dl>
        </div>

        ${plugin.homepage && html`
          <div class="detail-section">
            <h4>Homepage</h4>
            <a href=${plugin.homepage} target="_blank" rel="noopener" style="color: var(--accent); font-size: 13px; word-break: break-all;">
              ${plugin.homepage}
            </a>
          </div>
        `}

        ${!plugin.installed && html`
          <div class="detail-section">
            <h4>Install</h4>
            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
              <button class="btn btn-primary" onClick=${handleInstall} disabled=${installing}>
                ${installing ? 'Installing...' : 'Install Plugin'}
              </button>
            </div>
            <div class="install-command">
              <span>${installCmd}</span>
              <button class="btn btn-sm" onClick=${copyCommand}>Copy</button>
            </div>
          </div>
        `}

        ${plugin.installed && html`
          <div class="detail-section">
            <p style="font-size: 13px; color: var(--source-plugin);">
              This plugin is already installed. Its skills appear in the Marketplace tab.
            </p>
          </div>
        `}

        <div class="detail-actions">
          <button class="btn" onClick=${onClose} style="margin-left: auto;">Close</button>
        </div>
      </div>
    </div>
  `;
}

// --- Sync Panel ---
function SyncPanel({ onClose, onToast, onRefresh }) {
  const [status, setStatus] = useState(null);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadStatus() {
    const s = await api.syncStatus();
    setStatus(s);
    if (s.remote) setRemoteUrl(s.remote);
  }

  useEffect(() => { loadStatus(); }, []);

  async function handleInit() {
    setBusy(true);
    const result = await api.syncInit();
    onToast(result.message || result.error);
    await loadStatus();
    setBusy(false);
  }

  async function handleSetRemote() {
    if (!remoteUrl.trim()) return;
    setBusy(true);
    const result = await api.syncRemote(remoteUrl.trim());
    onToast(result.ok ? result.message : result.error);
    await loadStatus();
    setBusy(false);
  }

  async function handlePush() {
    setBusy(true);
    const result = await api.syncPush();
    onToast(result.ok ? result.message : result.error);
    await loadStatus();
    onRefresh();
    setBusy(false);
  }

  async function handlePull() {
    setBusy(true);
    const result = await api.syncPull();
    onToast(result.ok ? result.message : result.error);
    await loadStatus();
    onRefresh();
    setBusy(false);
  }

  if (!status) return html`
    <div class="detail-overlay" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="detail-panel"><p style="color: var(--text-secondary)">Loading...</p></div>
    </div>
  `;

  const { added = [], modified = [], removed = [] } = status.localChanges || {};
  const localTotal = added.length + modified.length + removed.length;

  return html`
    <div class="detail-overlay" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="detail-panel">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
          <h2 style="margin: 0;">Sync</h2>
          <span class="source-badge ${status.initialized ? 'local' : ''}" style="${!status.initialized ? 'opacity:0.5' : ''}">
            ${status.initialized ? 'Git' : 'Not configured'}
          </span>
        </div>
        <p class="description">Keep your skills in sync across machines using a git remote.</p>

        ${!status.initialized && html`
          <div class="detail-section">
            <button class="btn btn-primary" onClick=${handleInit} disabled=${busy}>
              ${busy ? 'Initializing...' : 'Initialize Sync'}
            </button>
          </div>
        `}

        ${status.initialized && html`
          <div class="detail-section">
            <h4>Remote</h4>
            <div class="sync-remote-row">
              <input
                class="search-input sync-remote-input"
                type="text"
                placeholder="git@github.com:user/skills.git"
                value=${remoteUrl}
                onInput=${(e) => setRemoteUrl(e.target.value)}
              />
              <button class="btn btn-sm" onClick=${handleSetRemote} disabled=${busy}>Set</button>
            </div>
          </div>

          <div class="detail-section">
            <h4>Actions</h4>
            <div class="sync-actions-row">
              <button class="btn btn-primary" onClick=${handlePush} disabled=${busy || !status.remote}>
                ${busy ? 'Pushing...' : 'Push'}
                ${localTotal > 0 ? html` <span class="sync-badge">${localTotal}</span>` : ''}
              </button>
              <button class="btn" onClick=${handlePull} disabled=${busy || !status.remote}>
                ${busy ? 'Pulling...' : 'Pull'}
                ${status.remoteChanges > 0 ? html` <span class="sync-badge">${status.remoteChanges}</span>` : ''}
              </button>
            </div>
            ${!status.remote && html`
              <p class="sync-hint">Set a remote URL above to enable push and pull.</p>
            `}
          </div>

          ${(localTotal > 0 || status.remoteChanges > 0) && html`
            <div class="detail-section">
              <h4>Changes</h4>
              <div class="sync-diff-list">
                ${added.map(s => html`<div class="sync-diff-item added">+ ${s}</div>`)}
                ${modified.map(s => html`<div class="sync-diff-item modified">~ ${s}</div>`)}
                ${removed.map(s => html`<div class="sync-diff-item removed">- ${s}</div>`)}
                ${status.remoteChanges > 0 && html`
                  <div class="sync-diff-item" style="color: var(--text-secondary); margin-top: 8px;">
                    ${status.remoteChanges} remote commit${status.remoteChanges !== 1 ? 's' : ''} to pull
                  </div>
                `}
              </div>
            </div>
          `}

          ${localTotal === 0 && status.remoteChanges === 0 && html`
            <div class="detail-section">
              <p style="color: var(--text-secondary); font-size: 13px;">Everything up to date.</p>
            </div>
          `}

          ${status.lastSync && html`
            <div class="detail-section">
              <h4>Last Sync</h4>
              <p style="font-size: 13px; color: var(--text-secondary);">
                ${new Date(status.lastSync).toLocaleString()}
              </p>
            </div>
          `}
        `}

        <div class="detail-actions">
          <button class="btn" onClick=${onClose} style="margin-left: auto;">Close</button>
        </div>
      </div>
    </div>
  `;
}

// --- App ---
function App() {
  const [skills, setSkills] = useState([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [startupEnabled, setStartupEnabled] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [syncInfo, setSyncInfo] = useState(null);
  const [browsePlugins, setBrowsePlugins] = useState([]);
  const [browseCategories, setBrowseCategories] = useState([]);
  const [browseCategory, setBrowseCategory] = useState(null);
  const [browseSelected, setBrowseSelected] = useState(null);
  const [browseLoaded, setBrowseLoaded] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await api.list();
    setSkills(data);
    setLoading(false);
  }, []);

  const loadBrowse = useCallback(async () => {
    const [pluginData, catData] = await Promise.all([
      api.registryPlugins(),
      api.registryCategories()
    ]);
    setBrowsePlugins(pluginData.plugins || []);
    setBrowseCategories(catData.categories || []);
    setBrowseLoaded(true);
  }, []);

  const refreshSync = useCallback(async () => {
    try {
      const s = await api.syncStatus();
      setSyncInfo(s);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    refreshSync();
    api.getStartup().then(d => setStartupEnabled(d.enabled)).catch(() => {});
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const header = document.querySelector('.header');
      if (header) header.classList.toggle('scrolled', window.scrollY > 20);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function toggleStartup() {
    const next = !startupEnabled;
    const result = await api.setStartup(next);
    setStartupEnabled(result.enabled);
    setToast(result.message);
  }

  useEffect(() => {
    if (tab === 'browse' && !browseLoaded) loadBrowse();
  }, [tab]);

  const browseCategoryFiltered = browseCategory
    ? browsePlugins.filter(p => p.category === browseCategory)
    : browsePlugins;

  const browseFiltered = search
    ? browseCategoryFiltered.filter(p => {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q)
          || p.description.toLowerCase().includes(q)
          || (p.category || '').toLowerCase().includes(q)
          || (p.author || '').toLowerCase().includes(q);
      })
    : browseCategoryFiltered;

  const localCount = skills.filter(s => s.source === 'local').length;
  const pluginCount = skills.filter(s => s.source === 'plugin').length;

  const filtered = skills.filter(s => {
    // Tab filter
    if (tab === 'local' && s.source !== 'local') return false;
    if (tab === 'plugin' && s.source !== 'plugin') return false;

    // Search filter
    const q = search.toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q)
      || s.description.toLowerCase().includes(q)
      || (s.tags || []).some(t => t.toLowerCase().includes(q))
      || s.source.toLowerCase().includes(q)
      || (s.pluginName || '').toLowerCase().includes(q);
  });

  async function handleImport(file) {
    try {
      const result = await api.importZip(file);
      setToast(result.message || `Imported: ${result.name}`);
      refresh();
    } catch {
      setToast('Import failed');
    }
  }

  async function handleRemove(skill) {
    if (!confirm(`Remove "${skill.name}"? ${skill.isSymlink ? 'This will remove the symlink only.' : 'This will delete the skill directory.'}`)) return;
    try {
      await api.remove(skill.dirName);
      setToast(`Removed: ${skill.name}`);
      setSelected(null);
      refresh();
    } catch {
      setToast('Remove failed');
    }
  }

  function handleExport(skill) {
    window.open(api.exportUrl(skill.dirName), '_blank');
  }

  return html`
    <div class="header">
      <h1>Quiver</h1>
      <div class="header-actions">
        <input
          class="search-input"
          type="text"
          placeholder="Search skills..."
          value=${search}
          onInput=${(e) => setSearch(e.target.value)}
        />
        <button class="btn" onClick=${refresh}>Refresh</button>
        <button class="btn sync-btn" onClick=${() => setShowSync(true)}>
          <span class="sync-dot ${syncInfo?.initialized ? (
            ((syncInfo.localChanges?.added?.length || 0) + (syncInfo.localChanges?.modified?.length || 0) + (syncInfo.localChanges?.removed?.length || 0) + (syncInfo.remoteChanges || 0)) > 0
              ? 'pending' : 'ok'
          ) : 'off'}"></span>
          Sync
        </button>
        <label class="startup-toggle" title="Launch Quiver automatically when you log in">
          <input type="checkbox" checked=${startupEnabled} onChange=${toggleStartup} />
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
          <span class="toggle-label">Launch on startup</span>
        </label>
      </div>
    </div>

    <div class="tab-bar">
      <button class="tab ${tab === 'all' ? 'active' : ''}" onClick=${() => setTab('all')}>
        <span class="tooltip">All skills from every source</span>
        All <span class="tab-count">${skills.length}</span>
      </button>
      <button class="tab ${tab === 'local' ? 'active' : ''}" onClick=${() => setTab('local')}>
        <span class="tooltip">Skills you created locally in ~/.claude/skills/</span>
        Local <span class="tab-count">${localCount}</span>
      </button>
      <button class="tab ${tab === 'plugin' ? 'active' : ''}" onClick=${() => setTab('plugin')}>
        <span class="tooltip">Skills installed from the Claude marketplace</span>
        Marketplace <span class="tab-count">${pluginCount}</span>
      </button>
      <button class="tab ${tab === 'browse' ? 'active' : ''}" onClick=${() => setTab('browse')}>
        <span class="tooltip">Browse the full plugin marketplace catalog</span>
        Browse ${browseLoaded ? html`<span class="tab-count">${browsePlugins.length}</span>` : ''}
      </button>
    </div>

    ${tab === 'browse' && html`
      <div class="category-bar">
        <button class="category-pill sources-btn" onClick=${() => setShowSources(true)}>
          Sources
        </button>
        <span class="category-divider"></span>
        <button class="category-pill ${!browseCategory ? 'active' : ''}" onClick=${() => setBrowseCategory(null)}>
          All
        </button>
        ${browseCategories.map(c => html`
          <button key=${c.name} class="category-pill ${browseCategory === c.name ? 'active' : ''}"
            onClick=${() => setBrowseCategory(browseCategory === c.name ? null : c.name)}>
            ${c.name} <span style="opacity: 0.7">${c.count}</span>
          </button>
        `)}
      </div>
    `}

    <div class="main">
      ${tab !== 'browse' && html`<${ImportZone} onImport=${handleImport} />`}

      ${tab !== 'browse' && loading && skills.length === 0 && html`
        <div class="empty-state"><p>Loading...</p></div>
      `}

      ${tab !== 'browse' && !loading && skills.length === 0 && html`
        <div class="empty-state">
          <h3>No skills found</h3>
          <p>Drop a .skill.zip above or use the CLI to add skills.</p>
        </div>
      `}

      ${tab !== 'browse' && !loading && skills.length > 0 && filtered.length === 0 && html`
        <div class="empty-state">
          <p>No skills match "${search}"</p>
        </div>
      `}

      ${tab !== 'browse' && html`
        <div class="skill-grid">
          ${filtered.map(s => html`
            <${SkillCard} key=${s.path} skill=${s} onClick=${setSelected} />
          `)}
        </div>
      `}

      ${tab === 'browse' && html`
        ${!browseLoaded && html`
          <div class="empty-state"><p>Loading marketplace catalog...</p></div>
        `}

        ${browseLoaded && browsePlugins.length === 0 && html`
          <div class="empty-state">
            <h3>No sources enabled</h3>
            <p>Click <strong>Sources</strong> above to enable marketplace sources.</p>
          </div>
        `}

        ${browseLoaded && browsePlugins.length > 0 && browseFiltered.length === 0 && html`
          <div class="empty-state">
            <p>No plugins match your search${browseCategory ? ` in "${browseCategory}"` : ''}</p>
          </div>
        `}

        ${browseLoaded && html`
          <div class="skill-grid">
            ${browseFiltered.map(p => html`
              <${BrowseCard} key=${p.name} plugin=${p} onClick=${setBrowseSelected} />
            `)}
          </div>
        `}
      `}
    </div>

    ${showSources && html`
      <${SourcesPanel}
        onClose=${() => setShowSources(false)}
        onChanged=${() => { setBrowseLoaded(false); loadBrowse(); }}
      />
    `}

    ${browseSelected && html`
      <${BrowseDetail}
        plugin=${browseSelected}
        onClose=${() => setBrowseSelected(null)}
        onToast=${setToast}
        onRefresh=${() => { setBrowseLoaded(false); loadBrowse(); refresh(); }}
      />
    `}

    ${showSync && html`
      <${SyncPanel}
        onClose=${() => { setShowSync(false); refreshSync(); }}
        onToast=${setToast}
        onRefresh=${refresh}
      />
    `}

    ${selected && html`
      <${SkillDetail}
        skill=${selected}
        onClose=${() => setSelected(null)}
        onRemove=${handleRemove}
        onExport=${handleExport}
        onToast=${setToast}
        onRefresh=${refresh}
      />
    `}

    ${toast && html`<${Toast} message=${toast} onDone=${() => setToast('')} />`}
  `;
}

render(html`<${App} />`, document.getElementById('app'));
