import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  deleteProject,
  downloadText,
  loadProject,
  safeFilename,
  saveProject,
} from '../app/projects';
import {
  type Device,
  type ProjectDocument,
  createDevice,
  createGroup,
  deviceGroupIds,
  errorCount,
  exportDocument,
  projectCounts,
  searchDevices,
  validateProject,
  warningCount,
} from '../core/project';
import { t } from '../i18n';
import { IconCheck, IconExpand, IconLayers, IconMenu, IconMore, IconRedo, IconUndo } from '../ui/icons';
import { Modal } from '../ui/Modal';
import { CanvasView } from '../canvas/CanvasView';
import { ChecksTab } from './ChecksTab';
import { DeviceEditor } from './DeviceEditor';
import { DeviceTable } from './DeviceTable';
import { PlanTab } from './PlanTab';

interface ProjectViewProps {
  projectId: string;
  onBack: () => void;
  onMenu: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  onDeleted: () => void;
  onRenamed: () => void;
}

type SaveState = 'saved' | 'saving';

function csvCell(value: string): string {
  if (/[",;\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function devicesCsv(doc: ProjectDocument): string {
  const header = [
    'name',
    'kind',
    'layer',
    'group',
    'os',
    'role',
    'vendor',
    'model',
    'location',
    'serial',
    'ports',
    'ips',
    'tags',
  ];
  const rows = doc.devices.map((device) => {
    const group = doc.groups.find((item) => item.id === device.groupId);
    const ips = device.ports.flatMap((port) =>
      port.ips.map((ip) => `${ip.address}/${ip.prefix}`),
    );
    return [
      device.name,
      device.kind,
      device.attrs.layer ?? '',
      group?.name ?? '',
      device.attrs.os ?? '',
      device.attrs.role ?? '',
      device.attrs.vendor ?? '',
      device.attrs.model ?? '',
      device.attrs.location ?? '',
      device.attrs.serial ?? '',
      String(device.ports.length),
      ips.join(' '),
      device.tags.join(' '),
    ];
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
}

function uniqueDeviceName(doc: ProjectDocument, base = 'device'): string {
  const used = new Set(doc.devices.map((device) => device.name.toLowerCase()));
  for (let i = 1; i < 10000; i++) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return base;
}

export function ProjectView({
  projectId,
  onBack,
  onMenu,
  pinned,
  onTogglePin,
  onDeleted,
  onRenamed,
}: ProjectViewProps) {
  const [doc, setDoc] = useState<ProjectDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [saveTick, setSaveTick] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [projectMenu, setProjectMenu] = useState(false);
  const [panel, setPanel] = useState<'devices' | 'plan' | 'checks' | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const docRef = useRef<ProjectDocument | null>(null);
  const historyRef = useRef<ProjectDocument[]>([]);
  const futureRef = useRef<ProjectDocument[]>([]);
  const lastHistoryRef = useRef(0);
  const chromeRef = useRef<HTMLDivElement>(null);
  docRef.current = doc;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDoc(null);
    setEditingId(null);
    setPanel(null);
    setLayersOpen(false);
    historyRef.current = [];
    futureRef.current = [];
    lastHistoryRef.current = 0;
    void loadProject(projectId).then((loaded) => {
      if (cancelled) return;
      setDoc(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (saveTick === 0) return;
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      const current = docRef.current;
      if (!current) return;
      void saveProject(current).then(() => setSaveState('saved'));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [saveTick]);

  // На Android и при закрытии окна процесс может быть убит до срабатывания
  // debounce-таймера. Сохраняем принудительно, как только страница уходит в фон.
  useEffect(() => {
    const saveNow = () => {
      const current = docRef.current;
      if (current) void saveProject(current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveNow();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', saveNow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', saveNow);
    };
  }, []);

  // Меню проекта закрывается кликом мимо.
  useEffect(() => {
    if (!projectMenu) return;
    const close = (event: MouseEvent) => {
      if (chromeRef.current && !chromeRef.current.contains(event.target as Node)) {
        setProjectMenu(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [projectMenu]);

  const apply = (
    updater: (current: ProjectDocument) => ProjectDocument,
    options?: { history?: boolean },
  ) => {
    const current = docRef.current;
    if (!current) return;
    const next = updater(current);
    if (options?.history !== false) {
      const now = Date.now();
      if (now - lastHistoryRef.current > 500) {
        historyRef.current.push(current);
        if (historyRef.current.length > 80) historyRef.current.shift();
      }
      lastHistoryRef.current = now;
      futureRef.current = [];
    }
    setDoc(next);
    setSaveTick((value) => value + 1);
  };

  const undo = () => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    const current = docRef.current;
    if (current) futureRef.current.push(current);
    lastHistoryRef.current = 0;
    setDoc(previous);
    setSaveTick((value) => value + 1);
  };

  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    const current = docRef.current;
    if (current) historyRef.current.push(current);
    lastHistoryRef.current = 0;
    setDoc(next);
    setSaveTick((value) => value + 1);
  };

  const editing = useMemo(
    () => (editingId ? doc?.devices.find((device) => device.id === editingId) ?? null : null),
    [doc, editingId],
  );

  const visibleDevices = useMemo(() => {
    if (!doc) return [];
    const found = searchDevices(doc, query);
    const byGroup = groupFilter
      ? found.filter((device) => deviceGroupIds(device).includes(groupFilter))
      : found;
    return [...byGroup].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [doc, query, groupFilter]);

  const counts = doc ? projectCounts(doc) : { devices: 0, ports: 0, ips: 0, links: 0, groups: 0 };
  const issues = useMemo(() => (doc ? validateProject(doc) : []), [doc]);
  const issueBadge = errorCount(issues) + warningCount(issues);

  const flush = async () => {
    const current = docRef.current;
    if (current) await saveProject(current);
  };

  const goBack = async () => {
    await flush();
    onBack();
  };

  const addDevice = () => {
    if (!doc) return;
    const device: Device = createDevice({
      name: uniqueDeviceName(doc),
      kind: 'pc',
      canvas: { x: 80, y: 80 },
    });
    apply((current) => ({ ...current, devices: [...current.devices, device] }));
    setEditingId(device.id);
  };

  const deleteDevice = (device: Device) => {
    if (!window.confirm(t('projects.confirmDeleteDevice', { name: device.name }))) return;
    apply((current) => ({
      ...current,
      devices: current.devices.filter((item) => item.id !== device.id),
      links: current.links.filter(
        (link) => link.a.deviceId !== device.id && link.b.deviceId !== device.id,
      ),
    }));
    if (editingId === device.id) setEditingId(null);
  };

  const addGroup = () => {
    const trimmed = groupName.trim();
    if (!trimmed) return;
    const group = createGroup(trimmed);
    apply((current) => ({ ...current, groups: [...current.groups, group] }));
    setGroupName('');
    setGroupOpen(false);
    setGroupFilter(group.id);
  };

  const renameGroup = (id: string, name: string) => {
    apply((current) => ({
      ...current,
      groups: current.groups.map((group) => (group.id === id ? { ...group, name } : group)),
    }));
  };

  const removeGroup = (name: string, id: string) => {
    if (!window.confirm(t('projects.groupDeleteConfirm', { name }))) return;
    apply((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== id),
      devices: current.devices.map((device) => {
        const ids = deviceGroupIds(device).filter((groupId) => groupId !== id);
        return { ...device, groupIds: ids, groupId: ids[0] ?? null };
      }),
    }));
    if (groupFilter === id) setGroupFilter('');
  };

  const exportJson = async () => {
    if (!doc) return;
    await flush();
    try {
      await downloadText(`${safeFilename(doc.name)}.netmap.json`, exportDocument(doc));
    } catch (error) {
      console.error('[export json]', error);
    }
  };

  const exportCsv = async () => {
    if (!doc) return;
    try {
      await downloadText(`${safeFilename(doc.name)}.csv`, devicesCsv(doc), 'text/csv');
    } catch (error) {
      console.error('[export csv]', error);
    }
  };

  const removeProject = async () => {
    if (!doc) return;
    if (!window.confirm(t('projects.confirmDelete', { name: doc.name }))) return;
    await deleteProject(doc.id);
    onDeleted();
  };

  const fullscreen = () => {
    const page = document.querySelector('.project-page');
    if (!document.fullscreenElement) void page?.requestFullscreen?.();
    else void document.exitFullscreen?.();
  };

  const renameProject = (value: string) => {
    apply((current) => ({ ...current, name: value }), { history: false });
    onRenamed();
  };

  if (loading) {
    return <div class="muted">{t('projects.loading')}</div>;
  }

  if (!doc) {
    return (
      <div class="stack">
        <button type="button" class="btn" onClick={onBack}>
          ← {t('projects.back')}
        </button>
        <div class="empty-state">
          <h3>{t('projects.notFound')}</h3>
        </div>
      </div>
    );
  }

  return (
    <div class="project-page canvas-mode">
      <div class="project-chrome" ref={chromeRef}>
        <button
          type="button"
          class="btn btn-ghost btn-icon chrome-menu-btn"
          title={t('nav.menu')}
          onClick={onMenu}
        >
          <IconMenu size={18} />
        </button>
        <input
          class="chrome-title"
          value={doc.name}
          aria-label={t('projects.name')}
          spellcheck={false}
          onInput={(event) => renameProject((event.target as HTMLInputElement).value)}
          onBlur={() => void flush()}
        />
        <span class={`save-dot ${saveState}`} title={saveState === 'saving' ? t('projects.saving') : t('projects.saved')}>
          {saveState === 'saving' ? <span class="spinner" /> : <IconCheck size={14} />}
        </span>

        <span class="chrome-spacer" />

        <button
          type="button"
          class="btn btn-ghost btn-icon chrome-mobile"
          title={`${t('canvas.undo')} (Ctrl+Z)`}
          onClick={undo}
        >
          <IconUndo size={16} />
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-icon chrome-mobile"
          title={`${t('canvas.redo')} (Ctrl+Y)`}
          onClick={redo}
        >
          <IconRedo size={16} />
        </button>
        <button
          type="button"
          class={`btn btn-ghost btn-icon chrome-mobile${layersOpen ? ' btn-primary' : ''}`}
          title={t('canvas.layers')}
          onClick={() => setLayersOpen((value) => !value)}
        >
          <IconLayers size={16} />
        </button>

        <button
          type="button"
          class="btn btn-ghost btn-icon"
          title={t('projects.menu')}
          onClick={() => setProjectMenu((value) => !value)}
        >
          <IconMore size={16} />
        </button>
        <button type="button" class="btn btn-ghost btn-icon" title={t('canvas.panel.fullscreen')} onClick={fullscreen}>
          <IconExpand size={16} />
        </button>

        {projectMenu && (
          <div class="chrome-menu" role="menu">
            <button type="button" onClick={() => { setProjectMenu(false); void exportJson(); }}>
              {t('projects.export')} JSON
            </button>
            <button type="button" onClick={() => { setProjectMenu(false); void exportCsv(); }}>
              {t('projects.export')} CSV
            </button>
            <button type="button" onClick={() => { setProjectMenu(false); onTogglePin(); }}>
              ★ {pinned ? t('projects.unpin') : t('projects.pin')}
            </button>
            <button type="button" onClick={() => { setProjectMenu(false); void goBack(); }}>
              ← {t('projects.back')}
            </button>
            <button type="button" class="danger" onClick={() => void removeProject()}>
              {t('projects.delete')}
            </button>
          </div>
        )}
      </div>

      <div class="canvas-host">
        <CanvasView
          doc={doc}
          onChange={apply}
          onEditDevice={(deviceId) => setEditingId(deviceId)}
          onUndo={undo}
          onRedo={redo}
          layersOpen={layersOpen}
          onToggleLayers={() => setLayersOpen((value) => !value)}
          bottomActions={[
            {
              id: 'devices',
              label: t('canvas.panel.devices'),
              count: counts.devices,
              onClick: () => setPanel('devices'),
            },
            {
              id: 'plan',
              label: t('canvas.panel.plan'),
              count: doc.ipPlan.blocks.length,
              onClick: () => setPanel('plan'),
            },
            {
              id: 'checks',
              label: t('canvas.panel.checks'),
              count: issueBadge,
              warn: issueBadge > 0,
              onClick: () => setPanel('checks'),
            },
          ]}
        />
      </div>

      {panel && (
        <div
          class="canvas-panel-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPanel(null);
          }}
        >
          <aside class={`canvas-panel panel-${panel}`} aria-label={t('canvas.panel.devices')}>
            <div class="canvas-panel-head">
              <strong>
                {panel === 'devices'
                  ? t('canvas.panel.devices')
                  : panel === 'plan'
                    ? t('canvas.panel.plan')
                    : t('canvas.panel.checks')}
              </strong>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                title={t('canvas.panel.close')}
                onClick={() => setPanel(null)}
              >
                ✕
              </button>
            </div>
            <div class="canvas-panel-body">
              {panel === 'devices' && (
                <div class="stack">
                  <div class="toolbar">
                    <input
                      class="input toolbar-search"
                      placeholder={t('projects.search')}
                      value={query}
                      onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
                    />
                    <select
                      class="input select"
                      value={groupFilter}
                      onChange={(event) => setGroupFilter((event.target as HTMLSelectElement).value)}
                    >
                      <option value="">{t('projects.allGroups')}</option>
                      {doc.groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" class="btn" onClick={() => setGroupOpen(true)}>
                      ＋ {t('projects.addGroup')}
                    </button>
                    <button
                      type="button"
                      class="btn"
                      title={t('projects.groupsTitle')}
                      onClick={() => setGroupsOpen(true)}
                    >
                      {t('projects.groups')}
                    </button>
                    <button type="button" class="btn btn-primary" onClick={addDevice}>
                      ＋ {t('projects.addDevice')}
                    </button>
                  </div>
                  {visibleDevices.length === 0 ? (
                    <div class="muted">{t('projects.noDevices')}</div>
                  ) : (
                    <DeviceTable
                      doc={doc}
                      devices={visibleDevices}
                      onEdit={(device) => setEditingId(device.id)}
                      onDelete={deleteDevice}
                    />
                  )}
                </div>
              )}
              {panel === 'plan' && <PlanTab doc={doc} onChange={apply} />}
              {panel === 'checks' && (
                <ChecksTab doc={doc} onOpenDevice={(deviceId) => setEditingId(deviceId)} />
              )}
            </div>
          </aside>
        </div>
      )}

      {editing && (
        <DeviceEditor
          doc={doc}
          device={editing}
          onChange={(updater) =>
            apply((current) => ({
              ...current,
              devices: current.devices.map((item) =>
                item.id === editing.id ? updater(item) : item,
              ),
            }))
          }
          onClose={() => setEditingId(null)}
          onDelete={() => deleteDevice(editing)}
        />
      )}

      {groupOpen && (
        <Modal
          title={t('projects.addGroup')}
          onClose={() => setGroupOpen(false)}
          footer={
            <>
              <button type="button" class="btn" onClick={() => setGroupOpen(false)}>
                {t('projects.cancel')}
              </button>
              <button type="button" class="btn btn-primary" onClick={addGroup}>
                {t('common.add')}
              </button>
            </>
          }
        >
          <label class="field-label" for="group-name">
            {t('projects.groupName')}
          </label>
          <input
            id="group-name"
            class="input"
            autofocus
            value={groupName}
            placeholder="LAN"
            onInput={(event) => setGroupName((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addGroup();
            }}
          />
        </Modal>
      )}

      {groupsOpen && (
        <Modal
          title={t('projects.groupsTitle')}
          onClose={() => setGroupsOpen(false)}
          footer={
            <button type="button" class="btn" onClick={() => setGroupsOpen(false)}>
              {t('common.close')}
            </button>
          }
        >
          {doc.groups.length === 0 ? (
            <div class="muted" style={{ fontSize: '12.5px' }}>
              {t('projects.groupsEmpty')}
            </div>
          ) : (
            <div class="group-manage-list">
              {doc.groups.map((group) => (
                <div class="group-manage-row" key={group.id}>
                  <input
                    class="input"
                    value={group.name}
                    onInput={(event) =>
                      renameGroup(group.id, (event.target as HTMLInputElement).value)
                    }
                  />
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon"
                    title={t('projects.groupDelete')}
                    onClick={() => removeGroup(group.name, group.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div class="form-hint" style={{ marginTop: '10px' }}>
            {t('projects.groupsHint')}
          </div>
        </Modal>
      )}
    </div>
  );
}
