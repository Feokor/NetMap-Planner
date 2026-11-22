import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Modal } from './Modal';
import { t } from '../i18n';
import { loadTemplates } from '../app/templates';
import { portsLabel } from '../core/templates';
import type { DeviceTemplate } from '../core/templates';

interface TemplatePickerProps {
  onPick: (template: DeviceTemplate | null) => void;
  onClose: () => void;
  onOpenLibrary?: () => void;
}

export function TemplatePicker({ onPick, onClose, onOpenLibrary }: TemplatePickerProps) {
  const [items, setItems] = useState<DeviceTemplate[] | null>(null);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void loadTemplates().then((loaded) => {
      if (!cancelled) setItems(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const list = items ?? [];
    const search = query.trim().toLowerCase();
    if (!search) return list;
    return list.filter((item) =>
      [item.name, item.kind, item.layer, ...item.ports.map((port) => port.name)]
        .join(' ')
        .toLowerCase()
        .includes(search),
    );
  }, [items, query]);

  const favorites = filtered.filter((item) => item.favorite);

  const renderCard = (template: DeviceTemplate) => (
    <button
      type="button"
      class="template-card"
      key={template.id}
      onClick={() => onPick(template)}
    >
      <strong>{template.name}</strong>
      <span class="muted">
        {t(`devkind.${template.kind}`)} · {portsLabel(template.ports.length)} · {template.layer}
      </span>
    </button>
  );

  return (
    <Modal
      title={t('templates.pickTitle')}
      onClose={onClose}
      footer={
        <button type="button" class="btn" onClick={onClose}>
          {t('projects.cancel')}
        </button>
      }
    >
      <div class="template-picker">
        <button type="button" class="template-card template-empty" onClick={() => onPick(null)}>
          <strong>{t('templates.empty')}</strong>
          <span class="muted">{t('templates.hint')}</span>
        </button>

        <input
          ref={inputRef}
          class="input"
          placeholder={t('templates.searchPlaceholder')}
          value={query}
          onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
        />

        {items === null ? (
          <div class="muted">{t('projects.loading')}</div>
        ) : items.length === 0 ? (
          <div class="template-empty-state">
            <div class="muted">{t('templates.noTemplates')}</div>
            {onOpenLibrary && (
              <button type="button" class="btn" onClick={onOpenLibrary}>
                {t('templates.openLibrary')}
              </button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div class="muted">{t('canvas.searchEmpty')}</div>
        ) : (
          <>
            {favorites.length > 0 && !query.trim() && (
              <>
                <div class="template-section">{t('templates.favorites')}</div>
                <div class="template-grid">{favorites.map(renderCard)}</div>
              </>
            )}
            <div class="template-section">{query.trim() ? t('canvas.searchResults', { n: String(filtered.length) }) : t('templates.all')}</div>
            <div class="template-grid">
              {filtered.filter((item) => query.trim() || !item.favorite).map(renderCard)}
            </div>
            {onOpenLibrary && (
              <button type="button" class="btn template-more" onClick={onOpenLibrary}>
                {t('templates.openLibrary')}
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
