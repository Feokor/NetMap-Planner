import { useState } from 'preact/hooks';
import {
  DEVICE_KINDS,
  DEVICE_LAYERS,
  IP_ROLES,
  PORT_MEDIA,
  PORT_MODES,
  type Device,
  type IpAssignment,
  type Port,
  type ProjectDocument,
  bridgeOfPort,
  createBridge,
  createPort,
  createVlan,
  defaultPortName,
  deviceGroupIds,
  isBridgePort,
  isLogicalPort,
  memberPortIds,
  projectIps,
  setBridgeMembers,
  subnetOf,
  uid,
  vlansOfPort,
} from '../core/project';
import { formatAddress, humanCount, parseAddress, type Family } from '../core/ip';
import { nextFreeAnywhere } from '../core/ipPlan';
import { t } from '../i18n';
import { IconTrash } from '../ui/icons';

interface DeviceEditorProps {
  doc: ProjectDocument;
  device: Device;
  onChange: (updater: (device: Device) => Device) => void;
  onClose: () => void;
  onDelete: () => void;
}

function subnetHint(ip: IpAssignment): { text: string; warn: boolean } | null {
  try {
    const parsed = parseAddress(ip.address);
    const bits = parsed.family === 4 ? 32 : 128;
    if (ip.prefix < 0 || ip.prefix > bits) return null;
    const info = subnetOf(parsed.family, parsed.address, ip.prefix);
    if (ip.role === 'dhcp') {
      const hostBits = bits - ip.prefix;
      const usable = hostBits >= 2 ? (1n << BigInt(hostBits)) - 2n : 1n << BigInt(hostBits);
      return {
        text: `${t('device.dhcpPool')}: ${info.networkText} · ${humanCount(usable)} ${t('device.addresses')}`,
        warn: parsed.address !== info.network,
      };
    }
    const hostBits = bits - ip.prefix;
    const reserved = hostBits >= 2 && (parsed.address === info.network || parsed.address === info.last);
    return { text: t('device.subnet') + ': ' + info.networkText, warn: reserved };
  } catch {
    return null;
  }
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  mono?: boolean;
}) {
  return (
    <div>
      <label class="field-label">{label}</label>
      <input
        class={`input${mono ? ' mono' : ''}`}
        value={value}
        placeholder={placeholder}
        spellcheck={false}
        onInput={(event) => onChange((event.target as HTMLInputElement).value)}
      />
    </div>
  );
}

interface IpProblem {
  kind: 'format' | 'duplicate';
  message: string;
}

/** Проверка адресов конкретного устройства без учёта его собственных адресов. */
function ipProblems(doc: ProjectDocument, device: Device): Map<string, IpProblem> {
  const taken = new Map<string, string>();
  for (const ref of projectIps(doc)) {
    if (ref.deviceId === device.id) continue;
    if (ref.role === 'dhcp') continue; // пул — не занятый адрес
    taken.set(`${ref.family}:${ref.text}`, `${ref.deviceName} / ${ref.portName}`);
  }

  const result = new Map<string, IpProblem>();
  for (const port of device.ports) {
    for (const ip of port.ips) {
      if (!ip.address.trim()) continue;
      let parsed: { family: Family; address: bigint };
      try {
        parsed = parseAddress(ip.address);
      } catch {
        result.set(ip.id, { kind: 'format', message: t('device.ipInvalid') });
        continue;
      }
      const text = formatAddress(parsed.family, parsed.address);
      if (ip.prefix < 0 || ip.prefix > (parsed.family === 4 ? 32 : 128)) {
        result.set(ip.id, {
          kind: 'format',
          message: `Префикс должен быть от 0 до ${parsed.family === 4 ? 32 : 128}`,
        });
        continue;
      }
      if (ip.role !== 'dhcp' && taken.has(`${parsed.family}:${text}`)) {
        result.set(ip.id, {
          kind: 'duplicate',
          message: `${t('device.duplicateIp')}: ${taken.get(`${parsed.family}:${text}`)}`,
        });
      }
    }
  }
  return result;
}

