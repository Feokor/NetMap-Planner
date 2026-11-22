import { describe, expect, it } from 'vitest';
import { createDevice, createProject, type ProjectDocument } from '../src/core/project';
import { exportDrawio } from '../src/core/drawio';

function sample(): ProjectDocument {
  const doc = createProject('Офис');
  const router = createDevice({ name: 'HQ-RTR', kind: 'router', canvas: { x: 10, y: 20 } });
  const server = createDevice({ name: 'SRV', kind: 'server', canvas: { x: 300, y: 20 } });
  doc.devices = [router, server];
  doc.links = [
    { id: 'lnk_1', a: { deviceId: router.id }, b: { deviceId: server.id }, media: 'fiber' },
  ];
  doc.annotations = [
    { id: 'ann_1', kind: 'rect', layerId: doc.layers[0].id, x: 0, y: 0, width: 100, height: 50, text: 'LAN' },
  ];
  return doc;
}

describe('экспорт draw.io', () => {
  it('создаёт mxfile с устройствами и связью', () => {
    const xml = exportDrawio(sample());
    expect(xml.startsWith('<mxfile')).toBe(true);
    expect(xml).toContain('value="HQ-RTR"');
    expect(xml).toContain('value="SRV"');
    expect(xml).toContain('edge="1"');
    expect(xml).toContain('source="dev_');
    expect(xml).toContain('value="LAN"');
    expect(xml).toContain('</mxfile>');
  });

  it('экранирует специальные символы в именах', () => {
    const doc = sample();
    doc.devices[0].name = 'A&B <test>';
    const xml = exportDrawio(doc);
    expect(xml).toContain('A&amp;B &lt;test&gt;');
  });
});
