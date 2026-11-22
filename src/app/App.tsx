import { useEffect, useMemo, useState } from 'preact/hooks';
import { CalculatorView } from '../calc/CalculatorView';
import { appVersion, storage } from './storage';
import { t } from '../i18n';
import { IconMenu } from '../ui/icons';
import { Modal } from '../ui/Modal';
import {
  createProjectWithName,
  deleteProject,
  downloadText,
  duplicateProject,
  listProjects,
  loadProject,
  safeFilename,
  saveProject,
  suggestProjectName,
  type ProjectIndexEntry,
} from './projects';
import { exportDocument } from '../core/project';
import { Sidebar, type ShellSection } from './Sidebar';
import { ProjectsView } from '../projects/ProjectsView';
import { TemplatesView } from '../projects/TemplatesView';
import { ProjectView } from '../projects/ProjectView';

type Theme = 'dark' | 'light';

const THEME_KEY = 'ui.theme';
const PINS_KEY = 'ui.pins';
const WIDE_QUERY = '(min-width: 1180px) and (min-height: 640px)';

/** Широкий экран: панель проектов закреплена слева и не отнимает место у холста зря. */
function useWide(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(WIDE_QUERY).matches
      : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia(WIDE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches);
    setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return wide;
}

export function App() {
  const [section, setSection] = useState<ShellSection>('calculator');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>('dark');
  const [entries, setEntries] = useState<ProjectIndexEntry[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [pins, setPins] = useState<string[]>([]);
  const [renameTarget, setRenameTarget] = useState<ProjectIndexEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const wide = useWide();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // На широком экране панель закреплена; при сужении — прячется, открывается кнопкой.
  useEffect(() => {
    setSidebarOpen(wide);
  }, [wide]);

  // Без preventDefault Electron открывает перетащенный файл вместо импорта в приложении.
  useEffect(() => {
    const preventFileDrop = (event: DragEvent) => {
      const types = Array.from(event.dataTransfer?.types ?? []);
      if (types.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', preventFileDrop);
    window.addEventListener('drop', preventFileDrop);
    return () => {
      window.removeEventListener('dragover', preventFileDrop);
      window.removeEventListener('drop', preventFileDrop);
    };
  }, []);

  const refreshProjects = async () => {
    const list = await listProjects();
    setEntries(list);
    setProjectsLoading(false);
  };

  useEffect(() => {
    void refreshProjects();
    void storage.get<Theme>(THEME_KEY).then((value) => {
      if (value === 'dark' || value === 'light') setTheme(value);
    });
    void storage.get<string[]>(PINS_KEY).then((value) => {
      if (Array.isArray(value)) setPins(value.filter((id) => typeof id === 'string'));
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    void storage.set(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    void storage.set(PINS_KEY, pins);
  }, [pins]);

  // На узком экране любая навигация закрывает выдвижное меню.
  const closeOnNarrow = () => {
    if (!wide) setSidebarOpen(false);
  };

  const openCalculator = () => {
    setSection('calculator');
    setActiveProjectId(null);
    closeOnNarrow();
  };

  const openProjects = () => {
    setSection('projects');
    setActiveProjectId(null);
    closeOnNarrow();
  };

  const openTemplates = () => {
    setSection('templates');
    setActiveProjectId(null);
    closeOnNarrow();
  };

  const openProject = (id: string) => {
    setSection('project');
    setActiveProjectId(id);
    closeOnNarrow();
  };

  const createProject = async () => {
    try {
      const doc = await createProjectWithName(
        suggestProjectName(entries.map((entry) => entry.name)),
      );
      await refreshProjects();
      openProject(doc.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const renameProject = async () => {
    if (!renameTarget) return;
    const doc = await loadProject(renameTarget.id);
    if (!doc) return;
    await saveProject({ ...doc, name: renameValue.trim() || doc.name });
    setRenameTarget(null);
    await refreshProjects();
  };

  const removeProject = async (entry: ProjectIndexEntry) => {
    if (!window.confirm(t('projects.confirmDelete', { name: entry.name }))) return;
    await deleteProject(entry.id);
    if (activeProjectId === entry.id) {
      setSection('projects');
      setActiveProjectId(null);
    }
    await refreshProjects();
  };

  const duplicate = async (entry: ProjectIndexEntry) => {
    await duplicateProject(entry.id);
    await refreshProjects();
  };

  const exportProject = async (entry: ProjectIndexEntry) => {
    try {
      const doc = await loadProject(entry.id);
      if (!doc) return;
      await downloadText(`${safeFilename(doc.name)}.netmap.json`, exportDocument(doc));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const togglePin = (id: string) =>
    setPins((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  const shellClass = useMemo(() => {
    const parts = ['app-shell'];
    if (sidebarOpen) parts.push('sidebar-open');
    if (wide) parts.push('wide');
    if (section === 'project') parts.push('full-bleed');
    return parts.join(' ');
  }, [sidebarOpen, wide, section]);

  return (
    <div class={shellClass}>
      <Sidebar
        entries={entries}
        loading={projectsLoading}
        active={section}
        activeProjectId={activeProjectId}
        pins={pins}
        theme={theme}
        version={appVersion}
        onCalculator={openCalculator}
        onProjects={openProjects}
        onTemplates={openTemplates}
        onOpenProject={openProject}
        onCreate={() => void createProject()}
        onRename={(entry) => {
          setRenameTarget(entry);
          setRenameValue(entry.name);
        }}
        onDuplicate={(entry) => void duplicate(entry)}
        onExport={(entry) => void exportProject(entry)}
        onDelete={(entry) => void removeProject(entry)}
        onTogglePin={togglePin}
        onToggleTheme={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
      />

      {!wide && sidebarOpen && (
        <button
          type="button"
          class="sidebar-backdrop"
          aria-label={t('nav.closeMenu')}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main class="main">
        <button
          type="button"
          class="menu-button"
          title={t('nav.menu')}
          onClick={() => setSidebarOpen((value) => !value)}
        >
          <IconMenu size={18} />
        </button>

        {section === 'calculator' && <CalculatorView />}

        {section === 'projects' && (
          <ProjectsView
            entries={entries}
            loading={projectsLoading}
            pins={pins}
            onRefresh={() => void refreshProjects()}
            onOpen={openProject}
            onRestorePreferences={(prefs) => {
              if (prefs.theme) setTheme(prefs.theme);
              if (prefs.pins) setPins(prefs.pins);
            }}
            onTogglePin={togglePin}
          />
        )}

        {section === 'templates' && <TemplatesView onBack={openProjects} />}

        {section === 'project' && activeProjectId && (
          <ProjectView
            projectId={activeProjectId}
            onBack={openProjects}
            onMenu={() => setSidebarOpen(true)}
            onTemplates={openTemplates}
            onTogglePin={() => togglePin(activeProjectId)}
            pinned={pins.includes(activeProjectId)}
            onDeleted={() => {
              setSection('projects');
              setActiveProjectId(null);
              void refreshProjects();
            }}
            onRenamed={() => void refreshProjects()}
          />
        )}
      </main>

      {error && (
        <div class="toast-error" role="alert">
          {error}
          <button type="button" class="btn btn-ghost btn-icon" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
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
              <button type="button" class="btn btn-primary" onClick={() => void renameProject()}>
                {t('projects.save')}
              </button>
            </>
          }
        >
          <label class="field-label" for="rename-project">
            {t('projects.name')}
          </label>
          <input
            id="rename-project"
            class="input"
            autofocus
            value={renameValue}
            onInput={(event) => setRenameValue((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void renameProject();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
