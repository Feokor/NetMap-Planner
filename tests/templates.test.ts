import { describe, expect, it } from 'vitest';
import { createProject } from '../src/core/project';
import {
  BUILTIN_TEMPLATES,
  createFromTemplate,
  portsLabel,
  templateFromDevice,
  uniqueDeviceName,
} from '../src/core/templates';

describe('шаблоны устройств', () => {
  it('роутер получает два 10G и два медных порта', () => {
    const template = BUILTIN_TEMPLATES.find((item) => item.id === 'tpl_router')!;
    const device = createFromTemplate(template, 'router-1');
    expect(device.kind).toBe('router');
    expect(device.attrs.layer).toBe('L3');
    expect(device.ports.map((port) => port.name)).toEqual(['te0', 'te1', 'gi0/0', 'gi0/1']);
    expect(device.ports[0].media).toBe('fiber');
    expect(device.ports[0].speed).toBe('10G');
    expect(device.ports[2].media).toBe('copper');
  });

  it('коммутатор — восьмипортовый L2', () => {
    const template = BUILTIN_TEMPLATES.find((item) => item.id === 'tpl_switch')!;
    const device = createFromTemplate(template, 'switch-1');
    expect(device.kind).toBe('switch');
    expect(device.attrs.layer).toBe('L2');
    expect(device.ports).toHaveLength(8);
  });

  it('пустой шаблон даёт обычный ПК', () => {
    const device = createFromTemplate(null, 'device-1');
    expect(device.kind).toBe('pc');
    expect(device.ports).toHaveLength(1);
  });

  it('имя не повторяется в проекте', () => {
    const doc = createProject('Тест');
    doc.devices = [createFromTemplate(null, 'router-1'), createFromTemplate(null, 'router-2')];
    expect(uniqueDeviceName(doc, 'router')).toBe('router-3');
  });

  it('сохраняет устройство как шаблон с портами', () => {
    const device = createFromTemplate(
      BUILTIN_TEMPLATES.find((item) => item.id === 'tpl_server')!,
      'srv-1',
    );
    device.tags = ['core'];
    const template = templateFromDevice(device, 'Сервер HQ');
    expect(template.name).toBe('Сервер HQ');
    expect(template.kind).toBe('server');
    expect(template.ports.map((port) => port.name)).toEqual(['ens18', 'ens19']);
    expect(template.tags).toEqual(['core']);
  });

  it('правильно склоняет количество портов', () => {
    expect(portsLabel(1)).toBe('1 порт');
    expect(portsLabel(2)).toBe('2 порта');
    expect(portsLabel(5)).toBe('5 портов');
    expect(portsLabel(11)).toBe('11 портов');
    expect(portsLabel(21)).toBe('21 порт');
  });
});
