import { useEffect, useRef, useState } from 'preact/hooks';
import type { ProjectIndexEntry } from './projects';
import { t } from '../i18n';
import {
  IconCalculator,
  IconCopy,
  IconEdit,
  IconLayout,
  IconMap,
  IconMore,
  IconMoon,
  IconPlus,
  IconSun,
  IconTrash,
} from '../ui/icons';

export type ShellSection = 'calculator' | 'projects' | 'project' | 'templates';

interface SidebarProps {
  entries: ProjectIndexEntry[];
  loading: boolean;
  active: ShellSection;
  activeProjectId: string | null;
  pins: string[];
  theme: 'dark' | 'light';
  version: string;
  onCalculator: () => void;
  onProjects: () => void;
  onTemplates: () => void;
  onOpenProject: (id: string) => void;
  onCreate: () => void;
  onRename: (entry: ProjectIndexEntry) => void;
  onDuplicate: (entry: ProjectIndexEntry) => void;
  onExport: (entry: ProjectIndexEntry) => void;
  onDelete: (entry: ProjectIndexEntry) => void;
  onTogglePin: (id: string) => void;
  onToggleTheme: () => void;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

/**
 * Боковая панель-меню: сверху проекты, снизу — лого, калькулятор и тема.
 * На широком экране закреплена слева, на узком — выезжает поверх содержимого.
 */
export function Sidebar({
  entries,
  loading,
  active,
  activeProjectId,
  pins,
  theme,
  version,
  onCalculator,
  onProjects,
  onTemplates,
  onOpenProject,
  onCreate,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
  onTogglePin,
  onToggleTheme,
}: SidebarProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuFor) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuFor(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuFor]);

  const pinnedSet = new Set(pins);
  const ordered = [...entries].sort((a, b) => {
    const pin = Number(pinnedSet.has(b.id)) - Number(pinnedSet.has(a.id));
    return pin !== 0 ? pin : b.updatedAt - a.updatedAt;
  });

  const run = (action: () => void) => {
    setMenuFor(null);
    action();
  };

  return (
    <aside class="sidebar" aria-label={t('nav.projects')}>
      <div class="side-head">
        <button
          type="button"
          class={`side-title${active === 'projects' ? ' active' : ''}`}
          onClick={onProjects}
        >
          <IconMap size={17} />
          {t('nav.projects')}
          <span class="tab-count">{entries.length}</span>
        </button>
        <button
          type="button"
          class={`btn btn-ghost btn-icon${active === 'templates' ? ' active' : ''}`}
          title={t('templates.library')}
          onClick={onTemplates}
        >
          <IconLayout size={16} />
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-icon"
          title={t('projects.new')}
          onClick={onCreate}
        >
          <IconPlus size={16} />
        </button>
      </div>

      <div class="side-list">
        {loading && <div class="muted side-empty">{t('projects.loading')}</div>}
        {!loading && ordered.length === 0 && (
          <div class="muted side-empty">{t('projects.empty.title')}</div>
        )}
        {ordered.map((entry) => {
          const isActive = active === 'project' && entry.id === activeProjectId;
          const pinned = pinnedSet.has(entry.id);
          return (
            <div class={`side-project${isActive ? ' active' : ''}`} key={entry.id}>
              <button
                type="button"
                class="side-project-main"
                onClick={() => onOpenProject(entry.id)}
                title={entry.name}
              >
                <span class="side-project-name">{entry.name}</span>
                <span class="side-project-meta">{formatDate(entry.updatedAt)}</span>
              </button>
              {pinned && <span class="side-pin" title={t('projects.pinned')}>★</span>}
              <button
                type="button"
                class="btn btn-ghost btn-icon side-more"
                title={t('projects.menu')}
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuFor(menuFor === entry.id ? null : entry.id);
                }}
              >
                <IconMore size={16} />
              </button>
              {menuFor === entry.id && (
                <div class="side-menu" ref={menuRef} role="menu">
                  <button type="button" onClick={() => run(() => onOpenProject(entry.id))}>
                    {t('projects.open')}
                  </button>
                  <button type="button" onClick={() => run(() => onRename(entry))}>
                    <IconEdit size={13} /> {t('projects.rename')}
                  </button>
                  <button type="button" onClick={() => run(() => onDuplicate(entry))}>
                    <IconCopy size={13} /> {t('projects.duplicate')}
                  </button>
                  <button type="button" onClick={() => run(() => onExport(entry))}>
                    ↓ {t('projects.export')}
                  </button>
                  <button type="button" onClick={() => run(() => onTogglePin(entry.id))}>
                    ★ {pinned ? t('projects.unpin') : t('projects.pin')}
                  </button>
                  <button
                    type="button"
                    class="danger"
                    onClick={() => run(() => onDelete(entry))}
                  >
                    <IconTrash size={13} /> {t('projects.delete')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" class="side-new" onClick={onCreate}>
        <IconPlus size={15} /> {t('projects.new')}
      </button>

      <div class="side-foot">
        <div class="brand">
          <img class="brand-mark" src="./icon.png" alt="" width="38" height="38" />
          <div class="brand-text">
            <div class="brand-name">{t('app.name')}</div>
            <div class="brand-version">v{version}</div>
          </div>
        </div>
        <div class="side-actions">
          <button
            type="button"
            class={`nav-item${active === 'calculator' ? ' active' : ''}`}
            onClick={onCalculator}
          >
            <span class="nav-icon">
              <IconCalculator size={18} />
            </span>
            {t('nav.calculator')}
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
