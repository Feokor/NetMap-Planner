import { useEffect, useMemo, useState } from 'preact/hooks';
import { loadTemplates, saveTemplates } from '../app/templates';
import {
  portsLabel,
  uniqueTemplateName,
  type DeviceTemplate,
} from '../core/templates';
import { t } from '../i18n';
import { IconCopy, IconEdit, IconPlus, IconStar, IconTrash } from '../ui/icons';
import { TemplateEditor } from '../ui/TemplateEditor';

interface TemplatesViewProps {
  onBack: () => void;
}

function blankTemplate(): DeviceTemplate {
  const now = Date.now();
  return {
    id: `tpl_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    kind: 'pc',
    layer: 'L3',
    tags: [],
    ports: [{ name: 'eth0', media: 'copper', speed: '1G', mode: 'access' }],
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function TemplatesView({ onBack }: TemplatesViewProps) {
  const [items, setItems] = useState<DeviceTemplate[] | null>(null);
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [editor, setEditor] = useState<{ initial: DeviceTemplate; title: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadTemplates().then((loaded) => {
      if (!cancelled) setItems(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const list = items ?? [];
    const search = query.trim().toLowerCase();
    return list.filter((item) => {
      if (favoritesOnly && !item.favorite) return false;
      if (!search) return true;
      return [item.name, item.kind, item.layer, ...item.ports.map((port) => port.name)]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  }, [items, query, favoritesOnly]);

  const persist = async (next: DeviceTemplate[]) => {
    setItems(next);
    await saveTemplates(next);
  };

  const toggleFavorite = (item: DeviceTemplate) => {
    if (!items) return;
    void persist(
      items.map((entry) =>
        entry.id === item.id
          ? { ...entry, favorite: !entry.favorite, updatedAt: Date.now() }
          : entry,
      ),
    );
  };

  const duplicate = (item: DeviceTemplate) => {
    if (!items) return;
    const copy: DeviceTemplate = {
      ...item,
      id: `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: uniqueTemplateName(items, `${item.name} копия`),
      favorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [...item.tags],
      ports: item.ports.map((port) => ({ ...port })),
    };
    void persist([...items, copy]);
  };

  const remove = (item: DeviceTemplate) => {
    if (!items) return;
    if (!window.confirm(t('templates.deleteConfirm', { name: item.name }))) return;
    void persist(items.filter((entry) => entry.id !== item.id));
  };

  const saveEditor = (template: DeviceTemplate) => {
    if (!items) return;
    const exists = items.some((entry) => entry.id === template.id);
    const named = exists
      ? template
      : { ...template, name: uniqueTemplateName(items, template.name) };
    const next = exists
      ? items.map((entry) => (entry.id === template.id ? named : entry))
      : [...items, named];
    void persist(next);
    setEditor(null);
  };

  return (
    <div class="projects-page">
      <header class="topbar">
        <div>
          <h1 class="page-title">{t('templates.library')}</h1>
          <p class="page-subtitle">{t('templates.subtitle')}</p>
        </div>
        <div class="inline">
          <button type="button" class="btn" onClick={onBack}>
            ← {t('projects.title')}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => setEditor({ initial: blankTemplate(), title: t('templates.new') })}
          >
            <IconPlus size={15} /> {t('templates.new')}
          </button>
        </div>
      </header>

      <div class="inline template-toolbar">
        <input
          class="input"
          placeholder={t('templates.searchPlaceholder')}
          value={query}
          onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
        />
        <label class="template-filter">
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(event) => setFavoritesOnly((event.target as HTMLInputElement).checked)}
          />
          {t('templates.favorites')}
        </label>
        <span class="muted">{t('templates.count', { n: String(filtered.length) })}</span>
      </div>

      {items === null ? (
        <div class="muted">{t('projects.loading')}</div>
      ) : filtered.length === 0 ? (
        <div class="empty-state">
          <IconStar size={28} />
          <h3>{t('templates.noTemplates')}</h3>
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => setEditor({ initial: blankTemplate(), title: t('templates.new') })}
          >
            <IconPlus size={15} /> {t('templates.new')}
          </button>
        </div>
      ) : (
        <div class="template-grid template-library">
          {filtered.map((item) => (
            <div class="template-card template-manage" key={item.id}>
              <div class="template-manage-head">
                <strong>{item.name}</strong>
                <button
                  type="button"
                  class={`btn btn-ghost btn-icon${item.favorite ? ' active' : ''}`}
                  title={t('templates.favorite')}
                  onClick={() => toggleFavorite(item)}
                >
                  <IconStar size={14} />
                </button>
              </div>
              <span class="muted">
                {t(`devkind.${item.kind}`)} · {portsLabel(item.ports.length)} · {item.layer}
              </span>
              <div class="template-manage-actions">
                <button
                  type="button"
                  class="btn btn-ghost btn-icon"
                  title={t('templates.edit')}
                  onClick={() =>
                    setEditor({ initial: item, title: t('templates.edit') })
                  }
                >
                  <IconEdit size={14} />
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-icon"
                  title={t('projects.duplicate')}
                  onClick={() => duplicate(item)}
                >
                  <IconCopy size={14} />
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-icon"
                  title={t('templates.deleteConfirm', { name: item.name })}
                  onClick={() => remove(item)}
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editor && (
        <TemplateEditor
          title={editor.title}
          initial={editor.initial}
          onSave={saveEditor}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
