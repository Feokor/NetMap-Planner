import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

export interface SearchSelectOption {
  value: string;
  label: string;
}

interface SearchSelectProps {
  value: string;
  options: SearchSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Подпись пустого значения; если не задана — пустой пункт не показывается. */
  emptyLabel?: string;
  disabled?: boolean;
  title?: string;
}

/**
 * Выпадающий список с вводом: на телефоне не нужно листать десятки портов,
 * достаточно начать печатать. Работает и мышью, и с клавиатуры.
 */
export function SearchSelect({
  value,
  options,
  onChange,
  placeholder,
  emptyLabel,
  disabled,
  title,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const all = emptyLabel ? [{ value: '', label: emptyLabel }, ...options] : options;
    const search = query.trim().toLowerCase();
    if (!search) return all;
    return all.filter((item) => item.label.toLowerCase().includes(search));
  }, [options, emptyLabel, query]);

  const selected = options.find((item) => item.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setHighlight(0);
    inputRef.current?.focus();
  };

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };

  return (
    <div
      class={`search-select${open ? ' open' : ''}`}
      ref={wrapRef}
      title={title ?? selected?.label ?? placeholder}
    >
      <input
        ref={inputRef}
        class="input search-select-input"
        value={open ? query : selected?.label ?? ''}
        placeholder={selected ? selected.label : placeholder}
        disabled={disabled}
        spellcheck={false}
        onFocus={openMenu}
        onClick={openMenu}
        onInput={(event) => {
          setOpen(true);
          setQuery((event.target as HTMLInputElement).value);
          setHighlight(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setHighlight((current) => Math.min(current + 1, items.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlight((current) => Math.max(current - 1, 0));
          } else if (event.key === 'Enter') {
            if (open && items[highlight]) {
              event.preventDefault();
              choose(items[highlight].value);
            }
          } else if (event.key === 'Escape') {
            setOpen(false);
            setQuery('');
          }
        }}
        onBlur={() => {
          // Даём сработать клику по пункту, затем закрываем.
          window.setTimeout(() => {
            if (!wrapRef.current?.contains(document.activeElement)) {
              setOpen(false);
              setQuery('');
            }
          }, 120);
        }}
      />
      {open && (
        <div class="search-select-menu" role="listbox">
          {items.length === 0 ? (
            <div class="search-select-empty">—</div>
          ) : (
            items.map((item, index) => (
              <button
                type="button"
                key={item.value || '__empty'}
                class={`search-select-option${index === highlight ? ' active' : ''}${item.value === value ? ' selected' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(item.value)}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
