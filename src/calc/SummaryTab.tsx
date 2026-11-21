import type { ComponentChildren } from 'preact';
import {
  type Cidr,
  classfulPrefix,
  classifyAddress,
  formatAddress,
  humanCount,
  maskFromPrefix,
  reverseDns,
  totalCount,
  usableCount,
  wildcardFromPrefix,
} from '../core/ip';
import { type Block, blockLast, blockToString, usableRange } from '../core/subnet';
import { t } from '../i18n';
import { BitsView } from './BitsView';
import { CopyButton } from '../ui/CopyButton';

interface SummaryTabProps {
  cidr: Cidr;
  block: Block;
  onToggleBit: (address: bigint) => void;
  side?: ComponentChildren;
}

function KV({
  label,
  children,
  mono,
  wide,
}: {
  label: string;
  children: ComponentChildren;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div class={`kv${wide ? ' kv-wide' : ''}`}>
      <div class="kv-label">{label}</div>
      <div class={`kv-value${mono ? ' mono' : ''}`}>{children}</div>
    </div>
  );
}

const KIND_BADGE: Record<string, string> = {
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

export function SummaryTab({ cidr, block, onToggleBit, side }: SummaryTabProps) {
  const { family, prefix } = cidr;
  const info = classifyAddress(cidr.address, family);

  const network = blockToString(block);
  const last = formatAddress(family, blockLast(block));
  const mask = formatAddress(family, maskFromPrefix(family, prefix));
  const wildcard = formatAddress(family, wildcardFromPrefix(family, prefix));
  const total = totalCount(prefix, family);
  const usable = usableCount(prefix, family);
  const range = usableRange(block);
  const firstHost = range ? formatAddress(family, range.first) : null;
  const lastHost = range ? formatAddress(family, range.last) : null;
  const reverse = reverseDns(block.address, family);
  const entered = cidr.address !== block.address;
  const cls = info.v4Class;
  const classful = family === 4 ? classfulPrefix(cidr.address) : null;

  const broadcast =
    family === 6
      ? 'нет (IPv6)'
      : prefix >= 32
        ? 'нет (host route)'
        : prefix === 31
          ? 'нет (RFC 3021)'
          : last;

  const notes: string[] = [];
  if (family === 4 && prefix === 31) notes.push(t('summary.note.rfc3021'));
  if (family === 4 && prefix === 32) notes.push(t('summary.note.host32'));
  if (family === 6) notes.push(t('summary.note.anycast'));
  if (prefix === 0) notes.push(t('summary.note.zero'));

  return (
    <div class="summary-layout">
      <div class="stack">
        <section class="card card-pad">
          <div class="inline" style={{ gap: '10px', marginBottom: '16px' }}>
            <span class="mono" style={{ fontSize: '23px', fontWeight: 700, letterSpacing: '-0.3px' }}>
              {formatAddress(family, cidr.address)}/{prefix}
            </span>
            <CopyButton value={`${formatAddress(family, cidr.address)}/${prefix}`} />
            <span class="badge badge-neutral">{family === 4 ? t('common.v4') : t('common.v6')}</span>
            <span class={`badge ${KIND_BADGE[info.kind] ?? 'badge-neutral'}`}>
              {t(`kind.${info.kind}`)}
            </span>
            <span class={`badge ${info.global ? 'badge-ok' : 'badge-neutral'}`}>
              {info.global ? t('summary.global') : t('summary.local')}
            </span>
            {entered && (
              <span class="badge badge-neutral" title={`${t('summary.network')}: ${network}`}>
                {t('summary.asEntered')}
              </span>
            )}
          </div>

          <div class="kv-grid">
            <KV label={t('summary.family')}>
              {family === 4 ? 'IPv4 — 32 бита' : 'IPv6 — 128 бит'}
            </KV>
            <KV label={t('summary.class')}>
              {cls ? (
                <>
                  <span class="badge badge-accent">{cls}</span>
                  {classful && (
                    <span class="muted" style={{ fontSize: '12px' }}>
                      {t('summary.classful')}: /{classful}
                    </span>
                  )}
                </>
              ) : (
                <span class="muted">не применимо</span>
              )}
            </KV>
            <KV label={t('summary.scope')}>
              <span class={`badge ${KIND_BADGE[info.kind] ?? 'badge-neutral'}`}>
                {t(`kind.${info.kind}`)}
              </span>
              <span class="muted" style={{ fontSize: '12.5px' }}>
                {info.label}
              </span>
            </KV>
            <KV label={t('summary.rfc')}>
              {info.rfc ?? <span class="muted">—</span>}
            </KV>
            <KV label={t('summary.visibility')}>
              <span class={`badge ${info.global ? 'badge-ok' : 'badge-warn'}`}>
                {info.global ? t('summary.global') : t('summary.local')}
              </span>
            </KV>
            <KV label={t('summary.reverse')} mono>
              <span style={{ wordBreak: 'break-all' }}>{reverse}</span>
              <CopyButton value={reverse} />
            </KV>
          </div>
        </section>

        <section class="card card-pad">
          <div class="section-title">{t('summary.network')}</div>
          <div class="kv-grid">
            <KV label={t('summary.network')} mono>
              <span>{network}</span>
              <CopyButton value={network} />
            </KV>
            <KV label={t('summary.broadcast')} mono>
              <span>{broadcast}</span>
              {family === 4 && prefix <= 30 && <CopyButton value={last} />}
            </KV>
            <KV label={t('summary.mask')} mono>
              <span>{mask}</span>
              <CopyButton value={mask} />
            </KV>
            <KV label={t('summary.wildcard')} mono>
              <span>{wildcard}</span>
              <CopyButton value={wildcard} />
            </KV>
            <KV label={t('summary.range')} mono>
              {firstHost && lastHost ? (
                <>
                  <span>
                    {firstHost} – {lastHost}
                  </span>
                </>
              ) : (
                <span class="muted">—</span>
              )}
            </KV>
            <KV label={t('summary.firstHost')} mono>
              {firstHost ?? <span class="muted">—</span>}
            </KV>
            <KV label={t('summary.lastHost')} mono>
              {lastHost ?? <span class="muted">—</span>}
            </KV>
            <KV label={t('summary.total')}>
              <strong>{humanCount(total)}</strong>
            </KV>
            <KV label={t('summary.usable')}>
              <strong>{humanCount(usable)}</strong>
            </KV>
            <KV label={t('summary.hostBits')}>
              <span class="mono">{family === 4 ? 32 - prefix : 128 - prefix}</span>
            </KV>
          </div>

          {notes.map((note) => (
            <div class="hint" key={note} style={{ marginTop: '12px' }}>
              {note}
            </div>
          ))}
        </section>

        <section class="card card-pad">
          <div class="section-title">{t('summary.bits')}</div>
          <BitsView
            address={cidr.address}
            family={family}
            prefix={prefix}
            onToggle={onToggleBit}
          />
        </section>
      </div>

      <div class="stack">{side}</div>
    </div>
  );
}
