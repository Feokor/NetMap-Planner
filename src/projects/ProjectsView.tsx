import { useEffect, useRef, useState } from 'preact/hooks';
import {
  createProjectWithName,
  deleteProject,
  downloadText,
  duplicateProject,
  loadProject,
  safeFilename,
  saveProject,
  suggestProjectName,
  type ProjectIndexEntry,
} from '../app/projects';
import { openTextFile } from '../app/files';
import { storage } from '../app/storage';
import { loadTemplates, saveTemplates } from '../app/templates';
import { exportDocument, importAsNewProject, summarize, type ProjectSummary } from '../core/project';
import { csvToProject } from '../core/csv';
import type { DeviceTemplate } from '../core/templates';
import { t } from '../i18n';
import { IconMap, IconMore } from '../ui/icons';
import { Modal } from '../ui/Modal';

interface ProjectsViewProps {
  entries: ProjectIndexEntry[];
  loading: boolean;
  pins: string[];
  onRefresh: () => void;
  onOpen: (id: string) => void;
  onRestorePreferences: (prefs: { theme?: 'dark' | 'light'; pins?: string[] }) => void;
  onTogglePin: (id: string) => void;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function ProjectsView({
  entries,
  loading,
  pins,
  onRefresh,
  onOpen,
  onRestorePreferences,
  onTogglePin,
}: ProjectsViewProps) {
  const [details, setDetails] = useState<Record<string, ProjectSummary>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectIndexEntry | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const map: Record<string, ProjectSummary> = {};
      for (const entry of entries) {
        const doc = await loadProject(entry.id);
        if (doc) map[entry.id] = summarize(doc);
      }
      if (!cancelled) setDetails(map);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [entries]);

