import { describe, expect, it } from 'vitest';
import {
  createDevice,
  createIpAssignment,
  createPort,
  createProject,
  validateProject,
  type ProjectDocument,
} from '../src/core/project';
import { addIpBlock as addBlock } from '../src/core/ipPlan';

function docWithPool(address: string, prefix: number, blockCidr: string): ProjectDocument {
  const base = createProject('Тест');
  const device = createDevice({ name: 'HQ-PC' });
  device.ports = [
    createPort({ name: 'eth0', ips: [createIpAssignment(address, prefix, 'dhcp')] }),
  ];
  return {
    ...base,
    devices: [device],
    ipPlan: {
      blocks: [{ id: 'blk_test', cidr: blockCidr, name: 'LAN' }],
      groups: [],
    },
  };
}

describe('регрессии IP-плана', () => {
  it('добавление блока не сбрасывает группы подсетей', () => {
    const base = createProject('Тест');
    const withGroup: ProjectDocument = {
      ...base,
      ipPlan: {
        ...base.ipPlan,
        groups: [{ id: 'ipg_1', name: 'HQ', parentId: null, blockIds: [] }],
      },
    };
    const next = addBlock(withGroup, '10.0.0.0/24', 'LAN');
    expect(next.ipPlan.groups).toHaveLength(1);
    expect(next.ipPlan.groups?.[0].name).toBe('HQ');
    expect(next.ipPlan.blocks).toHaveLength(base.ipPlan.blocks.length + 1);
  });

  it('не ругается на адрес пула, если в плане есть ровно эта сеть', () => {
    // .200/28 — это сеть .192/28; блок плана совпадает, предупреждение лишнее.
    const doc = docWithPool('192.168.7.200', 28, '192.168.7.192/28');
    const issues = validateProject(doc);
    expect(issues.some((issue) => issue.message.includes('адресом сети'))).toBe(false);
  });

  it('предупреждает, если такой сети в плане нет', () => {
    const doc = docWithPool('192.168.7.200', 28, '192.168.7.128/26');
    const issues = validateProject(doc);
    expect(issues.some((issue) => issue.message.includes('адресом сети'))).toBe(true);
  });
});
