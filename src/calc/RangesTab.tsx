import { useMemo, useState } from 'preact/hooks';
import {
  type AddressKind,
  type Family,
  formatAddress,
  networkOf,
  specialRanges,
} from '../core/ip';
import { t } from '../i18n';

interface RangesTabProps {
  address: bigint;
  family: Family;
}

const KIND_CLASS: Record<AddressKind, string> = {
  global: 'badge-ok',
  private: 'badge-warn',
  ula: 'badge-warn',
  cgnat: 'badge-warn',
  loopback: 'badge-violet',
  'link-local': 'badge-violet',
  mapped: 'badge-violet',
  nat64: 'badge-violet',
  transition: 'badge-violet',
  multicast: 'badge-accent',
  broadcast: 'badge-accent',
  documentation: 'badge-neutral',
  benchmark: 'badge-neutral',
  reserved: 'badge-neutral',
  unspecified: 'badge-neutral',
};

export function RangesTab({ address, family }: RangesTabProps) {
  const [query, setQuery] = useState('');
  const ranges = specialRanges();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ranges
      .map((range) => {
        const base = formatAddress(range.family, range.base);
        const contains =
          family === range.family
            ? networkOf(address, range.prefix, family) === range.base
            : false;
        return { range, base, contains };
      })
      .filter(({ range, base }) => {
        if (!q) return true;
        return (
          base.includes(q) ||
          range.name.toLowerCase().includes(q) ||
          range.rfc.toLowerCase().includes(q)
        );
      });
  }, [query, ranges, address, family]);

  return (
    <div class="card">
      <div class="card-head">
        <div>
          <h2>{t('ranges.title')}</h2>
          <div class="muted" style={{ fontSize: '12px', marginTop: '2px' }}>
            {t('ranges.subtitle')}
          </div>
        </div>
        <input
          class="input"
          style={{ maxWidth: '280px' }}
          placeholder={t('ranges.search')}
          value={query}
          onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
        />
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{t('ranges.cidr')}</th>
              <th>{t('ranges.name')}</th>
              <th>{t('ranges.rfc')}</th>
              <th>{t('ranges.kind')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ range, base, contains }) => (
              <tr key={`${range.family}-${base}-${range.prefix}`} class={contains ? '' : undefined}>
                <td class="mono">
                  {base}/{range.prefix}
                  <span class="badge badge-neutral" style={{ marginLeft: '8px' }}>
                    {range.family === 4 ? 'IPv4' : 'IPv6'}
                  </span>
                  {contains && (
                    <span class="badge badge-accent" style={{ marginLeft: '6px' }}>
                      {t('ranges.highlight')}
                    </span>
                  )}
                </td>
                <td>{range.name}</td>
                <td class="muted">{range.rfc}</td>
                <td>
                  <span class={`badge ${KIND_CLASS[range.kind]}`}>{t(`kind.${range.kind}`)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
