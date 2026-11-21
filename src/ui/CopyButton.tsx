import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { IconCheck, IconCopy } from './icons';

interface CopyButtonProps {
  value: string;
  title?: string;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyButton({ value, title }: CopyButtonProps) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      class={`copy-btn${done ? ' done' : ''}`}
      title={title ?? t('common.copy')}
      aria-label={title ?? t('common.copy')}
      onClick={(event) => {
        event.stopPropagation();
        void copyText(value).then((ok) => {
          if (!ok) return;
          setDone(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setDone(false), 1300);
        });
      }}
    >
      {done ? <IconCheck size={14} /> : <IconCopy size={14} />}
    </button>
  );
}
