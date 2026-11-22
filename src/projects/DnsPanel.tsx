import { useMemo, useState } from 'preact/hooks';
import { downloadText, safeFilename } from '../app/projects';
import { parseAddress } from '../core/ip';
import { dnsRecords, dnsState, exportBind, normalizeZoneName, type ForwardRecord } from '../core/dns';
import {
  uid,
  type DnsManualRecord,
  type DnsManualType,
  type DnsZone,
  type ProjectDocument,
} from '../core/project';
import { t } from '../i18n';
import { IconEdit, IconEyeOff, IconStar, IconTrash } from '../ui/icons';
import { Modal } from '../ui/Modal';
import { SearchSelect } from '../ui/SearchSelect';

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
  const [manual, setManual] = useState<{
    id?: string;
    zoneId: string;
    name: string;
    type: DnsManualType;
    value: string;
  } | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [hideTarget, setHideTarget] = useState<ForwardRecord | null>(null);

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
      dns: {
        ...dnsState(current),
        zones,
        manual: dnsState(current).manual.filter((record) => record.zoneId !== zone.id),
        hidden: dnsState(current).hidden.filter((record) => record.zoneId !== zone.id),
      },
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

  const openManual = (record?: DnsManualRecord) => {
    setManualError(null);
    setManual(
      record
        ? {
            id: record.id,
            zoneId: record.zoneId,
            name: record.name,
            type: record.type,
            value: record.value,
          }
        : {
            zoneId: state.zones.find((zone) => zone.default)?.id ?? state.zones[0]?.id ?? '',
            name: '',
            type: 'A',
            value: '',
          },
    );
  };

  const saveManual = () => {
    if (!manual) return;
    if (!manual.zoneId || !manual.name.trim() || !manual.value.trim()) {
      setManualError(t('dns.recordInvalid'));
      return;
    }
    if (manual.type === 'A' || manual.type === 'AAAA') {
      try {
        const parsed = parseAddress(manual.value.trim());
        if ((manual.type === 'A' && parsed.family !== 4) || (manual.type === 'AAAA' && parsed.family !== 6)) {
          setManualError(t('dns.recordInvalidIp'));
          return;
        }
      } catch {
        setManualError(t('dns.recordInvalidIp'));
        return;
      }
    }
    onChange((current) => {
      const dns = dnsState(current);
      const item: DnsManualRecord = {
        id: manual.id ?? uid('dnsr'),
        zoneId: manual.zoneId,
        name: manual.name.trim(),
        type: manual.type,
        value: manual.value.trim(),
      };
      const list = manual.id
        ? dns.manual.map((record) => (record.id === manual.id ? item : record))
        : [...dns.manual, item];
      return { ...current, dns: { ...dns, manual: list } };
    });
    setManual(null);
  };

  const removeManual = (record: DnsManualRecord) => {
    if (!window.confirm(t('dns.deleteRecordConfirm', { name: record.name }))) return;
    onChange((current) => {
      const dns = dnsState(current);
      return {
        ...current,
        dns: { ...dns, manual: dns.manual.filter((item) => item.id !== record.id) },
      };
    });
  };

  const hideRecord = (permanent: boolean) => {
    if (!hideTarget) return;
    const target = hideTarget;
    onChange((current) => {
      const dns = dnsState(current);
      return {
        ...current,
        dns: {
          ...dns,
          hidden: [
            ...dns.hidden,
            {
              id: uid('dnsh'),
              zoneId: target.zoneId,
              name: target.name,
              type: target.type as 'A' | 'AAAA',
              value: target.value,
              permanent,
            },
          ],
        },
      };
    });
    setHideTarget(null);
  };

  const unhide = (id: string) => {
    onChange((current) => {
      const dns = dnsState(current);
      return { ...current, dns: { ...dns, hidden: dns.hidden.filter((item) => item.id !== id) } };
    });
  };

  const exportTxt = async () => {
    await downloadText(`${safeFilename(doc.name)}.dns.txt`, exportBind(doc));
  };

  const zoneDeviceCount = (zone: DnsZone) =>
    doc.devices.filter(
      (device) =>
        device.dnsZoneId === zone.id || (!device.dnsZoneId && zone.default === true),
    ).length;

  return (
    <>
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
          ) : (
            <>
              <div class="inline" style={{ gap: '10px', flexWrap: 'wrap' }}>
                <div class="form-hint" style={{ flex: '1 1 260px' }}>
                  {t('dns.recordsHint')}
                </div>
                <button type="button" class="btn" onClick={() => openManual()}>
                  ＋ {t('dns.addRecord')}
                </button>
              </div>

              {records.forward.length === 0 ? (
                <div class="muted">{t('dns.noRecords')}</div>
              ) : (
                state.zones.map((zone) => {
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
                              <th>{t('dns.column.source')}</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((record) => (
                              <tr key={record.id ?? `${record.name}-${record.type}-${record.value}`}>
                                <td class="mono">{record.name}</td>
                                <td>
                                  <span class="badge badge-neutral">{record.type}</span>
                                </td>
                                <td class="mono">{record.value}</td>
                                <td>
                                  <span class={`badge ${record.manual ? 'badge-warn' : 'badge-ok'}`}>
                                    {record.manual ? t('dns.source.manual') : t('dns.source.auto')}
                                  </span>
                                  {record.deviceName && (
                                    <span class="muted" style={{ marginLeft: '6px' }}>
                                      {record.deviceName}
                                    </span>
                                  )}
                                </td>
                                <td class="actions">
                                  {record.manual ? (
                                    <div class="inline" style={{ gap: '2px' }}>
                                      <button
                                        type="button"
                                        class="btn btn-ghost btn-icon"
                                        title={t('dns.editRecord')}
                                        onClick={() => {
                                          const item = state.manual.find(
                                            (entry) => entry.id === record.id,
                                          );
                                          if (item) openManual(item);
                                        }}
                                      >
                                        <IconEdit size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        class="btn btn-ghost btn-icon"
                                        title={t('common.delete')}
                                        onClick={() => {
                                          const item = state.manual.find(
                                            (entry) => entry.id === record.id,
                                          );
                                          if (item) removeManual(item);
                                        }}
                                      >
                                        <IconTrash size={13} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      class="btn btn-ghost btn-icon"
                                      title={t('dns.hideRecord')}
                                      onClick={() => setHideTarget(record)}
                                    >
                                      <IconEyeOff size={13} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  );
                })
              )}

              {state.hidden.length > 0 && (
                <details class="dns-hidden">
                  <summary>
                    {t('dns.hiddenCount', { n: String(state.hidden.length) })}
                  </summary>
                  {state.hidden.map((item) => {
                    const zone = state.zones.find((entry) => entry.id === item.zoneId);
                    return (
                      <div class="dns-hidden-row" key={item.id}>
                        <span class="mono">{item.name}</span>
                        <span class="badge badge-neutral">{item.type}</span>
                        <span class="mono">{item.value}</span>
                        <span class="muted">
                          {zone?.name ?? '—'} ·{' '}
                          {item.permanent ? t('dns.hideForever') : t('dns.hideUntilRecalc')}
                        </span>
                        <button type="button" class="btn" onClick={() => unhide(item.id)}>
                          {t('dns.restoreRecord')}
                        </button>
                      </div>
                    );
                  })}
                </details>
              )}
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

      {manual && (
        <Modal
          title={manual.id ? t('dns.editRecord') : t('dns.addRecord')}
          width="min(520px, 100%)"
          onClose={() => setManual(null)}
          footer={
            <>
              <button type="button" class="btn" onClick={() => setManual(null)}>
                {t('projects.cancel')}
              </button>
              <button type="button" class="btn btn-primary" onClick={saveManual}>
                {t('projects.save')}
              </button>
            </>
          }
        >
          <label class="field-label" for="dns-record-zone">
            {t('dns.recordZone')}
          </label>
          <SearchSelect
            value={manual.zoneId}
            placeholder={t('dns.recordZone')}
            onChange={(next) =>
              setManual((current) => (current ? { ...current, zoneId: next } : current))
            }
            options={state.zones.map((zone) => ({ value: zone.id, label: zone.name }))}
          />
          <div class="template-form-row" style={{ marginTop: '12px' }}>
            <div>
              <label class="field-label" for="dns-record-name">
                {t('dns.recordName')}
              </label>
              <input
                id="dns-record-name"
                class="input mono"
                placeholder="@ или www"
                value={manual.name}
                onInput={(event) =>
                  setManual((current) =>
                    current ? { ...current, name: (event.target as HTMLInputElement).value } : current,
                  )
                }
              />
            </div>
            <div>
              <label class="field-label" for="dns-record-type">
                {t('dns.recordType')}
              </label>
              <select
                id="dns-record-type"
                class="input select"
                value={manual.type}
                onChange={(event) =>
                  setManual((current) =>
                    current
                      ? { ...current, type: (event.target as HTMLSelectElement).value as DnsManualType }
                      : current,
                  )
                }
              >
                {(['A', 'AAAA', 'CNAME', 'TXT', 'MX'] as const).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <label class="field-label" for="dns-record-value">
              {t('dns.recordValue')}
            </label>
            <input
              id="dns-record-value"
              class="input mono"
              value={manual.value}
              spellcheck={false}
              onInput={(event) =>
                setManual((current) =>
                  current ? { ...current, value: (event.target as HTMLInputElement).value } : current,
                )
              }
            />
          </div>
          <div class="form-hint" style={{ marginTop: '8px' }}>
            {t('dns.recordHint')}
          </div>
          {manualError && <div class="form-error">{manualError}</div>}
        </Modal>
      )}

      {hideTarget && (
        <Modal
          title={t('dns.hideTitle')}
          width="min(460px, 100%)"
          onClose={() => setHideTarget(null)}
          footer={
            <>
              <button type="button" class="btn" onClick={() => setHideTarget(null)}>
                {t('projects.cancel')}
              </button>
              <button type="button" class="btn" onClick={() => hideRecord(false)}>
                {t('dns.hideUntilRecalc')}
              </button>
              <button type="button" class="btn btn-primary" onClick={() => hideRecord(true)}>
                {t('dns.hideForever')}
              </button>
            </>
          }
        >
          <div class="mono" style={{ fontSize: '13px' }}>
            {hideTarget.name} IN {hideTarget.type} {hideTarget.value}
          </div>
          <div class="form-hint" style={{ marginTop: '8px' }}>
            {t('dns.hideHint')}
          </div>
        </Modal>
      )}
    </>
  );
}
