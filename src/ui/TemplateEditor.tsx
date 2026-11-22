import { useState } from 'preact/hooks';
import { Modal } from './Modal';
import { t } from '../i18n';
import { DEVICE_KINDS, DEVICE_LAYERS, PORT_MEDIA, PORT_MODES } from '../core/project';
import type { DeviceKind, DeviceLayer, PortMedia, PortMode } from '../core/project';
import type { DeviceTemplate, TemplatePort } from '../core/templates';
import { portsLabel } from '../core/templates';

interface TemplateEditorProps {
  title: string;
  initial: DeviceTemplate;
  onSave: (template: DeviceTemplate) => void;
  onClose: () => void;
}

const blankPort = (index: number): TemplatePort => ({
  name: `eth${index}`,
  media: 'copper',
  speed: '1G',
  mode: 'access',
});

export function TemplateEditor({ title, initial, onSave, onClose }: TemplateEditorProps) {
  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState<DeviceKind>(initial.kind);
  const [layer, setLayer] = useState<DeviceLayer>(initial.layer);
  const [os, setOs] = useState(initial.os ?? '');
  const [role, setRole] = useState(initial.role ?? '');
  const [vendor, setVendor] = useState(initial.vendor ?? '');
  const [tags, setTags] = useState(initial.tags.join(', '));
  const [favorite, setFavorite] = useState(initial.favorite);
  const [ports, setPorts] = useState<TemplatePort[]>(
    initial.ports.length > 0 ? initial.ports.map((port) => ({ ...port })) : [blankPort(0)],
  );

  const updatePort = (index: number, patch: Partial<TemplatePort>) =>
    setPorts((current) =>
      current.map((port, position) => (position === index ? { ...port, ...patch } : port)),
    );

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      ...initial,
      name: trimmed,
      kind,
      layer,
      os: os.trim() || undefined,
      role: role.trim() || undefined,
      vendor: vendor.trim() || undefined,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      favorite,
      ports: ports
        .map((port) => ({ ...port, name: port.name.trim() || 'eth0' }))
        .filter((port) => port.name),
      updatedAt: Date.now(),
    });
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      width="min(640px, 100%)"
      footer={
        <>
          <button type="button" class="btn" onClick={onClose}>
            {t('projects.cancel')}
          </button>
          <button type="button" class="btn btn-primary" onClick={save} disabled={!name.trim()}>
            {t('projects.save')}
          </button>
        </>
      }
    >
      <div class="template-form">
        <div>
          <label class="field-label" for="tpl-name">
            {t('templates.name')}
          </label>
          <input
            id="tpl-name"
            class="input"
            autofocus
            value={name}
            onInput={(event) => setName((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save();
            }}
          />
        </div>

        <div class="template-form-row">
          <div>
            <label class="field-label" for="tpl-kind">
              {t('device.kind')}
            </label>
            <select
              id="tpl-kind"
              class="input select"
              value={kind}
              onChange={(event) => setKind((event.target as HTMLSelectElement).value as DeviceKind)}
            >
              {DEVICE_KINDS.map((item) => (
                <option key={item} value={item}>
                  {t(`devkind.${item}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label class="field-label" for="tpl-layer">
              {t('device.layer')}
            </label>
            <select
              id="tpl-layer"
              class="input select"
              value={layer}
              onChange={(event) => setLayer((event.target as HTMLSelectElement).value as DeviceLayer)}
            >
              {DEVICE_LAYERS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div class="template-form-row">
          <div>
            <label class="field-label">{t('device.os')}</label>
            <input class="input" value={os} onInput={(event) => setOs((event.target as HTMLInputElement).value)} />
          </div>
          <div>
            <label class="field-label">{t('device.role')}</label>
            <input class="input" value={role} onInput={(event) => setRole((event.target as HTMLInputElement).value)} />
          </div>
          <div>
            <label class="field-label">{t('device.vendor')}</label>
            <input
              class="input"
              value={vendor}
              onInput={(event) => setVendor((event.target as HTMLInputElement).value)}
            />
          </div>
        </div>

        <div>
          <label class="field-label">{t('device.tags')}</label>
          <input
            class="input"
            value={tags}
            placeholder="core, wan"
            onInput={(event) => setTags((event.target as HTMLInputElement).value)}
          />
        </div>

        <label class="template-favorite">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(event) => setFavorite((event.target as HTMLInputElement).checked)}
          />
          {t('templates.favorite')}
        </label>

        <div class="template-ports-head">
          <strong>{t('templates.portsTitle')}</strong>
          <span class="muted">{portsLabel(ports.length)}</span>
        </div>
        <div class="template-ports">
          {ports.map((port, index) => (
            <div class="template-port-row" key={index}>
              <input
                class="input mono"
                value={port.name}
                placeholder="eth0"
                onInput={(event) =>
                  updatePort(index, { name: (event.target as HTMLInputElement).value })
                }
              />
              <select
                class="input select"
                value={port.media ?? 'copper'}
                onChange={(event) =>
                  updatePort(index, {
                    media: (event.target as HTMLSelectElement).value as PortMedia,
                  })
                }
              >
                {PORT_MEDIA.map((media) => (
                  <option key={media} value={media}>
                    {t(`media.${media}`)}
                  </option>
                ))}
              </select>
              <input
                class="input mono"
                value={port.speed ?? ''}
                placeholder="1G"
                onInput={(event) =>
                  updatePort(index, { speed: (event.target as HTMLInputElement).value })
                }
              />
              <select
                class="input select"
                value={port.mode ?? 'access'}
                onChange={(event) =>
                  updatePort(index, {
                    mode: (event.target as HTMLSelectElement).value as PortMode,
                  })
                }
              >
                {PORT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`mode.${mode}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                class="btn btn-ghost btn-icon"
                title={t('templates.removePort')}
                onClick={() => setPorts((current) => current.filter((_, position) => position !== index))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div class="inline" style={{ gap: '6px', marginTop: '8px' }}>
          <button
            type="button"
            class="btn"
            onClick={() => setPorts((current) => [...current, blankPort(current.length)])}
          >
            ＋ {t('templates.addPort')}
          </button>
          <button
            type="button"
            class="btn"
            onClick={() =>
              setPorts((current) => [
                ...current,
                ...Array.from({ length: 8 }, (_, index) => ({
                  name: `gi0/${current.length + index + 1}`,
                  media: 'copper' as const,
                  speed: '1G',
                  mode: 'access' as const,
                })),
              ])
            }
          >
            ＋ 8×{t('media.copper')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
