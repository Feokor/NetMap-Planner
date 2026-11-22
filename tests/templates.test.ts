import { describe, expect, it } from 'vitest';
import { createProject } from '../src/core/project';
import { DEVICE_TEMPLATES, createFromTemplate, uniqueDeviceName } from '../src/core/templates';

describe('шаблоны устройств', () => {
  it('роутер получает два 10G и два медных порта', () => {
    const device = createFromTemplate(DEVICE_TEMPLATES.find((item) => item.id === 'router')!, 'router-1');
    expect(device.kind).toBe('router');
    expect(device.attrs.layer).toBe('L3');
    expect(device.ports.map((port) => port.name)).toEqual(['te0', 'te1', 'gi0/0', 'gi0/1']);
    expect(device.ports[0].media).toBe('fiber');
    expect(device.ports[0].speed).toBe('10G');
    expect(device.ports[2].media).toBe('copper');
  });

  it('коммутатор — восьмипортовый L2', () => {
    const device = createFromTemplate(DEVICE_TEMPLATES.find((item) => item.id === 'switch')!, 'switch-1');
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
});
