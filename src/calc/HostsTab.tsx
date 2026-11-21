import { useEffect, useMemo, useState } from 'preact/hooks';
import { formatAddress, groupDigits, humanCount, reverseDns } from '../core/ip';
import {
  type Block,
  type HostRole,
  blockSizeOf,
  blockToString,
  hostsPage,
  usableRange,
} from '../core/subnet';
import { t } from '../i18n';
import { CopyButton } from '../ui/CopyButton';
import { shortBig } from '../ui/format';
import { Pager } from '../ui/Pager';

interface HostsTabProps {
  block: Block;
}

const ROLE_CLASS: Record<HostRole, string> = {
  network: 'badge-neutral',
  broadcast: 'badge-accent',
  host: 'badge-ok',
  anycast: 'badge-violet',
  single: 'badge-ok',
  'point-to-point': 'badge-ok',
};

export function HostsTab({ block }: HostsTabProps) {
  const [offset, setOffset] = useState(0n);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    setOffset(0n);
  }, [block.family, block.address, block.prefix]);

  const total = blockSizeOf(block);
  const rows = useMemo(() => hostsPage(block, offset, pageSize), [block, offset, pageSize]);
  const range = usableRange(block);
  const showReversed = block.family === 4 ? block.prefix >= 24 : block.prefix >= 120;

  return (
    <div class="stack">
      <section class="card card-pad">
        <div class="inline" style={{ gap: '10px' }}>
          <div class="kv-label" style={{ margin: 0 }}>
            {t('hosts.title')}
          </div>
          <span class="badge badge-accent mono">{blockToString(block)}</span>
          <span class="badge badge-neutral">{block.family === 4 ? t('common.v4') : t('common.v6')}</span>
          <div class="spacer" />
          <span class="muted" style={{ fontSize: '12.5px' }}>
            {humanCount(total)} адресов
          </span>
        </div>
        {range && (
          <div class="mono" style={{ marginTop: '8px', fontSize: '12.5px', color: 'var(--muted)' }}>
            {formatAddress(block.family, range.first)} – {formatAddress(block.family, range.last)}
          </div>
        )}

        {block.family === 4 && block.prefix === 31 && (
          <div class="hint warn" style={{ marginTop: '12px' }}>
            {t('summary.note.rfc3021')}
          </div>
        )}
        {block.family === 4 && block.prefix === 32 && (
          <div class="hint warn" style={{ marginTop: '12px' }}>
            {t('summary.note.host32')}
          </div>
        )}
        {block.family === 6 && (
          <div class="hint violet" style={{ marginTop: '12px' }}>
            {t('summary.note.anycast')}
          </div>
        )}
      </section>

      <section class="card">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style={{ width: '90px' }}>{t('hosts.column.index')}</th>
                <th>{t('hosts.column.address')}</th>
                <th>{t('hosts.column.role')}</th>
                {showReversed && <th>{t('hosts.column.reversed')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const address = formatAddress(block.family, row.address);
                return (
                  <tr key={row.index.toString()} class={row.usable ? '' : 'row-disabled'}>
                    <td class="num" title={groupDigits(row.index + 1n)}>
                      {shortBig(row.index + 1n)}
                    </td>
                    <td class="mono">
                      {address}
                      <CopyButton value={address} />
                    </td>
                    <td>
                      <span class={`badge ${ROLE_CLASS[row.role]}`}>{t(`hosts.role.${row.role}`)}</span>
                    </td>
                    {showReversed && (
                      <td class="mono" style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                        {reverseDns(row.address, block.family)}
                        <CopyButton value={reverseDns(row.address, block.family)} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager
          total={total}
          offset={offset}
          pageSize={pageSize}
          onOffset={setOffset}
          onPageSize={setPageSize}
          totalLabel={`${t('hosts.title')}: ${blockToString(block)}`}
        />
      </section>
    </div>
  );
}
