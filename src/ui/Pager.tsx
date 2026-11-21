import { useEffect, useState } from 'preact/hooks';
import { groupDigits } from '../core/ip';
import { t } from '../i18n';
import { compactBig } from './format';
import { IconFirst, IconLast, IconNext, IconPrev } from './icons';

interface PagerProps {
  total: bigint;
  offset: bigint;
  pageSize: number;
  onOffset: (offset: bigint) => void;
  onPageSize?: (size: number) => void;
  totalLabel?: string;
}

const PAGE_SIZES = [25, 50, 100, 250, 1000];

export function Pager({ total, offset, pageSize, onOffset, onPageSize, totalLabel }: PagerProps) {
  const pages = total <= 0n ? 1n : (total + BigInt(pageSize) - 1n) / BigInt(pageSize);
  const page = offset / BigInt(pageSize) + 1n;
  const [jump, setJump] = useState('');

  useEffect(() => {
    setJump('');
  }, [offset, pageSize]);

  const go = (target: bigint) => {
    const clamped = target < 1n ? 1n : target > pages ? pages : target;
    onOffset((clamped - 1n) * BigInt(pageSize));
  };

  const jumpTo = () => {
    if (!/^\d+$/.test(jump.trim())) return;
    go(BigInt(jump.trim()));
  };

  return (
    <div class="pager">
      <div class="pager-info" title={`${t('pager.page')} ${groupDigits(page)} ${t('pager.of')} ${groupDigits(pages)}`}>
        {totalLabel ? `${totalLabel} · ` : ''}
        {t('pager.page')} {compactBig(page)} {t('pager.of')} {compactBig(pages)}
      </div>

      <button
        type="button"
        class="btn btn-icon"
        title={t('pager.first')}
        disabled={page <= 1n}
        onClick={() => go(1n)}
      >
        <IconFirst size={15} />
      </button>
      <button
        type="button"
        class="btn btn-icon"
        title={t('pager.prev')}
        disabled={page <= 1n}
        onClick={() => go(page - 1n)}
      >
        <IconPrev size={15} />
      </button>

      <input
        class="input pager-jump mono"
        placeholder="№"
        title={t('pager.jumpTitle')}
        value={jump}
        inputMode="numeric"
        onInput={(event) => setJump((event.target as HTMLInputElement).value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            jumpTo();
          }
        }}
      />

      <button
        type="button"
        class="btn btn-icon"
        title={t('pager.next')}
        disabled={page >= pages}
        onClick={() => go(page + 1n)}
      >
        <IconNext size={15} />
      </button>
      <button
        type="button"
        class="btn btn-icon"
        title={t('pager.last')}
        disabled={page >= pages}
        onClick={() => go(pages)}
      >
        <IconLast size={15} />
      </button>

      {onPageSize && (
        <select
          class="input select pager-size"
          value={pageSize}
          title={t('hosts.pageSize')}
          onChange={(event) => onPageSize(Number((event.target as HTMLSelectElement).value))}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