  useEffect(() => {
    if (!menuFor) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuFor(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuFor]);

  const openCreate = () => {
    setName(suggestProjectName(entries.map((entry) => entry.name)));
    setDescription('');
    setError(null);
    setCreateOpen(true);
  };

  const create = async () => {
    try {
      const doc = await createProjectWithName(name);
      if (description.trim()) await saveProject({ ...doc, description: description.trim() });
      setCreateOpen(false);
      onRefresh();
      onOpen(doc.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const openRename = (entry: ProjectIndexEntry) => {
    setRenameTarget(entry);
    setName(entry.name);
    setDescription(entry.description ?? '');
    setError(null);
  };

  const rename = async () => {
    if (!renameTarget) return;
    const doc = await loadProject(renameTarget.id);
    if (!doc) return;
    await saveProject({
      ...doc,
      name: name.trim() || doc.name,
      description: description.trim(),
    });
    setRenameTarget(null);
    onRefresh();
  };

  const remove = async (entry: ProjectIndexEntry) => {
    if (!window.confirm(t('projects.confirmDelete', { name: entry.name }))) return;
    await deleteProject(entry.id);
    onRefresh();
  };

  const duplicate = async (entry: ProjectIndexEntry) => {
    await duplicateProject(entry.id);
    onRefresh();
  };

  const exportOne = async (entry: ProjectIndexEntry) => {
    try {
      const doc = await loadProject(entry.id);
      if (!doc) return;
      await downloadText(`${safeFilename(doc.name)}.netmap.json`, exportDocument(doc));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  /** Резервная копия: проекты, шаблоны, история калькулятора и настройки. */
  const exportBackup = async () => {
    try {
      const projects = [];
      for (const entry of entries) {
        const doc = await loadProject(entry.id);
        if (doc) projects.push(doc);
      }
      const templates = await loadTemplates();
      const calculatorHistory = (await storage.get<unknown[]>('calc.history')) ?? [];
      const theme = await storage.get<'dark' | 'light'>('ui.theme');
      const pins = await storage.get<string[]>('ui.pins');
      const minimap = await storage.get<boolean>('ui.minimap');
      const backup = {
        schema: 'netmap-backup',
        version: 2,
        exportedAt: new Date().toISOString(),
        projects,
        templates,
        calculatorHistory,
        preferences: { theme, pins, minimap },
      };
      const date = new Date().toISOString().slice(0, 10);
      await downloadText(`netmap-backup-${date}.json`, JSON.stringify(backup, null, 2));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const importBackup = async (raw: {
    projects?: unknown[];
    templates?: unknown;
    calculatorHistory?: unknown;
    preferences?: { theme?: string; pins?: unknown; minimap?: unknown };
  }) => {
    let lastId: string | null = null;
    for (const project of raw.projects ?? []) {
      const doc = importAsNewProject(project);
      await saveProject(doc);
      lastId = doc.id;
    }

    if (Array.isArray(raw.templates)) {
      const templates = raw.templates
        .filter(
          (item): item is DeviceTemplate =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof (item as DeviceTemplate).id === 'string' &&
            typeof (item as DeviceTemplate).name === 'string' &&
            Array.isArray((item as DeviceTemplate).ports),
        )
        .map((item) => ({
          ...item,
          kind: item.kind ?? 'pc',
          layer: item.layer ?? 'L3',
          tags: Array.isArray(item.tags) ? item.tags : [],
          favorite: item.favorite === true,
          ports: item.ports.map((port) => ({
            name: port.name || 'eth0',
            media: port.media ?? 'copper',
            speed: port.speed ?? '1G',
            mode: port.mode ?? 'access',
          })),
        }));
      if (Array.isArray(raw.templates)) {
        await saveTemplates(templates);
      }
    }

    if (Array.isArray(raw.calculatorHistory)) {
      await storage.set('calc.history', raw.calculatorHistory);
    }

    const preferences = raw.preferences;
    if (preferences && (preferences.theme === 'dark' || preferences.theme === 'light')) {
      await storage.set('ui.theme', preferences.theme);
    }
    if (preferences && Array.isArray(preferences.pins)) {
      await storage.set('ui.pins', preferences.pins);
    }
    if (preferences && typeof preferences.minimap === 'boolean') {
      await storage.set('ui.minimap', preferences.minimap);
    }
    if (preferences) {
      onRestorePreferences({
        theme:
          preferences.theme === 'dark' || preferences.theme === 'light'
            ? preferences.theme
            : undefined,
        pins: Array.isArray(preferences.pins)
          ? preferences.pins.filter((item): item is string => typeof item === 'string')
          : undefined,
      });
    }

    onRefresh();
    if (lastId) onOpen(lastId);
  };

  const importJson = async (text: string) => {
    const raw = JSON.parse(text);
    const doc = importAsNewProject(raw);
    await saveProject(doc);
    onRefresh();
    onOpen(doc.id);
  };

  const importCsv = async (text: string, name: string) => {
    const result = csvToProject(text, name);
    await saveProject(result.doc);
    onRefresh();
    onOpen(result.doc.id);
  };

  const importText = async (text: string, fileName: string) => {
    const base = fileName.replace(/\.[^.]+$/, '').trim();
    const looksLikeJson = text.trimStart().startsWith('{') || text.trimStart().startsWith('[');
    if (looksLikeJson) {
      const raw = JSON.parse(text);
      if (raw && raw.schema === 'netmap-backup' && Array.isArray(raw.projects)) {
        await importBackup(raw);
        return;
      }
      await importJson(text);
    } else {
      await importCsv(text, base || t('projects.importCsvName'));
    }
  };

  const importFile = async (file: File) => {
    try {
      await importText(await file.text(), file.name);
    } catch (cause) {
      setError(t('projects.importError', { error: cause instanceof Error ? cause.message : String(cause) }));
    }
  };

  const startImport = async () => {
    try {
      const result = await openTextFile([
        { name: 'Netmap JSON', extensions: ['json'] },
        { name: 'CSV', extensions: ['csv'] },
      ]);
      if (result.status === 'unavailable') {
        fileInput.current?.click();
        return;
      }
      if (result.status === 'canceled') return;
      const fileName = result.filePath.split(/[\\/]/).pop() ?? '';
      await importText(result.text, fileName);
    } catch (cause) {
      setError(t('projects.importError', { error: cause instanceof Error ? cause.message : String(cause) }));
    }
  };

  const pinnedSet = new Set(pins);
  const ordered = [...entries].sort((a, b) => {
    const pin = Number(pinnedSet.has(b.id)) - Number(pinnedSet.has(a.id));
    return pin !== 0 ? pin : b.updatedAt - a.updatedAt;
  });

  return (
    <div
      class={`projects-page${dragging ? ' dropping' : ''}`}
      onDragOver={(event) => {
        if (!event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        const related = event.relatedTarget as Node | null;
        if (!related || !event.currentTarget.contains(related)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer?.files?.[0];
        if (file) void importFile(file);
      }}
    >
      {dragging && <div class="drop-hint">{t('projects.dropHint')}</div>}
      <header class="topbar">
        <div>
          <h1 class="page-title">{t('projects.title')}</h1>
          <p class="page-subtitle">{t('projects.subtitle')}</p>
        </div>
        <div class="inline">
          <input
            ref={fileInput}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            style={{ display: 'none' }}
            onChange={(event) => {
              const input = event.target as HTMLInputElement;
              const file = input.files?.[0];
              input.value = '';
              if (file) void importFile(file);
            }}
          />
          <button
            type="button"
            class="btn"
            title={t('projects.backupHint')}
            onClick={() => void exportBackup()}
          >
            {t('projects.backup')}
          </button>
          <button type="button" class="btn" onClick={() => void startImport()}>
            {t('projects.import')}
          </button>
          <button type="button" class="btn btn-primary" onClick={openCreate}>
            {t('projects.new')}
          </button>
        </div>
      </header>

      {error && (
        <div class="error-box" style={{ marginBottom: '14px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div class="muted">{t('projects.loading')}</div>
      ) : entries.length === 0 ? (
        <div class="empty-state">
          <IconMap size={30} />
          <h3>{t('projects.empty.title')}</h3>
          <div>{t('projects.empty.text')}</div>
          <button type="button" class="btn btn-primary" onClick={openCreate}>
            {t('projects.new')}
          </button>
        </div>
      ) : (
        <div class="project-grid">
          {ordered.map((entry) => {
            const summary = details[entry.id];
            const pinned = pinnedSet.has(entry.id);
            return (
              <div
                class={`project-card${pinned ? ' pinned' : ''}${menuFor === entry.id ? ' menu-open' : ''}`}
                key={entry.id}
                onClick={() => onOpen(entry.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpen(entry.id);
                  }
                }}
              >
                <div class="project-card-head">
                  <h3>{entry.name}</h3>
                  {pinned && <span class="side-pin">★</span>}
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon"
                    title={t('projects.menu')}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuFor(menuFor === entry.id ? null : entry.id);
                    }}
                  >
                    <IconMore size={16} />
                  </button>
                </div>
                <div class="project-card-desc">{entry.description || '—'}</div>
                <div class="project-card-meta">
                  <span>{t('projects.count.devices', { n: summary?.devices ?? 0 })}</span>
                  <span>{t('projects.count.links', { n: summary?.links ?? 0 })}</span>
                  <span>{t('projects.count.blocks', { n: summary?.blocks ?? 0 })}</span>
                  <span>{t('projects.updated', { date: formatDate(entry.updatedAt) })}</span>
                </div>
                {menuFor === entry.id && (
                  <div
                    class="side-menu"
                    ref={menuRef}
                    role="menu"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFor(null);
                        openRename(entry);
                      }}
                    >
                      ✎ {t('projects.rename')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFor(null);
                        void duplicate(entry);
                      }}
                    >
                      ⧉ {t('projects.duplicate')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFor(null);
                        void exportOne(entry);
                      }}
                    >
                      ↓ {t('projects.export')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFor(null);
                        onTogglePin(entry.id);
                      }}
                    >
                      ★ {pinned ? t('projects.unpin') : t('projects.pin')}
                    </button>
                    <button
                      type="button"
                      class="danger"
                      onClick={() => {
                        setMenuFor(null);
                        void remove(entry);
                      }}
                    >
                      ✕ {t('projects.delete')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <Modal
          title={t('projects.new')}
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <button type="button" class="btn" onClick={() => setCreateOpen(false)}>
                {t('projects.cancel')}
              </button>
              <button type="button" class="btn btn-primary" onClick={() => void create()}>
                {t('projects.create')}
              </button>
            </>
          }
        >
          <div>
            <label class="field-label" for="project-name">
              {t('projects.name')}
            </label>
            <input
              id="project-name"
              class="input"
              autofocus
              value={name}
              placeholder={t('projects.namePlaceholder')}
              onInput={(event) => setName((event.target as HTMLInputElement).value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void create();
              }}
            />
          </div>
          <div>
            <label class="field-label" for="project-desc">
              {t('projects.description')}
            </label>
            <textarea
              id="project-desc"
              class="input textarea"
              value={description}
              placeholder={t('projects.descriptionPlaceholder')}
              onInput={(event) => setDescription((event.target as HTMLTextAreaElement).value)}
            />
          </div>
        </Modal>
      )}

      {renameTarget && (
        <Modal
          title={t('projects.rename')}
          onClose={() => setRenameTarget(null)}
          footer={
            <>
              <button type="button" class="btn" onClick={() => setRenameTarget(null)}>
                {t('projects.cancel')}
              </button>
              <button type="button" class="btn btn-primary" onClick={() => void rename()}>
                {t('projects.save')}
              </button>
            </>
          }
        >
          <div>
            <label class="field-label" for="rename-project">
              {t('projects.name')}
            </label>
            <input
              id="rename-project"
              class="input"
              autofocus
              value={name}
              onInput={(event) => setName((event.target as HTMLInputElement).value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void rename();
              }}
            />
          </div>
          <div style={{ marginTop: '12px' }}>
            <label class="field-label" for="rename-desc">
              {t('projects.description')}
            </label>
            <textarea
              id="rename-desc"
              class="input textarea"
              value={description}
              placeholder={t('projects.descriptionPlaceholder')}
              onInput={(event) => setDescription((event.target as HTMLTextAreaElement).value)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
