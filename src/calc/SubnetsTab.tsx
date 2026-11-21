import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  formatAddress,
  groupDigits,
  humanCount,
  maskFromPrefix,
  usableCount,
} from '../core/ip';
import {
  type Block,
  blockLast,
  blockToString,
  planSubnetSplit,
  splitBlockPage,
  subnetCount,
  usableRange,
} from '../core/subnet';
import { t } from '../i18n';
import { CopyButton } from '../ui/CopyButton';
import { shortBig } from '../ui/format';
import { Pager } from '../ui/Pager';

interface SubnetsTabProps {
  block: Block;
  onShowHosts: (block: Block) => void;
}

type SplitMode = 'mask' | 'count';

const DEFAULT_PAGE = 100;
const DEFAULT_COUNT = 2;
const MAX_REQUESTED = 1_000_000_000;

export function SubnetsTab({ block, onShowHosts }: SubnetsTabProps) {
  const maxPrefix = block.family === 4 ? 32 : 128;
  const [mode, setMode] = useState<SplitMode>('mask');
  const [newPrefix, setNewPrefix] = useState(() => Math.min(block.prefix + 1, maxPrefix));
  const [requestedCount, setRequestedCount] = useState(DEFAULT_COUNT);
  const [offset, setOffset] = useState(0n);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE);

  useEffect(() => {
    setNewPrefix(Math.min(block.prefix + 1, maxPrefix));
    setOffset(0n);
  }, [block.family, block.address, block.prefix, maxPrefix]);

  const plan = useMemo(
    () => planSubnetSplit(block, requestedCount),
    [block, requestedCount],
  );

  // В режиме «на N подсетей» префикс считает planSubnetSplit, в режиме маски — поле ввода.
  const activePrefix = mode === 'mask' ? newPrefix : plan.prefix;

  useEffect(() => {
    setOffset(0n);
  }, [activePrefix]);

  const count = useMemo(() => subnetCount(block, activePrefix), [block, activePrefix]);
  const rows = useMemo(
    () => splitBlockPage(block, activePrefix, offset, pageSize),
    [block, activePrefix, offset, pageSize],
  );
  const perSubnet = usableCount(activePrefix, block.family);
  const maskText = formatAddress(block.family, maskFromPrefix(block.family, activePrefix));
  const lastLabel = block.family === 4 ? t('summary.broadcast') : t('subnets.lastAddress');

  const clampPrefix = (value: number) =>
    Math.min(maxPrefix, Math.max(block.prefix, Number.isFinite(value) ? value : block.prefix));

  const clampCount = (value: number) => {
    if (!Number.isFinite(value)) return DEFAULT_COUNT;
    return Math.min(MAX_REQUESTED, Math.max(DEFAULT_COUNT, Math.floor(value)));
  };

  return (
    <div class="stack">
      <section class="card card-pad">
        <div class="tabs" style={{ marginBottom: '0' }}>
          <button
            type="button"
            class={`tab${mode === 'mask' ? ' active' : ''}`}
            onClick={() => setMode('mask')}
          >
            {t('subnets.byMask')}
          </button>
          <button
            type="button"
            class={`tab${mode === 'count' ? ' active' : ''}`}
            onClick={() => setMode('count')}
          >
            {t('subnets.byCount')}
          </button>
        </div>

        <div class="inline" style={{ gap: '18px', alignItems: 'flex-end', marginTop: '18px' }}>
          {mode === 'mask' ? (
            <div>
              <label class="field-label" for="subnet-prefix">
                {t('subnets.newPrefix')}
              </label>
              <div class="inline">
                <input
                  id="subnet-prefix"
                  class="input mono"
                  style={{ width: '110px' }}
                  type="number"
                  min={block.prefix}
                  max={maxPrefix}
                  value={newPrefix}
                  onInput={(event) =>
                    setNewPrefix(clampPrefix(Number((event.target as HTMLInputElement).value)))
                  }
                />
                <button
                  type="button"
                  class="btn btn-icon"
                  disabled={newPrefix <= block.prefix}
                  onClick={() => setNewPrefix(clampPrefix(newPrefix - 1))}
                >
                  −
                </button>
                <button
                  type="button"
                  class="btn btn-icon"
                  disabled={newPrefix >= maxPrefix}
                  onClick={() => setNewPrefix(clampPrefix(newPrefix + 1))}
                >
                  +
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label class="field-label" for="subnet-count">
                {t('subnets.count')}
              </label>
              <div class="inline">
                <input
                  id="subnet-count"
                  class="input mono"
                  style={{ width: '130px' }}
                  type="number"
                  min={DEFAULT_COUNT}
                  max={MAX_REQUESTED}
                  value={requestedCount}
                  onInput={(event) =>
                    setRequestedCount(clampCount(Number((event.target as HTMLInputElement).value)))
                  }
                />
                <button
                  type="button"
                  class="btn btn-icon"
                  disabled={requestedCount <= DEFAULT_COUNT}
                  onClick={() => setRequestedCount(clampCount(requestedCount - 1))}
                >
                  −
                </button>
                <button
                  type="button"
                  class="btn btn-icon"
                  onClick={() => setRequestedCount(clampCount(requestedCount + 1))}
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div class="kv" style={{ flex: 1, minWidth: '220px' }}>
            <div class="kv-label">{t('subnets.result')}</div>
            <div class="kv-value">
              <strong>{humanCount(count)}</strong>
              <span class="badge badge-accent">/{activePrefix}</span>
              <span class="muted mono" style={{ fontSize: '12px' }}>
                {maskText}
              </span>
            </div>
          </div>

          <div class="kv" style={{ minWidth: '180px' }}>
            <div class="kv-label">{t('subnets.hostsEach')}</div>
            <div class="kv-value">
              <strong>{humanCount(perSubnet)}</strong>
            </div>
          </div>
        </div>

        {mode === 'count' && plan.count !== plan.requested && (
          <div class={`hint${plan.clipped ? ' warn' : ''}`} style={{ marginTop: '14px' }}>
            {plan.clipped
              ? t('subnets.clipped', {
                  count: groupDigits(plan.count),
                  prefix: maxPrefix,
                })
              : t('subnets.rounded', {
                  requested: groupDigits(plan.requested),
                  count: groupDigits(plan.count),
                })}
          </div>
        )}

        {block.family === 6 && (
          <div class="hint violet" style={{ marginTop: '14px' }}>
            Диапазон {blockToString(block)}: IPv6-подсети считаются формулами — доступны страницы
            любого диапазона без перебора адресов.
          </div>
        )}
      </section>

      <section class="card">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style={{ width: '64px' }}>#</th>
                <th>{t('summary.network')}</th>
                <th>{lastLabel}</th>
                <th>{t('subnets.hostsRange')}</th>
                <th>{t('summary.usable')}</th>
                <th class="actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((subnet, index) => {
                const last = blockLast(subnet);
                const hosts = usableRange(subnet);
                const usable = usableCount(subnet.prefix, subnet.family);
                const label = blockToString(subnet);
                return (
                  <tr key={label}>
                    <td class="num" title={groupDigits(offset + BigInt(index) + 1n)}>
                      {shortBig(offset + BigInt(index) + 1n)}
                    </td>
                    <td class="mono">
                      {label}
                      <CopyButton value={label} />
                    </td>
                    <td class="mono" style={{ fontSize: '12px' }}>
                      {formatAddress(subnet.family, last)}
                    </td>
                    <td class="mono" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {hosts
                        ? `${formatAddress(subnet.family, hosts.first)} – ${formatAddress(
                            subnet.family,
                            hosts.last,
                          )}`
                        : '—'}
                    </td>
                    <td>{humanCount(usable)}</td>
                    <td class="actions">
                      <button type="button" class="btn" onClick={() => onShowHosts(subnet)}>
                        {t('subnets.viewHosts')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager
          total={count}
          offset={offset}
          pageSize={pageSize}
          onOffset={setOffset}
          onPageSize={setPageSize}
          totalLabel={`${t('subnets.result')}: ${count.toString()}`}
        />
      </section>
    </div>
  );
}
