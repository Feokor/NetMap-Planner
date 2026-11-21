import { useEffect, useRef, useState } from 'preact/hooks';
import { fromBitString, toBitString, type Family } from '../core/ip';
import { t } from '../i18n';

interface BitsViewProps {
  address: bigint;
  family: Family;
  prefix: number;
  onToggle: (address: bigint) => void;
}

/** Сколько бит реально влезает в строку: на телефоне 32 квадратика не помещаются. */
const INDEX_WIDTH = 36;
const BIT_ADVANCE = 24;
const MIN_WIDTH = 240;

function pickPerRow(family: Family, width: number): number {
  const fits = Math.max(8, Math.floor((width - INDEX_WIDTH) / BIT_ADVANCE) + 1);
  const options = family === 4 ? [8, 16, 32] : [8, 16];
  let chosen = 8;
  for (const option of options) {
    if (option <= fits) chosen = option;
  }
  return chosen;
}

export function BitsView({ address, family, prefix, onToggle }: BitsViewProps) {
  const bits = toBitString(address, family);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const update = () => setWidth(Math.max(MIN_WIDTH, element.clientWidth));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const perRow = pickPerRow(family, width || 720);
  const rows: Array<{ start: number; chunk: string }> = [];
  for (let start = 0; start < bits.length; start += perRow) {
    rows.push({ start, chunk: bits.slice(start, start + perRow) });
  }

  const toggleAt = (index: number) => {
    const chars = bits.split('');
    chars[index] = chars[index] === '1' ? '0' : '1';
    onToggle(fromBitString(chars.join(''), family));
  };

  return (
    <div>
      <div class="bits" ref={boxRef}>
        {rows.map((row) => (
          <div class="bits-row" key={row.start}>
            <span class="bits-index">{bits.length - 1 - row.start}</span>
            <div class="bits-group">
              {row.chunk.split('').map((value, offset) => {
                const index = row.start + offset;
                const isNetwork = index < prefix;
                const classes = [
                  'bit',
                  value === '1' ? 'one' : 'zero',
                  isNetwork ? 'network' : 'host',
                  offset > 0 && index % (family === 4 ? 8 : 16) === 0 ? 'octet-start' : '',
                  index === prefix ? 'prefix-edge' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    type="button"
                    key={index}
                    class={classes}
                    title={`Бит ${bits.length - 1 - index}${isNetwork ? ' (сеть)' : ' (хост)'}`}
                    onClick={() => toggleAt(index)}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div class="bits-legend">
        <span>
          <span class="dot network" />
          {t('summary.networkBits')} — /{prefix}
        </span>
        <span>
          <span class="dot host" />
          {t('summary.hostBitsLabel')} — {bits.length - prefix}
        </span>
        <span class="muted">{t('summary.bitsHint')}</span>
      </div>
    </div>
  );
}