export function DeviceEditor({ doc, device, onChange, onClose, onDelete }: DeviceEditorProps) {
  const [bridgePick, setBridgePick] = useState<string[]>([]);
  const [vlanInput, setVlanInput] = useState<Record<string, string>>({});
  const [openVlan, setOpenVlan] = useState<string | null>(null);
  const problems = ipProblems(doc, device);
  const free = nextFreeAnywhere(doc);

  const bridged = memberPortIds(device);
  const bridges = device.ports.filter(isBridgePort);
  const physical = device.ports.filter((port) => !isLogicalPort(port));
  const freePhysical = physical.filter((port) => !bridged.has(port.id));

  const update = (patch: Partial<Device>) => onChange((current) => ({ ...current, ...patch }));
  const updateAttrs = (patch: Partial<Device['attrs']>) =>
    onChange((current) => ({ ...current, attrs: { ...current.attrs, ...patch } }));

  const updatePort = (portId: string, patch: Partial<Port>) =>
    onChange((current) => ({
      ...current,
      ports: current.ports.map((port) => (port.id === portId ? { ...port, ...patch } : port)),
    }));

  const updateIp = (portId: string, ipId: string, patch: Partial<IpAssignment>) =>
    onChange((current) => ({
      ...current,
      ports: current.ports.map((port) =>
        port.id === portId
          ? {
              ...port,
              ips: port.ips.map((ip) => (ip.id === ipId ? { ...ip, ...patch } : ip)),
            }
          : port,
      ),
    }));

  const addPort = () =>
    onChange((current) => ({
      ...current,
      ports: [...current.ports, createPort({ name: defaultPortName(current) })],
    }));

  const removePort = (portId: string) =>
    onChange((current) => ({
      ...current,
      ports: current.ports
        .filter((port) => port.id !== portId)
        .map((port) =>
          isLogicalPort(port)
            ? { ...port, members: (port.members ?? []).filter((id) => id !== portId) }
            : port,
        )
        .filter((port) => !isLogicalPort(port) || (port.members ?? []).length > 0),
    }));

  const removeBridge = (bridgeId: string) =>
    onChange((current) => ({
      ...current,
      ports: current.ports.filter((port) => port.id !== bridgeId),
    }));

  const toggleBridgePick = (portId: string) =>
    setBridgePick((current) =>
      current.includes(portId) ? current.filter((id) => id !== portId) : [...current, portId],
    );

  const makeBridge = () => {
    if (bridgePick.length < 2) return;
    const picked = [...bridgePick];
    onChange((current) => createBridge(current, picked));
    setBridgePick([]);
  };

  const pickAllFree = () => setBridgePick(freePhysical.map((port) => port.id));

  const removeVlan = (vlanId: string) =>
    onChange((current) => ({
      ...current,
      ports: current.ports.filter((port) => port.id !== vlanId),
    }));

  const addVlan = (portId: string) => {
    const raw = (vlanInput[portId] ?? '').trim();
    const vlanId = Number(raw);
    if (!raw || !Number.isFinite(vlanId)) return;
    onChange((current) => createVlan(current, portId, vlanId));
    setVlanInput((current) => ({ ...current, [portId]: '' }));
  };

  const removeMember = (bridgeId: string, portId: string) =>
    onChange((current) => {
      const bridge = current.ports.find((port) => port.id === bridgeId);
      const members = (bridge?.members ?? []).filter((id) => id !== portId);
      return setBridgeMembers(current, bridgeId, members);
    });

  const addMember = (bridgeId: string, portId: string) => {
    if (!portId) return;
    onChange((current) => {
      const bridge = current.ports.find((port) => port.id === bridgeId);
      return setBridgeMembers(current, bridgeId, [...(bridge?.members ?? []), portId]);
    });
  };

  const addIp = (portId: string) =>
    onChange((current) => ({
      ...current,
      ports: current.ports.map((port) =>
        port.id === portId
          ? {
              ...port,
              ips: [
                ...port.ips,
                {
                  id: uid('ip'),
                  family: free?.family ?? 4,
                  address: free?.address ?? '',
                  prefix: free?.prefix ?? 24,
                  role: 'static' as const,
                },
              ],
            }
          : port,
      ),
    }));

  const removeIp = (portId: string, ipId: string) =>
    onChange((current) => ({
      ...current,
      ports: current.ports.map((port) =>
        port.id === portId ? { ...port, ips: port.ips.filter((ip) => ip.id !== ipId) } : port,
      ),
    }));

  const fillFree = (portId: string, ipId: string) => {
    const candidate = nextFreeAnywhere(doc);
    if (!candidate) return;
    updateIp(portId, ipId, {
      family: candidate.family,
      address: candidate.address,
      prefix: candidate.prefix,
    });
  };

  /** Редактор адресов порта — общий и для физических портов, и для мостов (br0). */
  const portIpEditor = (port: Port) => (
    <div class="port-ips">
      {port.ips.map((ip) => {
        const problem = problems.get(ip.id);
        const subnet = subnetHint(ip);
        return (
          <div key={ip.id}>
            <div class="ip-row">
              <input
                class={`input mono${problem ? ' input-invalid' : ''}`}
                value={ip.address}
                placeholder={ip.role === 'dhcp' ? '10.0.10.0' : '10.0.0.10'}
                spellcheck={false}
                onInput={(event) => {
                  const value = (event.target as HTMLInputElement).value;
                  let family: Family = ip.family;
                  if (value.includes(':')) family = 6;
                  else if (value.includes('.')) family = 4;
                  updateIp(port.id, ip.id, { address: value, family });
                }}
              />
              <input
                class="input mono"
                value={ip.prefix}
                inputMode="numeric"
                title="Префикс"
                onInput={(event) => {
                  const value = Number((event.target as HTMLInputElement).value);
                  if (Number.isFinite(value)) updateIp(port.id, ip.id, { prefix: value });
                }}
              />
              <select
                class="input select"
                value={ip.role}
                title={t('iprole.static')}
                onChange={(event) => {
                  const role = (event.target as HTMLSelectElement).value as IpAssignment['role'];
                  const patch: Partial<IpAssignment> = { role };
                  // Пул DHCP — это адрес сети: при переключении роли нормализуем адрес.
                  if (role === 'dhcp') {
                    try {
                      const parsed = parseAddress(ip.address);
                      const info = subnetOf(parsed.family, parsed.address, ip.prefix);
                      patch.address = formatAddress(parsed.family, info.network);
                      patch.family = parsed.family;
                    } catch {
                      /* пустой или некорректный адрес — пользователь введёт сам */
                    }
                  }
                  updateIp(port.id, ip.id, patch);
                }}
              >
                {IP_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(`iprole.${role}`)}
                  </option>
                ))}
              </select>
              <div class="inline" style={{ gap: '2px' }}>
                <button
                  type="button"
                  class="btn btn-ghost btn-icon"
                  title={free ? t('device.freeIp') : t('device.noFreeIp')}
                  disabled={!free}
                  onClick={() => fillFree(port.id, ip.id)}
                >
                  ↧
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-icon"
                  title={t('common.delete')}
                  onClick={() => removeIp(port.id, ip.id)}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            </div>
            {problem && <div class="form-error">{problem.message}</div>}
            {subnet && (
              <div class={`form-hint${subnet.warn ? ' form-hint-warn' : ''}`}>{subnet.text}</div>
            )}
          </div>
        );
      })}

      <div>
        <button
          type="button"
          class="btn"
          style={{ width: '100%' }}
          onClick={() => addIp(port.id)}
        >
          ＋ {t('device.addIp')}
        </button>
      </div>
    </div>
  );

  return (
    <div
      class="drawer-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div class="drawer" role="dialog" aria-modal="true" aria-label={t('device.title')}>
        <div class="drawer-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div class="kv-label" style={{ marginBottom: '2px' }}>
              {t('device.title')}
            </div>
            <div class="mono" style={{ fontSize: '16px', fontWeight: 700 }}>
              {device.name || '—'}
            </div>
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-icon drawer-delete"
            title={t('common.delete')}
            onClick={onDelete}
          >
            <IconTrash size={16} />
          </button>
          <button type="button" class="btn btn-ghost btn-icon" title={t('common.close')} onClick={onClose}>
            ✕
          </button>
        </div>

        <div class="drawer-body">
          <section>
            <div class="section-title">{t('device.general')}</div>
            <div class="field-grid">
              <TextField
                label={t('device.name')}
                value={device.name}
                onChange={(value) => update({ name: value })}
              />
              <div>
                <label class="field-label">{t('device.kind')}</label>
                <select
                  class="input select"
                  value={device.kind}
                  onChange={(event) => update({ kind: (event.target as HTMLSelectElement).value as Device['kind'] })}
                >
                  {DEVICE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`devkind.${kind}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label class="field-label">{t('device.layer')}</label>
                <select
                  class="input select"
                  value={device.attrs.layer ?? 'L3'}
                  onChange={(event) =>
                    updateAttrs({ layer: (event.target as HTMLSelectElement).value as 'L1' | 'L2' | 'L3' })
                  }
                >
                  {DEVICE_LAYERS.map((layer) => (
                    <option key={layer} value={layer}>
                      {layer}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label class="field-label">{t('device.group')}</label>
                <div class="group-picker">
                  {doc.groups.length === 0 && <span class="muted">{t('device.none')}</span>}
                  {doc.groups.map((group) => {
                    const ids = deviceGroupIds(device);
                    const checked = ids.includes(group.id);
                    return (
                      <label class="group-chip" key={group.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? ids.filter((id) => id !== group.id)
                              : [...ids, group.id];
                            update({ groupIds: next, groupId: next[0] ?? null });
                          }}
                        />
                        <span>{group.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section>
            <div class="section-title">{t('device.attributes')}</div>
            <div class="field-grid">
              <TextField
                label={t('device.os')}
                value={device.attrs.os ?? ''}
                placeholder="Linux, RouterOS…"
                onChange={(value) => updateAttrs({ os: value })}
              />
              <TextField
                label={t('device.role')}
                value={device.attrs.role ?? ''}
                placeholder="Core, Edge…"
                onChange={(value) => updateAttrs({ role: value })}
              />
              <TextField
                label={t('device.vendor')}
                value={device.attrs.vendor ?? ''}
                onChange={(value) => updateAttrs({ vendor: value })}
              />
              <TextField
                label={t('device.model')}
                value={device.attrs.model ?? ''}
                onChange={(value) => updateAttrs({ model: value })}
              />
              <TextField
                label={t('device.location')}
                value={device.attrs.location ?? ''}
                onChange={(value) => updateAttrs({ location: value })}
              />
              <TextField
                label={t('device.serial')}
                value={device.attrs.serial ?? ''}
                onChange={(value) => updateAttrs({ serial: value })}
              />
            </div>
            <div style={{ marginTop: '12px' }}>
              <TextField
                label={t('device.tags')}
                value={device.tags.join(', ')}
                onChange={(value) =>
                  update({
                    tags: value
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
            <div style={{ marginTop: '12px' }}>
              <label class="field-label">{t('device.note')}</label>
              <textarea
                class="input textarea"
                value={device.attrs.note ?? ''}
                onInput={(event) => updateAttrs({ note: (event.target as HTMLTextAreaElement).value })}
              />
            </div>
          </section>

          <section>
            <div class="section-title">
              <span>{t('device.ports')}</span>
              <button type="button" class="btn" onClick={addPort}>
                ＋ {t('device.addPort')}
              </button>
            </div>

            <div class="bridge-box">
              <div class="bridge-box-head">
                <span>{t('device.bridges')}</span>
                <span class="muted">{t('device.bridge.hint')}</span>
              </div>
              <div class="bridge-picker">
                {physical.length === 0 && <span class="muted">—</span>}
                {physical
                  .filter((port) => !bridged.has(port.id))
                  .map((port) => (
                    <label class="group-chip" key={port.id}>
                      <input
                        type="checkbox"
                        checked={bridgePick.includes(port.id)}
                        onChange={() => toggleBridgePick(port.id)}
                      />
                      <span>{port.name}</span>
                    </label>
                  ))}
              </div>
              <div class="bridge-actions">
                {freePhysical.length > 1 && (
                  <button
                    type="button"
                    class="btn btn-ghost"
                    onClick={pickAllFree}
                    title={t('device.bridge.selectAll')}
                  >
                    {t('device.bridge.selectAll')}
                  </button>
                )}
                <button
                  type="button"
                  class="btn"
                  disabled={bridgePick.length < 2}
                  onClick={makeBridge}
                >
                  ＋ {t('device.bridge.create')}
                  {bridgePick.length >= 2 ? ` (${bridgePick.length})` : ''}
                </button>
              </div>
              {bridgePick.length > 0 && bridgePick.length < 2 && (
                <div class="form-hint">{t('device.bridge.pickTwo')}</div>
              )}

              {bridges.map((bridge) => {
                const members = (bridge.members ?? [])
                  .map((id) => device.ports.find((port) => port.id === id))
                  .filter((port): port is Port => !!port);
                const available = physical.filter((port) => !bridged.has(port.id));
                return (
                  <div class="port-card port-card-bridge" key={bridge.id}>
                    <div class="port-head">
                      <span class="bridge-badge">{t('device.bridge.badge')}</span>
                      <input
                        class="input mono"
                        style={{ width: '130px' }}
                        value={bridge.name}
                        spellcheck={false}
                        onInput={(event) =>
                          updatePort(bridge.id, {
                            name: (event.target as HTMLInputElement).value,
                          })
                        }
                      />
                      <button
                        type="button"
                        class="btn btn-ghost btn-icon"
                        title={t('device.bridge.remove')}
                        onClick={() => removeBridge(bridge.id)}
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>

                    <div class="bridge-members">
                      {members.length === 0 && (
                        <span class="muted">{t('device.bridge.noMembers')}</span>
                      )}
                      {members.map((member) => (
                        <span class="bridge-chip" key={member.id}>
                          {member.name}
                          <button
                            type="button"
                            title={t('device.bridge.removeMember')}
                            onClick={() => removeMember(bridge.id, member.id)}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      {available.length > 0 && (
                        <select
                          class="input select bridge-add"
                          value=""
                          onChange={(event) => {
                            addMember(bridge.id, (event.target as HTMLSelectElement).value);
                            (event.target as HTMLSelectElement).value = '';
                          }}
                        >
                          <option value="">{t('device.bridge.addMember')}</option>
                          {available.map((port) => (
                            <option key={port.id} value={port.id}>
                              {port.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {portIpEditor(bridge)}
                  </div>
                );
              })}
            </div>

            {device.ports.length === 0 && (
              <div class="muted" style={{ fontSize: '12.5px' }}>
                {t('device.noPorts')}
              </div>
            )}

            {physical.map((port) => (
              <div class="port-card" key={port.id}>
                <div class="port-head">
                  <input
                    class="input mono"
                    style={{ width: '130px' }}
                    value={port.name}
                    spellcheck={false}
                    onInput={(event) =>
                      updatePort(port.id, { name: (event.target as HTMLInputElement).value })
                    }
                  />
                  {bridged.has(port.id) && (
                    <span class="bridge-tag" title={t('device.bridge.memberHint')}>
                      → {bridgeOfPort(device, port.id)?.name ?? ''}
                    </span>
                  )}
                  <select
                    class="input select"
                    style={{ width: 'auto' }}
                    value={port.media}
                    title={t('device.port.media')}
                    onChange={(event) =>
                      updatePort(port.id, {
                        media: (event.target as HTMLSelectElement).value as Port['media'],
                      })
                    }
                  >
                    {PORT_MEDIA.map((media) => (
                      <option key={media} value={media}>
                        {t(`media.${media}`)}
                      </option>
                    ))}
                  </select>
                  <select
                    class="input select"
                    style={{ width: 'auto' }}
                    value={port.mode}
                    title={t('device.port.mode')}
                    onChange={(event) =>
                      updatePort(port.id, {
                        mode: (event.target as HTMLSelectElement).value as Port['mode'],
                      })
                    }
                  >
                    {PORT_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {t(`mode.${mode}`)}
                      </option>
                    ))}
                  </select>
                  <input
                    class="input"
                    style={{ width: '74px' }}
                    value={port.speed ?? ''}
                    placeholder="1G"
                    title={t('device.port.speed')}
                    onInput={(event) =>
                      updatePort(port.id, { speed: (event.target as HTMLInputElement).value })
                    }
                  />
                  <input
                    class="input"
                    style={{ width: '82px' }}
                    value={port.vlan ?? ''}
                    placeholder="VLAN"
                    title={t('device.port.vlan')}
                    inputMode="numeric"
                    onInput={(event) => {
                      const value = (event.target as HTMLInputElement).value.trim();
                      updatePort(port.id, { vlan: value ? Number(value) : null });
                    }}
                  />
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon"
                    title={t('device.removePort')}
                    onClick={() => removePort(port.id)}
                  >
                    <IconTrash size={14} />
                  </button>
                </div>

                <div class="field-grid">
                  <TextField
                    label={t('device.port.mac')}
                    value={port.mac ?? ''}
                    placeholder="AA:BB:CC:DD:EE:FF"
                    mono
                    onChange={(value) => updatePort(port.id, { mac: value })}
                  />
                  <TextField
                    label={t('device.port.description')}
                    value={port.description ?? ''}
                    onChange={(value) => updatePort(port.id, { description: value })}
                  />
                </div>

                {portIpEditor(port)}

                <div class="vlan-row">
                  <span class="vlan-row-label">VLAN</span>
                  {vlansOfPort(device, port.id).map((vlan) => (
                    <button
                      type="button"
                      key={vlan.id}
                      class={`vlan-chip${openVlan === vlan.id ? ' active' : ''}`}
                      title={t('device.vlan.hint')}
                      onClick={() => setOpenVlan(openVlan === vlan.id ? null : vlan.id)}
                    >
                      {vlan.vlan}
                      {vlan.ips[0] ? <span class="vlan-chip-ip">{vlan.ips[0].address}</span> : null}
                    </button>
                  ))}
                  <input
                    class="input mono vlan-input"
                    inputMode="numeric"
                    placeholder="+"
                    title={t('device.vlan.add')}
                    value={vlanInput[port.id] ?? ''}
                    onInput={(event) =>
                      setVlanInput((current) => ({
                        ...current,
                        [port.id]: (event.target as HTMLInputElement).value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') addVlan(port.id);
                    }}
                  />
                </div>
                {vlansOfPort(device, port.id)
                  .filter((vlan) => vlan.id === openVlan)
                  .map((vlan) => (
                    <div class="port-card port-card-vlan" key={vlan.id}>
                      <div class="port-head">
                        <span class="vlan-badge">VLAN {vlan.vlan}</span>
                        <input
                          class="input mono"
                          style={{ width: '150px' }}
                          value={vlan.name}
                          spellcheck={false}
                          onInput={(event) =>
                            updatePort(vlan.id, {
                              name: (event.target as HTMLInputElement).value,
                            })
                          }
                        />
                        <button
                          type="button"
                          class="btn btn-ghost btn-icon"
                          title={t('device.vlan.remove')}
                          onClick={() => {
                            removeVlan(vlan.id);
                            setOpenVlan(null);
                          }}
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                      {portIpEditor(vlan)}
                    </div>
                  ))}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
