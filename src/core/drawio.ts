/**
 * Экспорт схемы в draw.io (mxGraph): устройства — вершины, связи — рёбра,
 * рисунки — прямоугольники/эллипсы/текст/линии. Файл открывается и правится
 * в draw.io, diagrams.net или VS Code.
 */

import type { Annotation, Device, ProjectDocument } from './project';
import { MEDIA_COLORS } from '../canvas/render';
import { annotationRect, nodeRect } from '../canvas/geometry';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function deviceSubtitle(device: Device): string {
  const parts = [device.attrs.os, device.attrs.role].filter(Boolean);
  return parts.join(' · ');
}

function deviceStyle(device: Device): string {
  return [
    'rounded=1',
    'whiteSpace=wrap',
    'html=1',
    'fillColor=#16233a',
    'strokeColor=#2c3d59',
    'fontColor=#e8eef9',
    'arcSize=10',
    'fontSize=12',
    'align=left',
    'verticalAlign=middle',
    'spacingLeft=8',
    `strokeWidth=${device.kind === 'router' ? 2 : 1}`,
  ].join(';');
}

function annotationStyle(annotation: Annotation): string {
  const stroke = annotation.stroke ?? '#4d9cff';
  const fill = annotation.fill ?? 'none';
  const opacity = annotation.opacity != null ? annotation.opacity : 1;
  if (annotation.kind === 'ellipse') {
    return `ellipse;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};opacity=${opacity};`;
  }
  if (annotation.kind === 'text' || annotation.kind === 'note') {
    return [
      'text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;',
      `fontColor=${annotation.color ?? '#e8eef9'};`,
      `fontSize=${annotation.fontSize ?? 14};`,
      'fillColor=none;strokeColor=none;',
    ].join('');
  }
  return `rounded=0;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};opacity=${opacity};`;
}

export function exportDrawio(doc: ProjectDocument): string {
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  const deviceIds = new Set(doc.devices.map((device) => device.id));

  for (const device of doc.devices) {
    const rect = nodeRect(device);
    const subtitle = deviceSubtitle(device);
    const label = escapeXml(subtitle ? `${device.name}\n${subtitle}` : device.name);
    cells.push(
      `<mxCell id="${escapeXml(device.id)}" value="${label}" style="${deviceStyle(device)}" vertex="1" parent="1">` +
        `<mxGeometry x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" as="geometry"/>` +
        '</mxCell>',
    );
  }

  for (const link of doc.links) {
    if (!deviceIds.has(link.a.deviceId) || !deviceIds.has(link.b.deviceId)) continue;
    const color = link.color ?? MEDIA_COLORS[link.media] ?? '#f0a35e';
    const label = link.label ?? link.protocol?.toUpperCase() ?? '';
    const style = [
      'endArrow=none',
      'html=1',
      `strokeColor=${color}`,
      `strokeWidth=${link.style?.width ?? 2}`,
      link.style?.dashed ? 'dashed=1' : '',
    ]
      .filter(Boolean)
      .join(';');
    cells.push(
      `<mxCell id="${escapeXml(link.id)}" value="${escapeXml(label)}" style="${style}" edge="1" parent="1" source="${escapeXml(link.a.deviceId)}" target="${escapeXml(link.b.deviceId)}">` +
        '<mxGeometry relative="1" as="geometry"/>' +
        '</mxCell>',
    );
  }

  for (const annotation of doc.annotations) {
    const rect = annotationRect(annotation);
    if (annotation.kind === 'line' || annotation.kind === 'arrow') {
      const style = [
        'endArrow=' + (annotation.kind === 'arrow' ? 'classic' : 'none'),
        'html=1',
        `strokeColor=${annotation.stroke ?? '#4d9cff'}`,
        `strokeWidth=${annotation.strokeWidth ?? 2}`,
      ].join(';');
      cells.push(
        `<mxCell id="${escapeXml(annotation.id)}" value="${escapeXml(annotation.text ?? '')}" style="${style}" edge="1" parent="1">` +
          '<mxGeometry relative="1" as="geometry">' +
          `<mxPoint x="${annotation.x}" y="${annotation.y}" as="sourcePoint"/>` +
          `<mxPoint x="${annotation.x + annotation.width}" y="${annotation.y + annotation.height}" as="targetPoint"/>` +
          '</mxGeometry></mxCell>',
      );
      continue;
    }
    cells.push(
      `<mxCell id="${escapeXml(annotation.id)}" value="${escapeXml(annotation.text ?? '')}" style="${annotationStyle(annotation)}" vertex="1" parent="1">` +
        `<mxGeometry x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" as="geometry"/>` +
        '</mxCell>',
    );
  }

  return [
    '<mxfile host="NetMap Planner" type="device">',
    `  <diagram id="netmap" name="${escapeXml(doc.name)}">`,
    '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="16" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="2000" pageHeight="1200" math="0" shadow="0">',
    '      <root>',
    ...cells.map((cell) => `        ${cell}`),
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>',
    '</mxfile>',
  ].join('\n');
}
