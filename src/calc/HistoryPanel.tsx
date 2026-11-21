import { useMemo, useState } from 'preact/hooks';
import { formatHistoryDate, searchHistory, type HistoryEntry } from '../core/history';
import { t } from '../i18n';
import { IconSearch, IconStar, IconTrash } from '../ui/icons';

interface HistoryPanelProps {
  entries: HistoryEntry[];
  onPick: (entry: HistoryEntry) => void;
  onToggleFavorite: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function HistoryPanel({
  entries,
  onPick,
  onToggleFavorite,
  onRemove,
  onClear,
}: HistoryPanelProps) {
  const [query, setQuery] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const visible = useMemo(
    () => searchHistory(entries, query, onlyFavorites),
    [entries, query, onlyFavorites],
  );

  return (
    <section class="card">
      <div class="card-head">
        <h2>{t('history.title')}</h2>
        <div class="inline">
          <span class="muted" style={{ fontSize: '12px' }}>
            {t('history.count', { count: entries.length })}
          </span>
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            title={t('history.clear')}
            disabled={entries.length === 0}
            onClick={() => {
              if (window.confirm(t('history.confirmClear'))) onClear();
            }}
          >
            <IconTrash size={15} />
          </button>
        </div>
      </div>

      <div class="history-tools">
        <div class="search-input-wrap" style={{ flex: 1 }}>
          <span
            style={{
              position: 'absolute',
              left: '9px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted-2)',
              display: 'flex',
            }}
          >
            <IconSearch size={14} />
          </span>
          <input
            class="input"
            style={{ paddingLeft: '29px' }}
            placeholder={t('history.search')}
            value={query}
            onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
          />
        </div>
        <label class="checkbox">
          <input
            type="checkbox"
            checked={onlyFavorites}
            onChange={(event) => setOnlyFavorites((event.target as HTMLInputElement).checked)}
          />
          {t('history.onlyFavorites')}
        </label>
      </div>

      <div class="history-list">
        {visible.length === 0 && (
          <div class="muted" style={{ padding: '18px 16px', fontSize: '12.5px' }}>
            {t('history.empty')}
          </div>
        )}
        {visible.map((entry) => (
          <div class="history-item" key={entry.id} onClick={() => onPick(entry)}>
            <button
              type="button"
              class={`history-star${entry.favorite ? ' on' : ''}`}
              title={entry.favorite ? t('history.unfavorite') : t('history.favorite')}
              onClick={(event) => {
                event.stopPropagation();
                onToggleFavorite(entry.id);
              }}
            >
              <IconStar size={14} />
            </button>
            <div class="history-item-main">
              <div class="history-item-cidr">{entry.cidr}</div>
              <div class="history-item-meta">
                <span class="badge badge-neutral">{entry.family === 4 ? 'IPv4' : 'IPv6'}</span>
                <span>/{entry.prefix}</span>
                <span>{formatHistoryDate(entry.createdAt)}</span>
                {entry.note && <span>· {entry.note}</span>}
              </div>
            </div>
            <button
              type="button"
              class="btn btn-ghost btn-icon"
              title={t('history.remove')}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(entry.id);
              }}
            >
              <IconTrash size={13} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
