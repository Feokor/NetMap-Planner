import { useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { humanCount, formatAddress, parseAddress, parseCidr, IpError } from '../core/ip';
import {
  addIpBlock,
  blockUsage,
  formatOccupancy,
  nextFreeInBlock,
  planOverview,
} from '../core/ipPlan';
import type { DhcpPool, IpBlock, IpGroup, ProjectDocument } from '../core/project';
import {
  IP_GROUP_MAX_DEPTH,
  createDhcpPool,
  dhcpHostRange,
  dhcpPools,
  uid,
} from '../core/project';
import { blockLast, makeBlock, blocksOverlap } from '../core/subnet';
import { t } from '../i18n';
import { CopyButton } from '../ui/CopyButton';
import { Modal } from '../ui/Modal';
import { IconEdit, IconMore, IconTrash } from '../ui/icons';

interface PlanTabProps {
  doc: ProjectDocument;
  onChange: (updater: (doc: ProjectDocument) => ProjectDocument) => void;
}

interface DhcpDraft {
  block: IpBlock;
  from: string;
  to: string;
  address: string;
}

export function PlanTab({ doc, onChange }: PlanTabProps) {
  const [cidr, setCidr] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; cidr: string; name: string; owner: string } | null>(
    null,
  );
  const [editError, setEditError] = useState<string | null>(null);
  const [blockMenu, setBlockMenu] = useState<IpBlock | null>(null);
  const [dhcp, setDhcp] = useState<DhcpDraft | null>(null);
  const [dhcpError, setDhcpError] = useState<string | null>(null);
  const [groupModal, setGroupModal] = useState<{
    mode: 'new' | 'rename';
    id?: string;
    parentId: string | null;
    name: string;
  } | null>(null);
  const [moveFor, setMoveFor] = useState<IpBlock | null>(null);
  const [moveGroup, setMoveGroup] = useState('');

  const overview = useMemo(() => planOverview(doc), [doc]);
  const usages = useMemo(
    () =>
      doc.ipPlan.blocks
        .map((item) => blockUsage(doc, item, true))
        .filter((usage): usage is NonNullable<typeof usage> => usage !== null),
    [doc],
  );
  const pools = useMemo(() => dhcpPools(doc), [doc]);
  const planGroups = doc.ipPlan.groups ?? [];

  const depthOf = (id: string | null | undefined): number => {
    let depth = 0;
    let current = id ? planGroups.find((group) => group.id === id) : undefined;
    while (current && depth < 10) {
      depth++;
      current = current.parentId
        ? planGroups.find((group) => group.id === current?.parentId)
        : undefined;
    }
    return depth;
  };

  const groupsAt = (parentId: string | null) =>
    planGroups.filter((group) => (group.parentId ?? null) === parentId);

  const groupLabel = (group: IpGroup): string => {
    const names: string[] = [];
    let current: IpGroup | undefined = group;
    let guard = 0;
    while (current && guard < 10) {
      names.unshift(current.name);
      current = current.parentId
        ? planGroups.find((item) => item.id === current?.parentId)
        : undefined;
      guard++;
    }
    return names.join(' / ');
  };

  const groupOfBlock = (blockId: string) =>
    planGroups.find((group) => group.blockIds.includes(blockId));

  const openGroupNew = (parentId: string | null) =>
    setGroupModal({ mode: 'new', parentId, name: '' });

  const saveGroup = () => {
    if (!groupModal) return;
    const value = groupModal.name.trim();
    if (!value) return;
    onChange((current) => {
      const groups = [...(current.ipPlan.groups ?? [])];
      if (groupModal.mode === 'new') {
        groups.push({
          id: uid('ipg'),
          name: value,
          parentId: groupModal.parentId,
          blockIds: [],
        });
      } else {
        const index = groups.findIndex((group) => group.id === groupModal.id);
        if (index >= 0) groups[index] = { ...groups[index], name: value };
      }
      return { ...current, ipPlan: { ...current.ipPlan, groups } };
    });
    setGroupModal(null);
  };

  const removeGroup = (group: IpGroup) => {
    if (!window.confirm(t('plan.groupDeleteConfirm', { name: group.name }))) return;
    onChange((current) => {
      const groups = current.ipPlan.groups ?? [];
      const doomed = new Set<string>([group.id]);
      let discovered = true;
      while (discovered) {
        discovered = false;
        for (const item of groups) {
          if (item.parentId && doomed.has(item.parentId) && !doomed.has(item.id)) {
            doomed.add(item.id);
            discovered = true;
          }
        }
      }
      return {
        ...current,
        ipPlan: {
          ...current.ipPlan,
          groups: groups.filter((item) => !doomed.has(item.id)),
        },
      };
    });
  };

  const saveMove = () => {
    if (!moveFor) return;
    const blockId = moveFor.id;
    onChange((current) => {
      const groups = (current.ipPlan.groups ?? []).map((group) => ({
        ...group,
        blockIds: group.blockIds.filter((id) => id !== blockId),
      }));
      if (moveGroup) {
        const index = groups.findIndex((group) => group.id === moveGroup);
        if (index >= 0) groups[index] = { ...groups[index], blockIds: [...groups[index].blockIds, blockId] };
      }
      return { ...current, ipPlan: { ...current.ipPlan, groups } };
    });
    setMoveFor(null);
    setMoveGroup('');
  };

  const submit = () => {
    const value = cidr.trim();
    if (!value) return;
    let parsed: ReturnType<typeof parseCidr>;
    try {
      parsed = parseCidr(value);
    } catch (cause) {
      setError(
        t('plan.invalidCidr', {
          error: cause instanceof IpError ? cause.message : 'некорректный CIDR',
        }),
      );
      return;
    }

    const candidate = makeBlock(parsed.family, parsed.address, parsed.prefix);
    for (const existing of doc.ipPlan.blocks) {
      try {
        const other = parseCidr(existing.cidr);
        const otherBlock = makeBlock(other.family, other.address, other.prefix);
        if (blocksOverlap(candidate, otherBlock)) {
          setError(t('plan.overlap', { cidr: existing.cidr }));
          return;
        }
      } catch {
        /* некорректные старые блоки не мешают добавить новый */
      }
    }

    onChange((current) => addIpBlock(current, value, name.trim() || value));
    setCidr('');
    setName('');
    setError(null);
  };

  const removeBlock = (id: string, blockCidr: string) => {
    if (!window.confirm(t('plan.confirmDelete', { cidr: blockCidr }))) return;
    onChange((current) => ({
      ...current,
      ipPlan: {
        ...current.ipPlan,
        blocks: current.ipPlan.blocks.filter((item) => item.id !== id),
        groups: (current.ipPlan.groups ?? []).map((group) => ({
          ...group,
          blockIds: group.blockIds.filter((blockId) => blockId !== id),
        })),
      },
    }));
  };

  /** Проверка CIDR: корректность и пересечение с другими блоками. */
  const validateCidr = (value: string, excludeId?: string): { error?: string; cidr?: string } => {
    let parsed: ReturnType<typeof parseCidr>;
    try {
      parsed = parseCidr(value.trim());
    } catch (cause) {
      return {
        error: t('plan.invalidCidr', {
          error: cause instanceof IpError ? cause.message : 'некорректный CIDR',
        }),
      };
    }
    const candidate = makeBlock(parsed.family, parsed.address, parsed.prefix);
    for (const existing of doc.ipPlan.blocks) {
      if (existing.id === excludeId) continue;
      try {
        const other = parseCidr(existing.cidr);
        const otherBlock = makeBlock(other.family, other.address, other.prefix);
        if (blocksOverlap(candidate, otherBlock)) {
          return { error: t('plan.overlap', { cidr: existing.cidr }) };
        }
      } catch {
        /* некорректные старые блоки не мешают */
      }
    }
    const normalized = `${formatAddress(parsed.family, candidate.address)}/${parsed.prefix}`;
    return { cidr: normalized };
  };

  const openEdit = (block: IpBlock) => {
    setEditing({
      id: block.id,
      cidr: block.cidr,
      name: block.name,
      owner: block.owner ?? '',
    });
    setEditError(null);
  };

  const saveEdit = () => {
    if (!editing) return;
    const result = validateCidr(editing.cidr, editing.id);
    if (result.error || !result.cidr) {
      setEditError(result.error ?? t('plan.invalidCidr', { error: '' }));
      return;
    }
    const next = result.cidr;
    onChange((current) => ({
      ...current,
      ipPlan: {
        ...current.ipPlan,
        blocks: current.ipPlan.blocks.map((item) =>
          item.id === editing.id
            ? {
                ...item,
                cidr: next,
                name: editing.name.trim() || next,
                owner: editing.owner.trim() || undefined,
              }
            : item,
        ),
      },
    }));
    setEditing(null);
    setEditError(null);
  };

  const ports = useMemo(
    () =>
      doc.devices.flatMap((device) =>
        device.ports.map((port) => ({
          value: `${device.id}|${port.id}`,
          label: `${device.name} / ${port.name}`,
        })),
      ),
    [doc],
  );

  /** Хосты блока — по умолчанию весь диапазон выдачи. */
  const dhcpRange = useMemo(() => {
    if (!dhcp) return null;
    try {
      const parsed = parseCidr(dhcp.block.cidr);
      const block = makeBlock(parsed.family, parsed.address, parsed.prefix);
      const range = dhcpHostRange(block.family, block.address, blockLast(block));
      return {
        family: block.family,
        from: range.from,
        to: range.to,
        text: `${formatAddress(block.family, range.from)} – ${formatAddress(block.family, range.to)}`,
      };
    } catch {
      return null;
    }
  }, [dhcp]);

  const openDhcp = (block: IpBlock) => {
    setBlockMenu(null);
    try {
      const parsed = parseCidr(block.cidr);
      const item = makeBlock(parsed.family, parsed.address, parsed.prefix);
      const range = dhcpHostRange(item.family, item.address, blockLast(item));
      setDhcp({
        block,
        from: formatAddress(item.family, range.from),
        to: formatAddress(item.family, range.to),
        address: ports[0]?.value ?? '',
      });
      setDhcpError(null);
    } catch {
      setDhcpError(t('plan.invalidCidr', { error: '' }));
    }
  };

  const createPool = () => {
    if (!dhcp) return;
    const [deviceId, portId] = dhcp.address.split('|');
    if (!deviceId || !portId) {
      setDhcpError(t('plan.dhcpNoPorts'));
      return;
    }
    if (!dhcpRange) {
      setDhcpError(t('plan.invalidCidr', { error: '' }));
      return;
    }
    let from: string | undefined;
    let to: string | undefined;
    const rawFrom = dhcp.from.trim();
    const rawTo = dhcp.to.trim();
    if (rawFrom || rawTo) {
      try {
        if (!rawFrom || !rawTo) throw new IpError('нужны оба адреса');
        const start = parseAddress(rawFrom);
        const end = parseAddress(rawTo);
        if (
          start.family !== dhcpRange.family ||
          end.family !== dhcpRange.family ||
          start.address < dhcpRange.from ||
          end.address > dhcpRange.to ||
          start.address > end.address
        ) {
          throw new IpError('вне диапазона');
        }
        from = formatAddress(start.family, start.address);
        to = formatAddress(end.family, end.address);
      } catch {
        setDhcpError(t('plan.dhcpRangeError', { range: dhcpRange.text }));
        return;
      }
    }
    onChange((current) =>
      createDhcpPool(current, {
        blockId: dhcp.block.id,
        deviceId,
        portId,
        from,
        to,
      }),
    );
    setDhcp(null);
    setDhcpError(null);
  };

  const removePool = (pool: DhcpPool) => {
    if (!window.confirm(t('plan.dhcpDeleteConfirm', { text: pool.text }))) return;
    onChange((current) => ({
      ...current,
      devices: current.devices.map((device) =>
        device.id !== pool.deviceId
          ? device
          : {
              ...device,
              ports: device.ports.map((port) =>
                port.id !== pool.portId
                  ? port
                  : { ...port, ips: port.ips.filter((ip) => ip.id !== pool.ipId) },
              ),
            },
      ),
    }));
  };

  /** Приводит адрес пула к адресу сети: 192.168.7.200/28 → 192.168.7.192/28. */
  const normalizePool = (pool: DhcpPool) => {
    onChange((current) => ({
      ...current,
      devices: current.devices.map((device) =>
        device.id !== pool.deviceId
          ? device
          : {
              ...device,
              ports: device.ports.map((port) =>
                port.id !== pool.portId
                  ? port
                  : {
                      ...port,
                      ips: port.ips.map((ip) =>
                        ip.id === pool.ipId ? { ...ip, address: pool.networkText } : ip,
                      ),
                    },
              ),
            },
      ),
    }));
  };

  return (
    <div class="stack">
      <section class="card card-pad">
        <div class="section-title">
          <span>{t('plan.title')}</span>
          <span class="badge badge-neutral">{overview.totals.blocks}</span>
        </div>

        <div class="plan-summary">
          <div class="kv">
            <div class="kv-label">{t('plan.blocks')}</div>
            <div class="kv-value">
              <strong>{overview.totals.blocks}</strong>
            </div>
          </div>
          <div class="kv">
            <div class="kv-label">{t('plan.capacity')}</div>
            <div class="kv-value">{humanCount(overview.totals.capacity)}</div>
          </div>
          <div class="kv">
            <div class="kv-label">{t('plan.used')}</div>
            <div class="kv-value">
              {formatOccupancy(overview.totals.used, overview.totals.usable)}
            </div>
          </div>
          <div class="kv">
            <div class="kv-label">{t('plan.unplanned')}</div>
            <div class="kv-value">
              <strong style={{ color: overview.totals.unplanned > 0 ? 'var(--warn)' : undefined }}>
                {overview.totals.unplanned}
              </strong>
            </div>
          </div>
        </div>

        <div class="inline" style={{ gap: '8px', marginTop: '16px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 210px' }}>
            <label class="field-label">{t('plan.cidr')}</label>
            <input
              class="input mono"
              value={cidr}
              placeholder="10.0.0.0/24 · 2001:db8::/48"
              spellcheck={false}
              onInput={(event) => {
                setCidr((event.target as HTMLInputElement).value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
            />
          </div>
          <div style={{ flex: '1 1 170px' }}>
            <label class="field-label">{t('plan.name')}</label>
            <input
              class="input"
              value={name}
              placeholder={t('plan.name')}
              onInput={(event) => setName((event.target as HTMLInputElement).value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
            />
          </div>
          <button type="button" class="btn btn-primary" onClick={submit} disabled={!cidr.trim()}>
            ＋ {t('plan.add')}
          </button>
        </div>
        {error && <div class="form-error">{error}</div>}
      </section>

      <section class="card card-pad">
        <div class="section-title">
          <span>{t('plan.groups')}</span>
          <button type="button" class="btn" onClick={() => openGroupNew(null)}>
            ＋ {t('plan.groupNew')}
          </button>
        </div>
        <div class="form-hint" style={{ marginBottom: '8px' }}>
          {t('plan.groupHint', { n: String(IP_GROUP_MAX_DEPTH) })}
        </div>
        {planGroups.length === 0 ? (
          <div class="muted" style={{ fontSize: '12.5px' }}>
            {t('plan.groupEmpty')}
          </div>
        ) : (
          <div class="ip-group-tree">
            {groupsAt(null).map((group) => {
              const renderGroup = (item: IpGroup, level: number): JSX.Element => (
                <div class="ip-group" key={item.id}>
                  <div class="ip-group-row" style={{ paddingLeft: `${level * 18}px` }}>
                    <span class="ip-group-name">{item.name}</span>
                    <span class="badge badge-neutral">{item.blockIds.length}</span>
                    <span class="spacer" />
                    {level + 1 < IP_GROUP_MAX_DEPTH && (
                      <button
                        type="button"
                        class="btn btn-ghost btn-icon"
                        title={t('plan.groupAddChild')}
                        onClick={() => openGroupNew(item.id)}
                      >
                        ＋
                      </button>
                    )}
                    <button
                      type="button"
                      class="btn btn-ghost btn-icon"
                      title={t('plan.groupRename')}
                      onClick={() =>
                        setGroupModal({
                          mode: 'rename',
                          id: item.id,
                          parentId: item.parentId ?? null,
                          name: item.name,
                        })
                      }
                    >
                      <IconEdit size={13} />
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-icon"
                      title={t('plan.groupDelete')}
                      onClick={() => removeGroup(item)}
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                  {groupsAt(item.id).map((child) => renderGroup(child, level + 1))}
                </div>
              );
              return renderGroup(group, 0);
            })}
          </div>
        )}
      </section>

      {usages.length === 0 ? (
        <section class="card empty-state" style={{ padding: '40px 20px' }}>
          <h3>{t('plan.none')}</h3>
          <div>{t('plan.noneText')}</div>
        </section>
      ) : (
        <section class="card">
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>{t('plan.cidr')}</th>
                  <th>{t('plan.name')}</th>
                  <th>{t('plan.group')}</th>
                  <th class="usage-cell">{t('plan.used')}</th>
                  <th>{t('plan.nextFree')}</th>
                  <th class="actions" />
                </tr>
              </thead>
              <tbody>
                {usages.map((usage) => {
                  const free = nextFreeInBlock(doc, usage.item);
                  return (
                    <tr key={usage.item.id}>
                      <td class="mono">
                        {usage.item.cidr}
                        <CopyButton value={usage.item.cidr} />
                        <div class="usage-text">
                          {usage.block.family === 4 ? 'IPv4' : 'IPv6'} · /{usage.block.prefix}
                        </div>
                      </td>
                      <td>
                        <div class="device-name">{usage.item.name}</div>
                        {usage.item.owner && <div class="device-sub">{usage.item.owner}</div>}
                      </td>
                      <td>
                        {groupOfBlock(usage.item.id) ? (
                          <span class="badge badge-neutral">
                            {groupLabel(groupOfBlock(usage.item.id) as IpGroup)}
                          </span>
                        ) : (
                          <span class="muted">—</span>
                        )}
                      </td>
                      <td class="usage-cell">
                        <div class="progress" title={`${usage.percent.toFixed(1)}%`}>
                          <span style={{ width: `${Math.max(usage.percent, usage.used > 0n ? 2 : 0)}%` }} />
                        </div>
                        <div class="usage-text">
                          {formatOccupancy(usage.used, usage.usable)} ·{' '}
                          {usage.percent < 1 && usage.used > 0n
                            ? '<1'
                            : usage.percent.toFixed(usage.percent < 100 ? 1 : 0)}
                          %
                        </div>
                      </td>
                      <td class="mono">
                        {free ? (
                          <>
                            {free.address}
                            {free.prefix !== (free.family === 4 ? 32 : 128) ? `/${free.prefix}` : ''}
                            <CopyButton value={`${free.address}/${free.prefix}`} />
                          </>
                        ) : (
                          <span class="muted">—</span>
                        )}
                      </td>
                      <td class="actions">
                        <button
                          type="button"
                          class="btn btn-ghost btn-icon"
                          title={t('plan.menu')}
                          onClick={() => setBlockMenu(usage.item)}
                        >
                          <IconMore size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section class="card card-pad">
        <div class="section-title">
          <span>{t('plan.dhcp')}</span>
          <span class="badge badge-neutral">{pools.length}</span>
        </div>
        {pools.length === 0 ? (
          <div class="muted" style={{ fontSize: '12.5px' }}>
            {t('plan.dhcpEmpty')}
          </div>
        ) : (
          <div class="dhcp-pools">
            {pools.map((pool) => (
              <div class="dhcp-pool" key={pool.ipId}>
                <div class="inline" style={{ gap: '6px' }}>
                  <div class="mono" style={{ flex: 1 }}>
                    {pool.text}
                    <CopyButton value={pool.text} />
                  </div>
                  {!pool.normalized && (
                    <button
                      type="button"
                      class="btn btn-ghost"
                      title={t('plan.dhcpNormalizeHint')}
                      onClick={() => normalizePool(pool)}
                    >
                      {t('plan.dhcpNormalize')}
                    </button>
                  )}
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon"
                    title={t('plan.dhcpDelete')}
                    onClick={() => removePool(pool)}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
                <div class="device-sub">
                  {pool.deviceName} / {pool.portName}
                </div>
                <div class="usage-text">
                  {humanCount(pool.usable)} {t('plan.dhcpUsable')}
                </div>
                <div class="usage-text">
                  {t('plan.dhcpRange')}: {pool.rangeText}
                  {pool.rangeCustom ? '' : ` (${t('plan.dhcpAll')})`}
                </div>
                {pool.rangeInvalid && (
                  <div class="form-hint form-hint-warn">
                    {t('plan.dhcpRangeError', { range: `${pool.networkText}` })}
                  </div>
                )}
                {pool.inside.length > 0 && (
                  <div class="form-hint form-hint-warn">
                    {t('plan.dhcpInside')}:{' '}
                    {pool.inside.map((ref) => `${ref.text} (${ref.deviceName})`).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {blockMenu && (
        <Modal
          title={t('plan.menu')}
          onClose={() => setBlockMenu(null)}
          footer={
            <button type="button" class="btn" onClick={() => setBlockMenu(null)}>
              {t('common.close')}
            </button>
          }
        >
          <div class="muted mono" style={{ fontSize: '12.5px', marginBottom: '10px' }}>
            {blockMenu.cidr}
            {blockMenu.name && blockMenu.name !== blockMenu.cidr ? ` · ${blockMenu.name}` : ''}
          </div>
          <div class="plan-actions">
            <button
              type="button"
              class="btn"
              onClick={() => {
                const block = blockMenu;
                setBlockMenu(null);
                openEdit(block);
              }}
            >
              <IconEdit size={14} /> {t('plan.edit')}
            </button>
            <button type="button" class="btn" onClick={() => openDhcp(blockMenu)}>
              ＋ {t('plan.dhcpCreate')}
            </button>
            <button
              type="button"
              class="btn"
              onClick={() => {
                const block = blockMenu;
                setBlockMenu(null);
                setMoveGroup(groupOfBlock(block.id)?.id ?? '');
                setMoveFor(block);
              }}
            >
              ▸ {t('plan.groupMove')}
            </button>
            <button
              type="button"
              class="btn btn-danger"
              onClick={() => {
                const block = blockMenu;
                setBlockMenu(null);
                removeBlock(block.id, block.cidr);
              }}
            >
              <IconTrash size={14} /> {t('plan.delete')}
            </button>
          </div>
        </Modal>
      )}

      {groupModal && (
        <Modal
          title={groupModal.mode === 'new' ? t('plan.groupNew') : t('plan.groupRename')}
          onClose={() => setGroupModal(null)}
          footer={
            <>
              <button type="button" class="btn" onClick={() => setGroupModal(null)}>
                {t('projects.cancel')}
              </button>
              <button
                type="button"
                class="btn btn-primary"
                onClick={saveGroup}
                disabled={!groupModal.name.trim()}
              >
                {t('projects.save')}
              </button>
            </>
          }
        >
          <label class="field-label" for="group-name">
            {t('plan.groupName')}
          </label>
          <input
            id="group-name"
            class="input"
            autofocus
            value={groupModal.name}
            placeholder={t('plan.groupName')}
            onInput={(event) =>
              setGroupModal((current) =>
                current ? { ...current, name: (event.target as HTMLInputElement).value } : current,
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveGroup();
            }}
          />
          {groupModal.mode === 'new' && (
            <>
              <div style={{ height: '10px' }} />
              <label class="field-label" for="group-parent">
                {t('plan.groupParent')}
              </label>
              <select
                id="group-parent"
                class="input select"
                value={groupModal.parentId ?? ''}
                onChange={(event) =>
                  setGroupModal((current) =>
                    current
                      ? { ...current, parentId: (event.target as HTMLSelectElement).value || null }
                      : current,
                  )
                }
              >
                <option value="">{t('plan.groupRoot')}</option>
                {planGroups
                  .filter((group) => depthOf(group.id) < IP_GROUP_MAX_DEPTH)
                  .map((group) => (
                    <option key={group.id} value={group.id}>
                      {groupLabel(group)}
                    </option>
                  ))}
              </select>
            </>
          )}
        </Modal>
      )}

      {moveFor && (
        <Modal
          title={t('plan.groupMove')}
          onClose={() => setMoveFor(null)}
          footer={
            <>
              <button type="button" class="btn" onClick={() => setMoveFor(null)}>
                {t('projects.cancel')}
              </button>
              <button type="button" class="btn btn-primary" onClick={saveMove}>
                {t('projects.save')}
              </button>
            </>
          }
        >
          <div class="muted mono" style={{ fontSize: '12.5px', marginBottom: '10px' }}>
            {moveFor.cidr}
          </div>
          <label class="field-label" for="move-group">
            {t('plan.group')}
          </label>
          <select
            id="move-group"
            class="input select"
            value={moveGroup}
            onChange={(event) => setMoveGroup((event.target as HTMLSelectElement).value)}
          >
            <option value="">{t('plan.groupNone')}</option>
            {planGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {'— '.repeat(Math.max(depthOf(group.id) - 1, 0))}
                {group.name}
              </option>
            ))}
          </select>
        </Modal>
      )}

      {dhcp && (
        <Modal
          title={t('plan.dhcpTitle')}
          onClose={() => setDhcp(null)}
          footer={
            <>
              <button type="button" class="btn" onClick={() => setDhcp(null)}>
                {t('projects.cancel')}
              </button>
              <button type="button" class="btn btn-primary" onClick={createPool}>
                {t('plan.dhcpCreate')}
              </button>
            </>
          }
        >
          <div class="muted" style={{ fontSize: '12.5px', marginBottom: '10px' }}>
            {dhcp.block.cidr} · {t('plan.dhcpHint')}
          </div>

          <label class="field-label" for="dhcp-device">
            {t('plan.dhcpDevice')}
          </label>
          <select
            id="dhcp-device"
            class="input select"
            value={dhcp.address}
            onChange={(event) =>
              setDhcp((current) =>
                current ? { ...current, address: (event.target as HTMLSelectElement).value } : current,
              )
            }
          >
            {ports.length === 0 && <option value="">{t('plan.dhcpNoPorts')}</option>}
            {ports.map((port) => (
              <option key={port.value} value={port.value}>
                {port.label}
              </option>
            ))}
          </select>
          <div class="form-hint" style={{ marginTop: '6px' }}>
            {t('plan.dhcpServerHint')}
          </div>

          <div class="inline" style={{ gap: '8px', marginTop: '10px', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 140px' }}>
              <label class="field-label" for="dhcp-from">
                {t('plan.dhcpFrom')}
              </label>
              <input
                id="dhcp-from"
                class="input mono"
                value={dhcp.from}
                spellcheck={false}
                onInput={(event) => {
                  setDhcp((current) =>
                    current ? { ...current, from: (event.target as HTMLInputElement).value } : current,
                  );
                  setDhcpError(null);
                }}
              />
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <label class="field-label" for="dhcp-to">
                {t('plan.dhcpTo')}
              </label>
              <input
                id="dhcp-to"
                class="input mono"
                value={dhcp.to}
                spellcheck={false}
                onInput={(event) => {
                  setDhcp((current) =>
                    current ? { ...current, to: (event.target as HTMLInputElement).value } : current,
                  );
                  setDhcpError(null);
                }}
              />
            </div>
          </div>
          {dhcpRange && (
            <div class="form-hint" style={{ marginTop: '8px' }}>
              {t('plan.dhcpHosts')}: {dhcpRange.text}
            </div>
          )}
          {dhcpError && (
            <div class="form-error" style={{ marginTop: '10px' }}>
              {dhcpError}
            </div>
          )}
        </Modal>
      )}

      {editing && (
        <Modal
          title={t('plan.editTitle')}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" class="btn" onClick={() => setEditing(null)}>
                {t('projects.cancel')}
              </button>
              <button type="button" class="btn btn-primary" onClick={saveEdit}>
                {t('projects.save')}
              </button>
            </>
          }
        >
          <label class="field-label" for="plan-edit-cidr">
            {t('plan.cidr')}
          </label>
          <input
            id="plan-edit-cidr"
            class="input mono"
            autofocus
            value={editing.cidr}
            spellcheck={false}
            onInput={(event) => {
              const value = (event.target as HTMLInputElement).value;
              setEditing((current) => (current ? { ...current, cidr: value } : current));
              setEditError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveEdit();
            }}
          />
          <div style={{ height: '10px' }} />
          <label class="field-label" for="plan-edit-name">
            {t('plan.name')}
          </label>
          <input
            id="plan-edit-name"
            class="input"
            value={editing.name}
            onInput={(event) => {
              const value = (event.target as HTMLInputElement).value;
              setEditing((current) => (current ? { ...current, name: value } : current));
            }}
          />
          <div style={{ height: '10px' }} />
          <label class="field-label" for="plan-edit-owner">
            {t('plan.owner')}
          </label>
          <input
            id="plan-edit-owner"
            class="input"
            value={editing.owner}
            onInput={(event) => {
              const value = (event.target as HTMLInputElement).value;
              setEditing((current) => (current ? { ...current, owner: value } : current));
            }}
          />
          {editError && <div class="form-error" style={{ marginTop: '10px' }}>{editError}</div>}
        </Modal>
      )}
    </div>
  );
}
