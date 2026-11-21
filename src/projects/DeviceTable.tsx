import {
  type Device,
  type ProjectDocument,
  allIps,
  findGroup,
} from '../core/project';
import { formatAddress } from '../core/ip';
import { t } from '../i18n';
import { CopyButton } from '../ui/CopyButton';
import { IconTrash } from '../ui/icons';

interface DeviceTableProps {
  doc: ProjectDocument;
  devices: Device[];
  onEdit: (device: Device) => void;
  onDelete: (device: Device) => void;
}

export function DeviceTable({ doc, devices, onEdit, onDelete }: DeviceTableProps) {
  return (
    <div class="table-wrap">
      <table class="table device-table">
        <thead>
          <tr>
            <th>{t('projects.column.device')}</th>
            <th style={{ width: '70px' }}>{t('projects.column.layer')}</th>
            <th>{t('projects.column.os')}</th>
            <th>{t('projects.column.group')}</th>
            <th class="num" style={{ width: '72px' }}>
              {t('projects.column.ports')}
            </th>
            <th>{t('projects.column.ips')}</th>
            <th class="actions" />
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => {
            const group = findGroup(doc, device.groupId);
            const ips = allIps(device);
            const role = [device.attrs.os, device.attrs.role].filter(Boolean).join(' · ');
            return (
              <tr
                key={device.id}
                onClick={() => onEdit(device)}
                style={{ cursor: 'pointer' }}
              >
                <td>
                  <div class="device-name">{device.name || '—'}</div>
                  <div class="device-sub">
                    {t(`devkind.${device.kind}`)}
                    {device.attrs.vendor ? ` · ${device.attrs.vendor}` : ''}
                    {device.attrs.model ? ` ${device.attrs.model}` : ''}
                  </div>
                </td>
                <td>
                  <span class="layer-pill">{device.attrs.layer ?? 'L3'}</span>
                </td>
                <td class="muted">{role || '—'}</td>
                <td class="muted">{group?.name ?? '—'}</td>
                <td class="num">{device.ports.length}</td>
                <td>
                  <div class="ip-chips">
                    {ips.length === 0 && <span class="muted">—</span>}
                    {ips.map((ref) => (
                      <span class="ip-chip" key={ref.ipId} title={`${ref.portName} · ${t(`iprole.${ref.role}`)}`}>
                        {ref.text}
                        {ref.prefix !== (ref.family === 4 ? 32 : 128) ? `/${ref.prefix}` : ''}
                        <CopyButton value={`${formatAddress(ref.family, ref.address)}/${ref.prefix}`} />
                      </span>
                    ))}
                  </div>
                </td>
                <td class="actions">
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon"
                    title={t('common.delete')}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(device);
                    }}
                  >
                    <IconTrash size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
