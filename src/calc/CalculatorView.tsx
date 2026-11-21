import { useEffect, useMemo, useState } from 'preact/hooks';
import { storage } from '../app/storage';
import {
  addHistoryEntry,
  makeHistoryEntry,
  removeHistoryEntry,
  toggleFavorite,
  type HistoryEntry,
} from '../core/history';
import { formatAddress, parseCidr, IpError, type Cidr } from '../core/ip';
import { type Block, makeBlock } from '../core/subnet';
import { t } from '../i18n';
import { HistoryPanel } from './HistoryPanel';
import { HostsTab } from './HostsTab';
import { RangesTab } from './RangesTab';
import { SubnetsTab } from './SubnetsTab';
import { SummaryTab } from './SummaryTab';

type Tab = 'summary' | 'subnets' | 'hosts' | 'ranges';

interface Analysis {
  cidr: Cidr;
  block: Block;
}

type ParseResult = { ok: true; analysis: Analysis } | { ok: false; error: string };

const HISTORY_KEY = 'calc.history';
const DEFAULT_INPUT = '192.168.1.10/24';

const EXAMPLES = [
  '192.168.1.0/24',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '100.64.0.0/10',
  '198.18.0.0/15',
  '2001:db8::/48',
  'fe80::1/64',
  '0.0.0.0/0',
  '::/0',
];

function analyse(input: string): ParseResult {
  try {
    const cidr = parseCidr(input);
    return { ok: true, analysis: { cidr, block: makeBlock(cidr.family, cidr.address, cidr.prefix) } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof IpError ? error.message : String(error),
    };
  }
}

export function CalculatorView() {
  const [raw, setRaw] = useState(DEFAULT_INPUT);
  const [tab, setTab] = useState<Tab>('summary');
  const [hostsBlock, setHostsBlock] = useState<Block | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [flash, setFlash] = useState(false);

  const parsed = useMemo(() => analyse(raw), [raw]);
  const [lastValid, setLastValid] = useState<Analysis>(() => {
    const result = analyse(DEFAULT_INPUT);
    if (!result.ok) throw new Error('Некорректный адрес по умолчанию');
    return result.analysis;
  });

  useEffect(() => {
    if (parsed.ok) setLastValid(parsed.analysis);
  }, [parsed]);

  useEffect(() => {
    setHostsBlock(null);
  }, [lastValid]);

  useEffect(() => {
    void storage.get<HistoryEntry[]>(HISTORY_KEY).then((list) => {
      if (Array.isArray(list)) setHistory(list);
      setHistoryLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (historyLoaded) void storage.set(HISTORY_KEY, history);
  }, [history, historyLoaded]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(false), 1500);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const remember = () => {
    if (!parsed.ok) return;
    setHistory((list) => addHistoryEntry(list, makeHistoryEntry(parsed.analysis.cidr)));
    setFlash(true);
  };

  const toggleBit = (address: bigint) => {
    const { family, prefix } = lastValid.cidr;
    setRaw(`${formatAddress(family, address)}/${prefix}`);
  };

  const pickHistory = (entry: HistoryEntry) => {
    setRaw(entry.cidr);
    setTab('summary');
    setHostsBlock(null);
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'summary', label: t('calc.tab.summary') },
    { id: 'subnets', label: t('calc.tab.subnets') },
    { id: 'hosts', label: t('calc.tab.hosts') },
    { id: 'ranges', label: t('calc.tab.ranges') },
  ];

  const currentFamily = parsed.ok ? parsed.analysis.cidr.family : lastValid.cidr.family;

  return (
    <div>
      <header class="topbar">
        <div>
          <h1 class="page-title">{t('calc.title')}</h1>
          <p class="page-subtitle">{t('calc.subtitle')}</p>
        </div>
      </header>

      <section class="card search-card">
        <label class="field-label" for="cidr-input">
          {t('calc.input.label')}
        </label>
        <div class="search-row">
          <div class="search-input-wrap">
            <input
              id="cidr-input"
              class="input mono search-input"
              placeholder={t('calc.input.placeholder')}
              value={raw}
              spellcheck={false}
              autocomplete="off"
              autofocus
              onInput={(event) => setRaw((event.target as HTMLInputElement).value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  remember();
                }
              }}
            />
            <div class="family-pill">
              <span class={`badge ${currentFamily === 4 ? 'badge-accent' : 'badge-violet'}`}>
                {currentFamily === 4 ? 'IPv4' : 'IPv6'}
              </span>
            </div>
          </div>
          <button type="button" class="btn btn-primary" disabled={!parsed.ok} onClick={remember}>
            {flash ? t('calc.remembered') : t('calc.remember')}
          </button>
        </div>

        <div class="search-meta">
          <span class="muted" style={{ fontSize: '12px' }}>
            {t('calc.examples')}:
          </span>
          {EXAMPLES.map((example) => (
            <button type="button" class="chip mono" key={example} onClick={() => setRaw(example)}>
              {example}
            </button>
          ))}
        </div>

        {!parsed.ok && (
          <div class="error-box">
            <strong>{t('calc.input.error')}:</strong> {parsed.error}
          </div>
        )}
      </section>

      <div class="tabs">
        {tabs.map((item) => (
          <button
            type="button"
            key={item.id}
            class={`tab${tab === item.id ? ' active' : ''}`}
            onClick={() => {
              if (item.id === 'hosts') setHostsBlock(null);
              setTab(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <SummaryTab
          cidr={lastValid.cidr}
          block={lastValid.block}
          onToggleBit={toggleBit}
          side={
            <HistoryPanel
              entries={history}
              onPick={pickHistory}
              onToggleFavorite={(id) => setHistory((list) => toggleFavorite(list, id))}
              onRemove={(id) => setHistory((list) => removeHistoryEntry(list, id))}
              onClear={() => setHistory([])}
            />
          }
        />
      )}

      {tab === 'subnets' && (
        <SubnetsTab
          block={lastValid.block}
          onShowHosts={(block) => {
            setHostsBlock(block);
            setTab('hosts');
          }}
        />
      )}

      {tab === 'hosts' && <HostsTab block={hostsBlock ?? lastValid.block} />}

      {tab === 'ranges' && (
        <RangesTab address={lastValid.cidr.address} family={lastValid.cidr.family} />
      )}
    </div>
  );
}
