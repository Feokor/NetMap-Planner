import { useMemo, useState } from 'preact/hooks';
import { downloadText, safeFilename } from '../app/projects';
import { dnsRecords, dnsState, exportBind, normalizeZoneName } from '../core/dns';
import { uid, type DnsZone, type ProjectDocument } from '../core/project';
import { t } from '../i18n';
import { IconEdit, IconStar, IconTrash } from '../ui/icons';
import { Modal } from '../ui/Modal';

interface DnsPanelProps {
  doc: ProjectDocument;
  onChange: (updater: (doc: ProjectDocument) => ProjectDocument) => void;
  onClose: () => void;
}

type Tab = 'zones' | 'records' | 'reverse';

export function DnsPanel({ doc, onChange, onClose }: DnsPanelProps) {
  const state = dnsState(doc);
  const records = useMemo(() => dnsRecords(doc), [doc]);
  const [tab, setTab] = useState<Tab>('zones');
  const [zoneInput, setZoneInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const setZones = (zones: DnsZone[]) =>
    onChange((current) => ({ ...current, dns: { ...dnsState(current), zones } }));

  const addZone = () => {
    const name = normalizeZoneName(zoneInput);
    if (!name) {
      setError(t('dns.zoneInvalid'));
      return;
    }
    if (state.zones.some((zone) => zone.name === name)) {
      setError(t('dns.zoneExists', { name }));
      return;
    }
    const zone: DnsZone = {
      id: uid('dns'),
      name,
      default: state.zones.length === 0,
    };
    setZones([...state.zones, zone]);
    setZoneInput('');
    setError(null);
  };

  const makeDefault = (zone: DnsZone) => {
    setZones(state.zones.map((item) => ({ ...item, default: item.id === zone.id })));
  };

  const removeZone = (zone: DnsZone) => {
    if (!window.confirm(t('dns.deleteZoneConfirm', { name: zone.name }))) return;
    const zones = state.zones.filter((item) => item.id !== zone.id);
    if (zone.default && zones.length > 0) zones[0] = { ...zones[0], default: true };
    onChange((current) => ({
      ...current,
      dns: { ...dnsState(current), zones },
      devices: current.devices.map((device) =>
        device.dnsZoneId === zone.id ? { ...device, dnsZoneId: null } : device,
      ),
    }));
  };

  const startRename = (zone: DnsZone) => {
    setEditingId(zone.id);
    setEditingName(zone.name);
    setError(null);
  };

  const saveRename = (zone: DnsZone) => {
    const name = normalizeZoneName(editingName);
    if (!name) {
      setError(t('dns.zoneInvalid'));
      return;
    }
    if (state.zones.some((item) => item.id !== zone.id && item.name === name)) {
      setError(t('dns.zoneExists', { name }));
      return;
    }
    setZones(state.zones.map((item) => (item.id === zone.id ? { ...item, name } : item)));
    setEditingId(null);
    setError(null);
  };

  const setSettings = (patch: Partial<typeof state.settings>) =>
    onChange((current) => ({
      ...current,
      dns: { ...dnsState(current), settings: { ...dnsState(current).settings, ...patch } },
    }));

  const exportTxt = async () => {
    await downloadText(`${safeFilename(doc.name)}.dns.txt`, exportBind(doc));
  };

  const zoneDeviceCount = (zone: DnsZone) =>
    doc.devices.filter(
      (device) =>
        device.dnsZoneId === zone.id || (!device.dnsZoneId && zone.default === true),
    ).length;

  return (
    <Modal
      title={t('dns.title')}
      width="min(820px, 100%)"
      onClose={onClose}
      footer={
        <>
          <button type="button" class="btn" onClick={() => void exportTxt()}>
            {t('dns.exportBind')}
          </button>
          <button type="button" class="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </>
      }
    >
      <div class="tabs dns-tabs">
        <button
          type="button"
          class={`tab${tab === 'zones' ? ' active' : ''}`}
          onClick={() => setTab('zones')}
        >
          {t('dns.tab.zones')}
        </button>
        <button
          type="button"
          class={`tab${tab === 'records' ? ' active' : ''}`}
          onClick={() => setTab('records')}
        >
          {t('dns.tab.records')}
        </button>
        <button
          type="button"
          class={`tab${tab === 'reverse' ? ' active' : ''}`}
          onClick={() => setTab('reverse')}
        >
          {t('dns.tab.reverse')}
        </button>
      </div>

      {tab === 'zones' && (
        <div class="dns-pane">
          <div class="inline" style={{ gap: '8px', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 220px' }}>
              <label class="field-label" for="dns-zone">
                {t('dns.addZone')}
              </label>
              <input
                id="dns-zone"
                class="input mono"
                placeholder="hq.example"
                value={zoneInput}
                onInput={(event) => {
                  setZoneInput((event.target as HTMLInputElement).value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addZone();
                }}
              />
            </div>
            <button type="button" class="btn btn-primary" onClick={addZone} disabled={!zoneInput.trim()}>
              ＋ {t('dns.tab.zones')}
            </button>
          </div>
          {error && <div class="form-error">{error}</div>}
          <div class="form-hint">{t('dns.zonesHint')}</div>

          {state.zones.length === 0 ? (
            <div class="muted">{t('dns.noZones')}</div>
          ) : (
            <div class="dns-zone-list">
              {state.zones.map((zone) => (
                <div class="dns-zone-row" key={zone.id}>
                  {editingId === zone.id ? (
                    <input
                      class="input mono"
                      value={editingName}
                      onInput={(event) => setEditingName((event.target as HTMLInputElement).value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') saveRename(zone);
                        if (event.key === 'Escape') setEditingId(null);
                      }}
                    />
                  ) : (
                    <div class="dns-zone-name">
                      <span class="mono">{zone.name}</span>
                      {zone.default && <span class="badge badge-accent">{t('dns.defaultZone')}</span>}
                      <span class="muted">
                        {t('dns.zoneDevices', {
                          n: String(zoneDeviceCount(zone)),
                        })}
                      </span>
                    </div>
                  )}
                  <div class="dns-zone-actions">
                    {editingId === zone.id ? (
                      <button type="button" class="btn" onClick={() => saveRename(zone)}>
                        {t('projects.save')}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          class={`btn btn-ghost btn-icon${zone.default ? ' active' : ''}`}
                          title={t('dns.makeDefault')}
                          onClick={() => makeDefault(zone)}
                        >
                          <IconStar size={14} />
                        </button>
                        <button
                          type="button"
                          class="btn btn-ghost btn-icon"
                          title={t('dns.renameZone')}
                          onClick={() => startRename(zone)}
                        >
                          <IconEdit size={14} />
                        </button>
                        <button
                          type="button"
                          class="btn btn-ghost btn-icon"
                          title={t('dns.deleteZone')}
                          onClick={() => removeZone(zone)}
                        >
                          <IconTrash size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'records' && (
        <div class="dns-pane">
          {state.zones.length === 0 ? (
            <div class="muted">{t('dns.noZones')}</div>
          ) : records.forward.length === 0 ? (
            <div class="muted">{t('dns.noRecords')}</div>
          ) : (
            <>
              <div class="form-hint">{t('dns.recordsHint')}</div>
              {state.zones.map((zone) => {
                const items = records.forward.filter((record) => record.zone === zone.name);
                if (items.length === 0) return null;
                return (
                  <section key={zone.id} class="dns-record-group">
                    <div class="dns-record-zone mono">{zone.name}</div>
                    <div class="table-wrap">
                      <table class="table dns-table">
                        <thead>
                          <tr>
                            <th>{t('dns.column.name')}</th>
                            <th>{t('dns.column.type')}</th>
                            <th>{t('dns.column.value')}</th>
                            <th>{t('dns.column.device')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((record) => (
                            <tr key={`${record.name}-${record.type}-${record.value}`}>
                              <td class="mono">{record.name}</td>
                              <td>
                                <span class="badge badge-neutral">{record.type}</span>
                              </td>
                              <td class="mono">{record.value}</td>
                              <td class="muted">{record.deviceName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </div>
      )}

      {tab === 'reverse' && (
        <div class="dns-pane">
          <div class="inline" style={{ gap: '10px', flexWrap: 'wrap' }}>
            <label class="dns-radio">
              <input
                type="radio"
                checked={state.settings.reverseMode === 'auto'}
                onChange={() => setSettings({ reverseMode: 'auto' })}
              />
              {t('dns.reverseAuto')}
            </label>
            <label class="dns-radio">
              <input
                type="radio"
                checked={state.settings.reverseMode === 'manual'}
                onChange={() => setSettings({ reverseMode: 'manual' })}
              />
              {t('dns.reverseManual')}
            </label>
            {state.settings.reverseMode === 'manual' && (
              <label class="dns-depth">
                {t('dns.depth')}
                <select
                  class="input select"
                  value={state.settings.reverseDepth}
                  onChange={(event) =>
                    setSettings({ reverseDepth: Number((event.target as HTMLSelectElement).value) })
                  }
                >
                  {[1, 2, 3, 4].map((depth) => (
                    <option key={depth} value={depth}>
                      {depth}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div class="form-hint">
            {state.settings.reverseMode === 'auto' ? t('dns.autoHint') : t('dns.depthHint')}
          </div>
          {records.reverse.length === 0 ? (
            <div class="muted">{t('dns.noRecords')}</div>
          ) : (
            records.reverse.map((zone) => (
              <section key={zone.name} class="dns-record-group">
                <div class="dns-record-zone mono">{zone.name}</div>
                {zone.records.map((record) => (
                  <div class="dns-ptr-row" key={record.name}>
                    <span class="mono">{record.owner}</span>
                    <span class="muted">PTR</span>
                    <span class="mono">{record.value}.</span>
                    <span class="muted">{record.deviceName}</span>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      )}
    </Modal>
  );
}
