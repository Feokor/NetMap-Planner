import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  type Annotation,
  type Device,
  type Layer,
  type Link,
  type LinkMedia,
  type LinkProtocol,
  type ProjectDocument,
  LINK_MEDIA,
  LINK_PROTOCOLS,
  NOTES_LAYER,
  isLogicalPort,
  linkablePorts,
  uid,
} from '../core/project';
import { t } from '../i18n';
import { storage } from '../app/storage';
import { createFromTemplate, uniqueDeviceName, type DeviceTemplate } from '../core/templates';
import { TemplatePicker } from '../ui/TemplatePicker';
import { Modal } from '../ui/Modal';
import {
  IconArrow,
  IconCircle,
  IconCursor,
  IconEye,
  IconEyeOff,
  IconFit,
  IconLayers,
  IconLayout,
  IconLine,
  IconLink,
  IconLock,
  IconMap,
  IconMore,
  IconRedo,
  IconSquare,
  IconText,
  IconTrash,
  IconUndo,
  IconSearch,
  IconDownload,
  IconUnlock,
} from '../ui/icons';
import {
  type AlignmentGuide,
  type CanvasTool,
  type Point,
  type Viewport,
  NODE_HEIGHT,
  NODE_WIDTH,
  alignmentSnap,
  distanceToPolyline,
  findFreeSpot,
  fitViewport,
  hitTestDevices,
  isLayerLocked,
  layerPlan,
  nodeRect,
  pointInRect,
  annotationRect,
  screenToWorld,
  snap,
  worldToScreen,
  zoomAt,
} from './geometry';
import { Minimap } from './Minimap';
import { autoLayout } from './layout';
import { linkPoints } from './links';
import {
  MEDIA_COLORS,
  type DraftShape,
  type ThemeName,
  renderScene,
  sceneRects,
} from './render';
import { exportCanvasPNG, generateExportFilename } from './export';

const ANNOTATION_COLORS = ['#4d9cff', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#e5e7eb'];

/** Что умеет каждая группа кнопок инструментов: клик — основной, удержание — выбор. */
const TOOL_GROUPS: Array<{ id: string; tools: CanvasTool[]; fallback: CanvasTool }> = [
  { id: 'line', tools: ['line', 'arrow'], fallback: 'line' },
  { id: 'shape', tools: ['rect', 'ellipse'], fallback: 'rect' },
  { id: 'text', tools: ['text'], fallback: 'text' },
];

export interface CanvasBottomAction {
  id: string;
  label: string;
  count?: number;
  warn?: boolean;
  onClick: () => void;
}

export interface CanvasViewProps {
  doc: ProjectDocument;
  onChange: (updater: (doc: ProjectDocument) => ProjectDocument, options?: { history?: boolean }) => void;
  onEditDevice: (deviceId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  layersOpen: boolean;
  onToggleLayers: () => void;
  bottomActions?: CanvasBottomAction[];
  onOpenTemplates?: () => void;
}

interface DragState {
  kind: 'pan' | 'move' | 'draw';
  startScreen: Point;
  startWorld: Point;
  viewOrigin: Viewport;
  deviceOrigin: Map<string, Point>;
  draftKind?: DraftShape['kind'];
  moved: boolean;
}

interface TextEditState {
  mode: 'create' | 'edit';
  note: boolean;
  world?: Point;
  annotation?: Annotation;
}

function pointFromEvent(event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function activeTheme(): ThemeName {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function normalizeBounds(from: Point, to: Point) {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
}

export function CanvasView({
  doc,
  onChange,
  onEditDevice,
  onUndo,
  onRedo,
  layersOpen,
  onToggleLayers,
  bottomActions = [],
  onOpenTemplates,
}: CanvasViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  /** Активные указатели: два и больше — это щипок, а не перетаскивание. */
  const pointersRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<{ distance: number; center: Point; view: Viewport } | null>(null);
  const pixelSizeRef = useRef({ width: 0, height: 0 });
  const fittedDocRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<Viewport>({ x: 48, y: 48, zoom: 1 });
  const [selection, setSelection] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [media, setMedia] = useState<LinkMedia>('copper');
  const [activeTool, setActiveTool] = useState<CanvasTool>('select');
  const [draft, setDraft] = useState<DraftShape | null>(null);
  const [guides, setGuides] = useState<AlignmentGuide[]>([]);
  const [preview, setPreview] = useState<Map<string, Point>>(new Map());
  const [theme, setTheme] = useState<ThemeName>(activeTheme);
  const [textEdit, setTextEdit] = useState<TextEditState | null>(null);
  const [textValue, setTextValue] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotationColor, setAnnotationColor] = useState('#4d9cff');
  const [dragging, setDragging] = useState(false);
  const [pick, setPick] = useState<Record<string, CanvasTool>>({});
  const [groupOpen, setGroupOpen] = useState<string | null>(null);
  const [hoverTool, setHoverTool] = useState<CanvasTool | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  /** Выбор инструмента удержанием: попап открыт, палец ещё на экране. */
  const dragPick = useRef<{ groupId: string; tool: CanvasTool | null } | null>(null);

  const startPress = (groupId: string) => {
    longPressed.current = false;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      dragPick.current = { groupId, tool: null };
      setHoverTool(null);
      setGroupOpen(groupId);
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(6);
    }, 420);
  };

  const endPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  // Пока палец не оторван, попап вариантов подсвечивает то, над чем он находится:
  // отпускание выбирает инструмент без второго нажатия.
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragPick.current;
      if (!drag) return;
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const option = target?.closest<HTMLElement>('[data-tool-pick]') ?? null;
      if (!option || option.dataset.toolGroup !== drag.groupId) return;
      const tool = option.dataset.toolPick as CanvasTool | undefined;
      if (!tool) return;
      drag.tool = tool;
      setHoverTool(tool);
    };
    const finish = () => {
      const drag = dragPick.current;
      if (!drag) return;
      dragPick.current = null;
      setHoverTool(null);
      if (!drag.tool) return;
      const tool = drag.tool;
      setPick((value) => ({ ...value, [drag.groupId]: tool }));
      setActiveTool(tool);
      setGroupOpen(null);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
    };
  }, []);

  const structureLayer = doc.layers.find((layer) => layer.kind === 'structure');
  const structureVisible = structureLayer ? structureLayer.visible !== false : true;
  const structureLocked = isLayerLocked(doc.layers, structureLayer?.id);

  /* ---------------------------------------------------------------- */
  /* Размеры, тема и первичное вписывание                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(activeTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void storage.get<boolean>('ui.minimap').then((value) => {
      if (value) setMinimapOpen(true);
    });
  }, []);

  // Ctrl+F открывает поиск и сразу ставит курсор в поле — можно печатать.
  useEffect(() => {
    if (!searchOpen) return;
    const input = searchInputRef.current;
    input?.focus();
    input?.select();
  }, [searchOpen]);

  useEffect(() => {
    if (size.width < 20 || fittedDocRef.current === doc.id) return;
    fittedDocRef.current = doc.id;
    const rects = doc.devices.map(nodeRect);
    for (const annotation of doc.annotations) {
      rects.push(annotationRect(annotation));
    }
    if (rects.length > 0) setView(fitViewport(rects, size.width, size.height, 72));
    else setView({ x: size.width / 2, y: size.height / 2, zoom: 1 });
  }, [doc, size.width, size.height]);

  useEffect(() => {
    setSelection([]);
    setLinkSourceId(null);
    setActiveTool('select');
    setDraft(null);
    setPreview(new Map());
  }, [doc.id]);

  /* ---------------------------------------------------------------- */
  /* Отрисовка                                                         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width < 1 || size.height < 1) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(size.width * dpr);
    const height = Math.round(size.height * dpr);
    if (pixelSizeRef.current.width !== width || pixelSizeRef.current.height !== height) {
      canvas.width = width;
      canvas.height = height;
      pixelSizeRef.current = { width, height };
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderScene({
      ctx,
      doc,
      view,
      width: size.width,
      height: size.height,
      dpr,
      theme,
      selection,
      hoveredId,
      linkSourceId,
      preview,
      pointer,
      activeTool,
      draft,
      selectedLinkId,
      selectedAnnotationId,
      annotationColor,
      guides,
    });
  }, [
    doc,
    view,
    size,
    theme,
    selection,
    hoveredId,
    linkSourceId,
    preview,
    pointer,
    activeTool,
    draft,
    selectedLinkId,
    selectedAnnotationId,
    annotationColor,
    guides,
  ]);

  /* ---------------------------------------------------------------- */
  /* Изменения документа                                               */
  /* ---------------------------------------------------------------- */

  const updateLayer = (id: string, patch: Partial<Layer>) =>
    onChange((current) => ({
      ...current,
      layers: current.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    }));

  const toggleSetting = (key: 'showGrid' | 'snap') =>
    onChange((current) => ({
      ...current,
      settings: { ...current.settings, [key]: !current.settings[key] },
    }));

  const updateAnnotationText = (annotation: Annotation, text: string) =>
    onChange((current) => ({
      ...current,
      annotations: current.annotations.map((item) =>
        item.id === annotation.id ? { ...item, text } : item,
      ),
    }));

  const addAnnotation = (kind: DraftShape['kind'], from: Point, to: Point) => {
    const layer = doc.layers.find(
      (item) => item.kind === 'annotation' && item.id === NOTES_LAYER,
    ) ?? doc.layers.find((item) => item.kind === 'annotation');
    if (!layer) return;
    if (isLayerLocked(doc.layers, layer.id)) return;

    const geometry =
      kind === 'line' || kind === 'arrow'
        ? { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y }
        : normalizeBounds(from, to);

    const annotation: Annotation = {
      id: uid('ann'),
      kind,
      layerId: layer.id,
      ...geometry,
      fill: kind === 'line' || kind === 'arrow' ? undefined : annotationColor,
      stroke: annotationColor,
      strokeWidth: 2,
      radius: 10,
      opacity: 0.16,
      fontSize: 14,
      fontWeight: 600,
      textAlign: 'left',
      color: undefined,
    };

    if (kind === 'note') annotation.text = '';
    onChange((current) => ({ ...current, annotations: [...current.annotations, annotation] }));
  };

  const openTextCreate = (world: Point, note: boolean) => {
    setTextValue('');
    setTextEdit({ mode: 'create', note, world });
  };

  const openTextEdit = (annotation: Annotation) => {
    setTextValue(annotation.text ?? '');
    setTextEdit({ mode: 'edit', note: annotation.kind === 'note', annotation });
  };

  const saveText = () => {
    if (!textEdit) return;
    const value = textValue.trim();
    if (textEdit.mode === 'edit' && textEdit.annotation) {
      updateAnnotationText(textEdit.annotation, value);
      setTextEdit(null);
      return;
    }
    if (!value || !textEdit.world) {
      setTextEdit(null);
      return;
    }

    const layer = doc.layers.find(
      (item) => item.kind === 'annotation' && item.id === NOTES_LAYER,
    ) ?? doc.layers.find((item) => item.kind === 'annotation');
    if (!layer || isLayerLocked(doc.layers, layer.id)) {
      setTextEdit(null);
      return;
    }

    const annotation: Annotation = {
      id: uid('ann'),
      kind: textEdit.note ? 'note' : 'text',
      layerId: layer.id,
      x: Math.round(textEdit.world.x),
      y: Math.round(textEdit.world.y),
      width: textEdit.note ? 230 : 220,
      height: textEdit.note ? 96 : 32,
      fill: textEdit.note ? annotationColor : undefined,
      stroke: textEdit.note ? annotationColor : undefined,
      strokeWidth: 2,
      radius: 10,
      opacity: 0.16,
      fontSize: textEdit.note ? 13 : 15,
      fontWeight: textEdit.note ? 500 : 700,
      textAlign: 'left',
      text: value,
    };
    onChange((current) => ({ ...current, annotations: [...current.annotations, annotation] }));
    setTextEdit(null);
  };

  const addDevice = (template: DeviceTemplate | null) => {
    const world = screenToWorld(
      { x: size.width / 2, y: size.height / 2 },
      view,
    );
    const preferred = {
      x: snap(world.x - NODE_WIDTH / 2, doc.settings.grid),
      y: snap(world.y - NODE_HEIGHT / 2, doc.settings.grid),
    };
    const spot = findFreeSpot(doc.devices.map(nodeRect), { width: NODE_WIDTH, height: NODE_HEIGHT }, preferred, {
      step: Math.max(16, doc.settings.grid),
    });
    const device = createFromTemplate(
      template,
      uniqueDeviceName(doc, template?.kind ?? 'device'),
    );
    device.canvas = { x: spot.x, y: spot.y };
    onChange((current) => ({ ...current, devices: [...current.devices, device] }));
    setSelection([device.id]);
    setSelectedLinkId(null);
    setSelectedAnnotationId(null);
    setActiveTool('select');
    setPickerOpen(false);
  };

  const deleteSelection = () => {
    if (selectedAnnotationId) {
      const id = selectedAnnotationId;
      onChange((current) => ({
        ...current,
        annotations: current.annotations.filter((annotation) => annotation.id !== id),
      }));
      setSelectedAnnotationId(null);
      return;
    }
    if (selectedLinkId) {
      const id = selectedLinkId;
      onChange((current) => ({
        ...current,
        links: current.links.filter((link) => link.id !== id),
      }));
      setSelectedLinkId(null);
      return;
    }
    if (selection.length === 0) return;
    if (!window.confirm(t('canvas.confirmDelete', { n: String(selection.length) }))) return;
    const removed = new Set(selection);
    onChange((current) => ({
      ...current,
      devices: current.devices.filter((device) => !removed.has(device.id)),
      links: current.links.filter(
        (link) => !removed.has(link.a.deviceId) && !removed.has(link.b.deviceId),
      ),
    }));
    setSelection([]);
    setHoveredId(null);
  };

  const connectDevices = (first: Device, second: Device) => {
    if (first.id === second.id) return;
    // Между одной парой устройств может быть несколько связей — занимаем разные порты.
    const used = new Set<string>();
    for (const link of doc.links) {
      if (link.a.portId) used.add(`${link.a.deviceId}:${link.a.portId}`);
      if (link.b.portId) used.add(`${link.b.deviceId}:${link.b.portId}`);
    }
    const pickPort = (device: Device): string | null => {
      const port = linkablePorts(device).find((item) => !used.has(`${device.id}:${item.id}`));
      if (port) used.add(`${device.id}:${port.id}`);
      return port?.id ?? null;
    };
    const portA = pickPort(first);
    const portB = pickPort(second);
    onChange((current) => ({
      ...current,
      links: [
        ...current.links,
        {
          id: uid('lnk'),
          a: { deviceId: first.id, portId: portA },
          b: { deviceId: second.id, portId: portB },
          media,
          label: '',
          points: [],
        },
      ],
    }));
  };

  /* ---------------------------------------------------------------- */
  /* Геометрия под курсором                                            */
  /* ---------------------------------------------------------------- */

  const deviceAt = (world: Point): Device | null => {
    if (!structureVisible) return null;
    return hitTestDevices(doc.devices, world);
  };

  const annotationAt = (world: Point): Annotation | null => {
    const visible = new Set(
      doc.layers.filter((layer) => layer.visible !== false && !layer.locked).map((layer) => layer.id),
    );
    const items = doc.annotations.filter((item) => visible.has(item.layerId));
    for (let i = items.length - 1; i >= 0; i--) {
      if (pointInRect(world, annotationRect(items[i]))) return items[i];
    }
    return null;
  };

  /** Все связи под курсором, ближайшая первой — для перебора параллельных линий. */
  const linksAt = (world: Point): Link[] => {
    if (!structureVisible) return [];
    const tolerance = 9 / Math.max(view.zoom, 0.2);
    const hits: Array<{ link: Link; distance: number }> = [];
    for (const link of doc.links) {
      const points = linkPoints(doc, link);
      if (points.length < 2) continue;
      const distance = distanceToPolyline(points, world);
      if (distance <= tolerance) hits.push({ link, distance });
    }
    hits.sort((left, right) => left.distance - right.distance);
    return hits.map((hit) => hit.link);
  };

  /* ---------------------------------------------------------------- */
  /* Мышь и касания                                                    */
  /* ---------------------------------------------------------------- */

  const handlePointerDown = (event: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (event.button !== 0 && event.button !== 1) return;
    const screen = pointFromEvent(event, canvas);

    pointersRef.current.set(event.pointerId, screen);
    if (pointersRef.current.size >= 2) {
      // Второй палец отменяет начатое перетаскивание и включает щипок.
      const [first, second] = [...pointersRef.current.values()];
      dragRef.current = null;
      setDragging(false);
      setPreview(new Map());
      setDraft(null);
      pinchRef.current = {
        distance: Math.hypot(first.x - second.x, first.y - second.y) || 1,
        center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
        view,
      };
      try { canvas.setPointerCapture(event.pointerId); } catch { /* синтетические события без захвата */ }
      return;
    }

    setDragging(true);
    const world = screenToWorld(screen, view);
    const device = deviceAt(world);
    if (activeTool === 'link') {
      if (!device) {
        setLinkSourceId(null);
        return;
      }
      setSelectedLinkId(null);
      setSelectedAnnotationId(null);
      if (!linkSourceId) {
        setLinkSourceId(device.id);
        setSelection([device.id]);
        return;
      }
      const source = doc.devices.find((item) => item.id === linkSourceId);
      if (source) connectDevices(source, device);
      setLinkSourceId(null);
      setSelection([device.id]);
      return;
    }

    if (activeTool === 'text' || activeTool === 'note') {
      openTextCreate(world, activeTool === 'note');
      return;
    }

    if (activeTool === 'rect' || activeTool === 'ellipse' || activeTool === 'arrow' || activeTool === 'line') {
      setDraft({ kind: activeTool, start: world, end: world });
      dragRef.current = {
        kind: 'draw',
        startScreen: screen,
        startWorld: world,
        viewOrigin: view,
        deviceOrigin: new Map(),
        draftKind: activeTool,
        moved: false,
      };
      try { canvas.setPointerCapture(event.pointerId); } catch { /* синтетические события без захвата */ }
      return;
    }

    if (device) {
      setSelectedLinkId(null);
      setSelectedAnnotationId(null);
      const already = selection.includes(device.id);
      const nextSelection = event.shiftKey
        ? already
          ? selection.filter((id) => id !== device.id)
          : [...selection, device.id]
        : already
          ? selection
          : [device.id];
      setSelection(nextSelection);

      if (!structureLocked && (event.shiftKey ? already : true)) {
        const origins = new Map<string, Point>();
        for (const id of nextSelection) {
          const item = doc.devices.find((candidate) => candidate.id === id);
          if (item) {
            const rect = nodeRect(item);
            origins.set(id, { x: rect.x, y: rect.y });
          }
        }
        dragRef.current = {
          kind: 'move',
          startScreen: screen,
          startWorld: world,
          viewOrigin: view,
          deviceOrigin: origins,
          moved: false,
        };
        try { canvas.setPointerCapture(event.pointerId); } catch { /* синтетические события без захвата */ }
      }
      return;
    }

    // Alt+клик пропускает рисунки насквозь — удобно попасть по проводу под рамкой.
    const annotation = event.altKey ? null : annotationAt(world);
    if (annotation) {
      setSelectedAnnotationId(annotation.id);
      setSelectedLinkId(null);
      setSelection([]);
      setLinkSourceId(null);
      return;
    }

    const linkCandidates = linksAt(world);
    if (linkCandidates.length > 0) {
      // Повторный клик по пучку параллельных связей переключает на следующую.
      const currentIndex = selectedLinkId
        ? linkCandidates.findIndex((candidate) => candidate.id === selectedLinkId)
        : -1;
      const link =
        currentIndex >= 0
          ? linkCandidates[(currentIndex + 1) % linkCandidates.length]
          : linkCandidates[0];
      setSelectedLinkId(link.id);
      setSelectedAnnotationId(null);
      setSelection([]);
      setLinkSourceId(null);
      return;
    }

    setSelection([]);
    setSelectedLinkId(null);
    setSelectedAnnotationId(null);
    setLinkSourceId(null);
    dragRef.current = {
      kind: 'pan',
      startScreen: screen,
      startWorld: world,
      viewOrigin: view,
      deviceOrigin: new Map(),
      moved: false,
    };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* синтетические события без захвата */ }
  };

  /** Позиции при перетаскивании: сетка + выравнивание по соседям. */
  const computeMove = (
    startWorld: Point,
    deviceOrigin: Map<string, Point>,
    world: Point,
  ): { positions: Map<string, Point>; guides: AlignmentGuide[] } => {
    const worldDx = world.x - startWorld.x;
    const worldDy = world.y - startWorld.y;
    const grid = doc.settings.snap ? doc.settings.grid : 0;
    const positions = new Map<string, Point>();
    for (const [id, origin] of deviceOrigin) {
      positions.set(id, {
        x: snap(origin.x + worldDx, grid),
        y: snap(origin.y + worldDy, grid),
      });
    }

    const primaryId = deviceOrigin.keys().next().value as string | undefined;
    const primaryPoint = primaryId ? positions.get(primaryId) : null;
    if (!primaryId || !primaryPoint) return { positions, guides: [] };

    const primary = doc.devices.find((device) => device.id === primaryId);
    const primaryRect = primary
      ? nodeRect(primary)
      : { x: primaryPoint.x, y: primaryPoint.y, width: NODE_WIDTH, height: NODE_HEIGHT };
    const targets = doc.devices
      .filter((device) => !deviceOrigin.has(device.id))
      .map(nodeRect);
    const alignment = alignmentSnap(
      { ...primaryPoint, width: primaryRect.width, height: primaryRect.height },
      targets,
      7 / Math.max(view.zoom, 0.2),
    );
    if (alignment.dx !== 0 || alignment.dy !== 0) {
      for (const [id, point] of positions) {
        positions.set(id, { x: point.x + alignment.dx, y: point.y + alignment.dy });
      }
    }
    return { positions, guides: alignment.guides };
  };

  const handlePointerMove = (event: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const screen = pointFromEvent(event, canvas);
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, screen);
    }

    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const [first, second] = [...pointersRef.current.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y) || 1;
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const zoomed = zoomAt(pinch.view, pinch.center, pinch.view.zoom * (distance / pinch.distance));
      setView({
        zoom: zoomed.zoom,
        x: zoomed.x + (center.x - pinch.center.x),
        y: zoomed.y + (center.y - pinch.center.y),
      });
      return;
    }

    const world = screenToWorld(screen, view);
    setPointer(world);

    const drag = dragRef.current;
    if (!drag) {
      const device = deviceAt(world);
      setHoveredId((current) => (current === (device?.id ?? null) ? current : device?.id ?? null));
      return;
    }

    const dx = screen.x - drag.startScreen.x;
    const dy = screen.y - drag.startScreen.y;
    if (Math.hypot(dx, dy) > 2) drag.moved = true;

    if (drag.kind === 'pan') {
      setView({
        ...drag.viewOrigin,
        x: drag.viewOrigin.x + dx,
        y: drag.viewOrigin.y + dy,
      });
      return;
    }

    if (drag.kind === 'move') {
      const { positions, guides: nextGuides } = computeMove(
        drag.startWorld,
        drag.deviceOrigin,
        world,
      );
      setGuides(nextGuides);
      setPreview(positions);
      return;
    }

    if (drag.kind === 'draw') {
      setDraft((current) => (current ? { ...current, end: world } : current));
    }
  };

  const handlePointerUp = (event: PointerEvent) => {
    const canvas = canvasRef.current;
    pointersRef.current.delete(event.pointerId);
    setGuides([]);
    if (pinchRef.current) {
      if (pointersRef.current.size < 2) pinchRef.current = null;
      if (pointersRef.current.size === 0) setDragging(false);
      try { canvas?.releasePointerCapture(event.pointerId); } catch { /* захват уже снят */ }
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!canvas || !drag) return;

    if (drag.kind === 'move' && drag.moved) {
      const screen = pointFromEvent(event, canvas);
      const world = screenToWorld(screen, view);
      const { positions: moved } = computeMove(drag.startWorld, drag.deviceOrigin, world);
      setPreview(new Map());
      onChange((current) => ({
        ...current,
        devices: current.devices.map((device) => {
          const point = moved.get(device.id);
          if (!point) return device;
          return { ...device, canvas: { ...(device.canvas ?? { x: 0, y: 0 }), x: point.x, y: point.y } };
        }),
      }));
    } else if (drag.kind === 'draw') {
      const screen = pointFromEvent(event, canvas);
      const world = screenToWorld(screen, view);
      const kind = drag.draftKind;
      if (kind) {
        const distance = Math.hypot(world.x - drag.startWorld.x, world.y - drag.startWorld.y);
        if (distance > 6) addAnnotation(kind, drag.startWorld, world);
      }
      setDraft(null);
    }

    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* захват мог быть уже снят */
    }
  };

  const handlePointerLeave = () => {
    if (!dragRef.current && !pinchRef.current) {
      setHoveredId(null);
      setPointer(null);
    }
  };
  const handleDoubleClick = (event: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = screenToWorld(pointFromEvent(event, canvas), view);
    const device = deviceAt(world);
    if (device) {
      onEditDevice(device.id);
      return;
    }
    const annotation = annotationAt(world);
    if (annotation && (annotation.kind === 'text' || annotation.kind === 'note')) {
      openTextEdit(annotation);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Клавиатура, колесо и зум                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Тачпад при щипке присылает десятки wheel-событий в секунду: без
    // склейки по кадру каждое событие даёт полный ре-рендер и «дёргание».
    type PendingWheel = {
      zoom: boolean;
      screen: { x: number; y: number };
      factor: number;
      dx: number;
      dy: number;
    };
    let frame = 0;
    let pending: PendingWheel | null = null;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      const next = pending;
      pending = null;
      setView((current) =>
        next.zoom
          ? zoomAt(current, next.screen, current.zoom * next.factor)
          : { ...current, x: current.x - next.dx, y: current.y - next.dy },
      );
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const screen = pointFromEvent(event, canvas);
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.0022);
        pending = {
          zoom: true,
          screen,
          factor: (pending?.zoom ? pending.factor : 1) * factor,
          dx: 0,
          dy: 0,
        };
      } else {
        const dx = event.shiftKey ? event.deltaY : event.deltaX;
        const dy = event.shiftKey ? 0 : event.deltaY;
        pending = {
          zoom: false,
          screen,
          factor: 1,
          dx: (pending && !pending.zoom ? pending.dx : 0) + dx,
          dy: (pending && !pending.zoom ? pending.dy : 0) + dy,
        };
      }
      if (!frame) frame = requestAnimationFrame(flush);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // event.code не зависит от раскладки — хоткеи работают и в русской.
      const modifier = event.ctrlKey || event.metaKey;
      const code = event.code;
      if (modifier && (code === 'KeyF' || code === 'KeyK' || event.key.toLowerCase() === 'f' || event.key.toLowerCase() === 'k')) {
        event.preventDefault();
        setSearchQuery('');
        setSearchOpen(true);
        return;
      }
      if (modifier && code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (modifier && code === 'KeyY') {
        event.preventDefault();
        onRedo();
        return;
      }
      if (modifier && code === 'KeyS') {
        event.preventDefault();
        const canvas = canvasRef.current;
        if (canvas) {
          const filename = generateExportFilename(doc, 'netmap');
          void exportCanvasPNG(canvas, filename);
        }
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selection.length > 0 || selectedLinkId || selectedAnnotationId) {
          event.preventDefault();
          deleteSelection();
        }
        return;
      }
      if (event.key === 'Escape') {
        setLinkSourceId(null);
        setDraft(null);
        setSelection([]);
        setSelectedLinkId(null);
        setSelectedAnnotationId(null);
        setActiveTool('select');
        return;
      }
      if (!modifier && !event.altKey) {
        const toolsByCode: Record<string, CanvasTool> = {
          KeyV: 'select',
          KeyL: 'link',
          KeyR: 'rect',
          KeyO: 'ellipse',
          KeyT: 'text',
          KeyN: 'note',
          KeyA: 'arrow',
          KeyI: 'line',
        };
        const tool = toolsByCode[code];
        if (tool) {
          event.preventDefault();
          setActiveTool(tool);
          setLinkSourceId(null);
          setDraft(null);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const fitAll = () => {
    const rects = sceneRects(doc);
    if (rects.length > 0) setView(fitViewport(rects, size.width, size.height, 72));
    else setView({ x: size.width / 2, y: size.height / 2, zoom: 1 });
  };

  const runAutoLayout = () => {
    if (doc.devices.length === 0) return;
    if (!window.confirm(t('canvas.autoLayout.confirm'))) return;
    const positions = autoLayout(doc, { grid: doc.settings.grid });
    if (positions.size === 0) return;
    onChange((current) => ({
      ...current,
      devices: current.devices.map((device) => {
        const point = positions.get(device.id);
        if (!point) return device;
        return {
          ...device,
          canvas: { ...(device.canvas ?? { x: 0, y: 0 }), x: point.x, y: point.y },
        };
      }),
    }));
    const rects = doc.devices
      .map((device) => positions.get(device.id))
      .filter((point): point is Point => point != null)
      .map((point) => ({ x: point.x, y: point.y, width: NODE_WIDTH, height: NODE_HEIGHT }));
    for (const annotation of doc.annotations) rects.push(annotationRect(annotation));
    setSelection([]);
    setSelectedLinkId(null);
    setView(fitViewport(rects, size.width, size.height, 72));
  };

  const navigateMinimap = (world: Point) => {
    setView((current) => ({
      ...current,
      x: size.width / 2 - world.x * current.zoom,
      y: size.height / 2 - world.y * current.zoom,
    }));
  };

  const toggleMinimap = () => {
    const next = !minimapOpen;
    setMinimapOpen(next);
    void storage.set('ui.minimap', next);
  };

  const toolButton = (tool: CanvasTool, icon: JSX.Element, label: string) => (
    <button
      type="button"
      class={`canvas-tool${activeTool === tool ? ' active' : ''}`}
      title={label}
      aria-pressed={activeTool === tool}
      onClick={() => {
        setActiveTool(tool);
        setLinkSourceId(null);
        setDraft(null);
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  /** Иконка инструмента — общая для кнопки группы и её выпадающего списка. */
  const toolIcon = (tool: CanvasTool) => {
    switch (tool) {
      case 'line':
        return <IconLine size={15} />;
      case 'arrow':
        return <IconArrow size={15} />;
      case 'rect':
        return <IconSquare size={15} />;
      case 'ellipse':
        return <IconCircle size={15} />;
      case 'text':
        return <IconText size={15} />;
      default:
        return <IconCursor size={15} />;
    }
  };

  const applyAnnotationColor = (color: string) => {
    setAnnotationColor(color);
    if (!selectedAnnotationId) return;
    const id = selectedAnnotationId;
    onChange((current) => ({
      ...current,
      annotations: current.annotations.map((annotation) =>
        annotation.id === id
          ? {
              ...annotation,
              stroke: color,
              fill:
                annotation.kind === 'line' || annotation.kind === 'arrow'
                  ? annotation.fill
                  : color,
            }
          : annotation,
      ),
    }));
  };

  const selectedLink = selectedLinkId
    ? doc.links.find((link) => link.id === selectedLinkId) ?? null
    : null;

  /** Соседние линии того же пучка — для подписи «связь N из M» и перебора кликом. */
  const selectedLinkSiblings = selectedLink
    ? doc.links.filter(
        (link) =>
          [link.a.deviceId, link.b.deviceId].sort().join('|') ===
          [selectedLink.a.deviceId, selectedLink.b.deviceId].sort().join('|'),
      )
    : [];
  const selectedLinkIndex = selectedLink
    ? selectedLinkSiblings.findIndex((link) => link.id === selectedLink.id)
    : -1;

  const updateSelectedLink = (patch: Partial<Link>) => {
    if (!selectedLinkId) return;
    const id = selectedLinkId;
    onChange((current) => ({
      ...current,
      links: current.links.map((link) => (link.id === id ? { ...link, ...patch } : link)),
    }));
  };

  const setLinkPort = (side: 'a' | 'b', portId: string | null) => {
    if (!selectedLink) return;
    updateSelectedLink({ [side]: { ...selectedLink[side], portId } } as Partial<Link>);
  };

  const plan = layerPlan(doc.layers);
  const orderedLayers = [...doc.layers].sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
  const visibleCount = structureVisible ? doc.devices.length : 0;

  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    const matches: Array<{ id: string; name: string; type: 'device' | 'link' }> = [];
    for (const device of doc.devices) {
      const haystack = [
        device.name,
        device.attrs.os,
        device.attrs.role,
        device.attrs.vendor,
        device.attrs.model,
        device.attrs.location,
        ...device.tags,
        ...device.ports.flatMap((port) => [
          port.name,
          ...(port.members ?? []).map(
            (id) => device.ports.find((item) => item.id === id)?.name ?? '',
          ),
          ...port.ips.map((ip) => ip.address),
          port.mac ?? '',
        ]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (haystack.includes(query)) matches.push({ id: device.id, name: device.name, type: 'device' });
    }
    for (const link of doc.links) {
      const a = doc.devices.find((device) => device.id === link.a.deviceId);
      const b = doc.devices.find((device) => device.id === link.b.deviceId);
      const label = [link.label, a?.name, b?.name, link.media].filter(Boolean).join(' ').toLowerCase();
      if (label.includes(query)) {
        matches.push({ id: link.id, name: link.label || `${a?.name ?? '?'} ↔ ${b?.name ?? '?'}`, type: 'link' });
      }
    }
    return matches;
  }, [doc, searchQuery]);

  const hoveredDevice = hoveredId
    ? doc.devices.find((device) => device.id === hoveredId) ?? null
    : null;
  const tooltipPos = pointer ? worldToScreen(pointer, view) : null;
  const showTooltip =
    !!hoveredDevice && !!tooltipPos && !dragging && activeTool === 'select' && !linkSourceId;

  // Не даём подсказке уехать за правый/нижний край холста.
  const tooltipWidth = 300;
  const tooltipHeight = 64 + (hoveredDevice?.ports.length ?? 0) * 22;
  const flipX = !!tooltipPos && tooltipPos.x + 16 + tooltipWidth > size.width;
  const flipY = !!tooltipPos && tooltipPos.y + 16 + tooltipHeight > size.height;
  const tooltipStyle = tooltipPos
    ? flipX
      ? { right: `${size.width - tooltipPos.x + 16}px`, top: flipY ? undefined : `${tooltipPos.y + 16}px`, bottom: flipY ? `${size.height - tooltipPos.y + 16}px` : undefined }
      : { left: `${tooltipPos.x + 16}px`, top: flipY ? undefined : `${tooltipPos.y + 16}px`, bottom: flipY ? `${size.height - tooltipPos.y + 16}px` : undefined }
    : {};

  return (
    <div class="canvas-shell">
      {selectedLink && (
        <div class="canvas-link-panel">
          <span class="canvas-link-title">{t('canvas.link.selected')}</span>
          {selectedLinkSiblings.length > 1 && (
            <span
              class="canvas-link-count"
              title={t('canvas.link.cycleHint')}
            >
              {selectedLinkIndex + 1} / {selectedLinkSiblings.length}
            </span>
          )}
          {(['a', 'b'] as const).map((side) => {
            const device = doc.devices.find((item) => item.id === selectedLink[side].deviceId);
            return (
              <select
                key={side}
                class="input select canvas-media"
                title={t('canvas.link.port')}
                value={selectedLink[side].portId ?? ''}
                onChange={(event) =>
                  setLinkPort(side, (event.target as HTMLSelectElement).value || null)
                }
              >
                <option value="">{t('canvas.link.noPort')}</option>
                {device &&
                  linkablePorts(device).map((port) => (
                    <option key={port.id} value={port.id}>
                      {device.name} / {port.name}
                    </option>
                  ))}
              </select>
            );
          })}
          <select
            class="input select canvas-media"
            value={selectedLink.media}
            title={t('canvas.link.media')}
            onChange={(event) =>
              updateSelectedLink({ media: (event.target as HTMLSelectElement).value as LinkMedia })
            }
          >
            {LINK_MEDIA.map((item) => (
              <option key={item} value={item}>
                {t(`media.${item}`)}
              </option>
            ))}
          </select>
          <select
            class="input select canvas-media"
            value={selectedLink.protocol ?? ''}
            title={t('canvas.link.protocolHint')}
            onChange={(event) => {
              const value = (event.target as HTMLSelectElement).value;
              const patch: Partial<Link> = {
                protocol: value ? (value as LinkProtocol) : null,
                protocolDetail: value ? selectedLink.protocolDetail ?? '' : undefined,
              };
              // OSPF/BGP — логические связи: физические порты им не нужны.
              if (value) {
                patch.a = { ...selectedLink.a, portId: null };
                patch.b = { ...selectedLink.b, portId: null };
              }
              updateSelectedLink(patch);
            }}
          >
            <option value="">{t('canvas.link.protocol.none')}</option>
            {LINK_PROTOCOLS.map((item) => (
              <option key={item} value={item}>
                {t(`canvas.link.protocol.${item}`)}
              </option>
            ))}
          </select>
          {selectedLink.protocol && (
            <input
              class="input canvas-link-label"
              placeholder={t('canvas.link.protocolDetail')}
              title={t('canvas.link.protocolHint')}
              value={selectedLink.protocolDetail ?? ''}
              onInput={(event) =>
                updateSelectedLink({
                  protocolDetail: (event.target as HTMLInputElement).value,
                })
              }
            />
          )}
          <input
            class="input canvas-link-label"
            placeholder={t('canvas.link.label')}
            value={selectedLink.label ?? ''}
            onInput={(event) =>
              updateSelectedLink({ label: (event.target as HTMLInputElement).value })
            }
          />
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            title={t('common.delete')}
            onClick={deleteSelection}
          >
            <IconTrash size={15} />
          </button>
        </div>
      )}
      <div class="canvas-toolbar">
        <div class="canvas-tools">
          <button
            type="button"
            class="btn btn-primary canvas-add"
            title={t('canvas.addDevice')}
            onClick={() => setPickerOpen(true)}
          >
            ＋
          </button>
          <div class="canvas-sep" />
          {toolButton('select', <IconCursor size={15} />, t('canvas.tool.select'))}
          {toolButton('link', <IconLink size={15} />, t('canvas.tool.link'))}
          {TOOL_GROUPS.map((group) => {
            const current = pick[group.id] ?? group.fallback;
            return (
              <div class="tool-hold" key={group.id}>
                <button
                  type="button"
                  class={`canvas-tool${activeTool === current ? ' active' : ''}${group.tools.length > 1 ? ' has-more' : ''}`}
                  title={`${t(`canvas.tool.${current}`)} — ${t('canvas.tool.hold')}`}
                  onPointerDown={() => startPress(group.id)}
                  onPointerUp={endPress}
                  onPointerLeave={endPress}
                  onPointerCancel={endPress}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={(event) => {
                    if (longPressed.current) return;
                    if ((event.target as HTMLElement).closest('.tool-caret')) {
                      setGroupOpen(groupOpen === group.id ? null : group.id);
                      return;
                    }
                    setActiveTool(current);
                    setGroupOpen(null);
                  }}
                >
                  {toolIcon(current)}
                  <span class="tool-label">{t(`canvas.tool.${current}`)}</span>
                  {group.tools.length > 1 && <span class="tool-caret">▾</span>}
                </button>
                {groupOpen === group.id && (
                  <div class="tool-pop" role="menu" data-tool-group={group.id}>
                    {group.tools.map((tool) => (
                      <button
                        type="button"
                        key={tool}
                        data-tool-pick={tool}
                        data-tool-group={group.id}
                        class={`${current === tool ? 'active' : ''}${hoverTool === tool ? ' hover' : ''}`}
                        onClick={() => {
                          setPick((value) => ({ ...value, [group.id]: tool }));
                          setActiveTool(tool);
                          setGroupOpen(null);
                          setHoverTool(null);
                        }}
                      >
                        {toolIcon(tool)}
                        {t(`canvas.tool.${tool}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div class="canvas-sep" />
          <button
            type="button"
            class="canvas-tool canvas-tool-danger"
            title={t('canvas.delete')}
            disabled={selection.length === 0 && !selectedLinkId && !selectedAnnotationId}
            onClick={deleteSelection}
          >
            <IconTrash size={15} />
          </button>
        </div>

        {(activeTool !== 'select' && activeTool !== 'link') || selectedAnnotationId ? (
          <div class="canvas-colors" title={t('canvas.color')}>
            {ANNOTATION_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                class={`canvas-color${annotationColor === color ? ' active' : ''}`}
                style={{ background: color }}
                aria-label={color}
                onClick={() => applyAnnotationColor(color)}
              />
            ))}
          </div>
        ) : null}

        {activeTool === 'link' && (
          <select
            class="input select canvas-media"
            value={media}
            title={t('canvas.link.media')}
            onChange={(event) => setMedia((event.target as HTMLSelectElement).value as LinkMedia)}
          >
            {LINK_MEDIA.map((item) => (
              <option key={item} value={item}>
                {t(`media.${item}`)}
              </option>
            ))}
          </select>
        )}

        <div class="spacer" />

        <button
          type="button"
          class="btn btn-ghost btn-icon toolbar-wide-only"
          title={`${t('canvas.undo')} (Ctrl+Z)`}
          onClick={onUndo}
        >
          <IconUndo size={16} />
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-icon toolbar-wide-only"
          title={`${t('canvas.redo')} (Ctrl+Y)`}
          onClick={onRedo}
        >
          <IconRedo size={16} />
        </button>

        <div class="tool-hold">
          <button
            type="button"
            class={`canvas-tool${menuOpen ? ' active' : ''}`}
            title={t('canvas.more')}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <IconMore size={16} />
          </button>
          {menuOpen && (
            <div class="tool-pop tool-pop-right" role="menu">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setSearchQuery('');
                  setSearchOpen(true);
                }}
              >
                <IconSearch size={14} /> {t('canvas.search')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  const canvas = canvasRef.current;
                  if (!canvas) return;
                  void exportCanvasPNG(canvas, generateExportFilename(doc, 'netmap'));
                }}
              >
                <IconDownload size={14} /> {t('canvas.export')}
              </button>
              <button
                type="button"
                class={doc.settings.showGrid ? 'active' : ''}
                onClick={() => toggleSetting('showGrid')}
              >
                ◫ {t('canvas.grid')}
              </button>
              <button
                type="button"
                class={doc.settings.snap ? 'active' : ''}
                onClick={() => toggleSetting('snap')}
              >
                ⌗ {t('canvas.snap')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  runAutoLayout();
                }}
              >
                <IconLayout size={14} /> {t('canvas.autoLayout')}
              </button>
              <button
                type="button"
                class={minimapOpen ? 'active' : ''}
                onClick={() => {
                  setMenuOpen(false);
                  toggleMinimap();
                }}
              >
                <IconMap size={14} /> {t('canvas.minimap')}
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          class={`btn btn-ghost toolbar-wide-only${layersOpen ? ' btn-primary' : ''}`}
          title={t('canvas.layers')}
          onClick={onToggleLayers}
        >
          <IconLayers size={15} />
        </button>
      </div>

      <div class="canvas-stage" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          class={`canvas-surface canvas-tool-${activeTool}`}
          style={{ width: `${size.width}px`, height: `${size.height}px` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onDblClick={handleDoubleClick}
          onContextMenu={(event) => event.preventDefault()}
        />

        {showTooltip && hoveredDevice && tooltipPos && (
          <div
            class="canvas-tooltip"
            style={tooltipStyle}
          >
            <div class="canvas-tooltip-head">
              <span>{hoveredDevice.name}</span>
              <span class="canvas-tooltip-kind">
                {t(`devkind.${hoveredDevice.kind}`)}
                {hoveredDevice.attrs.layer ? ` · ${hoveredDevice.attrs.layer}` : ''}
              </span>
            </div>
            {hoveredDevice.attrs.os || hoveredDevice.attrs.role ? (
              <div class="canvas-tooltip-sub">
                {[hoveredDevice.attrs.os, hoveredDevice.attrs.role].filter(Boolean).join(' · ')}
              </div>
            ) : null}
            <div class="canvas-tooltip-ports">
              {hoveredDevice.ports.length === 0 && <span class="muted">—</span>}
              {hoveredDevice.ports.map((port) => (
                <div class="canvas-tooltip-row" key={port.id}>
                  <span class="canvas-tooltip-port">{port.name}</span>
                  <span class="canvas-tooltip-media">{t(`media.${port.media}`)}</span>
                  <span class="canvas-tooltip-ip">
                    {port.ips.length > 0
                      ? port.ips
                          .map((ip) => {
                            const bits = ip.family === 4 ? 32 : 128;
                            const address = ip.prefix === bits ? ip.address : `${ip.address}/${ip.prefix}`;
                            if (ip.role === 'dhcp' || ip.role === 'slaac') {
                              return `${ip.role === 'dhcp' ? 'DHCP' : 'SLAAC'} · ${address}`;
                            }
                            return address;
                          })
                          .join(', ')
                      : '—'}
                  </span>
                  {isLogicalPort(port) && (port.members?.length ?? 0) > 0 && (
                    <span class="canvas-tooltip-members">
                      {(port.members ?? [])
                        .map((id) => hoveredDevice.ports.find((item) => item.id === id)?.name)
                        .filter(Boolean)
                        .join(' + ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {doc.devices.length === 0 && (
          <div class="canvas-empty">
            <h3>{t('canvas.empty.title')}</h3>
            <div>{t('canvas.empty.text')}</div>
            <button type="button" class="btn btn-primary" onClick={() => addDevice(null)}>
              ＋ {t('canvas.addDevice')}
            </button>
          </div>
        )}

        {activeTool === 'link' && (
          <div class="canvas-banner">
            {linkSourceId ? t('canvas.link.second') : t('canvas.link.first')}
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => {
                setLinkSourceId(null);
                setActiveTool('select');
              }}
            >
              {t('canvas.cancel')}
            </button>
          </div>
        )}

        {layersOpen && (
          <div class="canvas-layers">
            <div class="section-title" style={{ marginBottom: '10px' }}>
              <span>{t('canvas.layers')}</span>
              <button type="button" class="btn btn-ghost" onClick={onToggleLayers}>
                ✕
              </button>
            </div>

            <div class="layer-list">
              {orderedLayers.map((layer) => {
                const hidden = layer.visible === false;
                const isStructure = layer.kind === 'structure';
                const index = plan.layers.findIndex((item) => item.id === layer.id);
                return (
                  <div class={`layer-row${hidden ? ' off' : ''}`} key={layer.id}>
                    <button
                      type="button"
                      class="btn btn-ghost btn-icon"
                      title={hidden ? t('canvas.layer.show') : t('canvas.layer.hide')}
                      onClick={() => updateLayer(layer.id, { visible: hidden })}
                    >
                      {hidden ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                    </button>
                    <div class="layer-name">
                      <strong>{layer.name}</strong>
                      <span class="muted">
                        {isStructure ? t('canvas.layer.structure') : t('canvas.layer.annotation')}
                        {index >= 0 ? ` · ${index + 1}` : ''}
                      </span>
                    </div>
                    {isStructure && (
                      <button
                        type="button"
                        class={`btn btn-ghost btn-icon${layer.pinnedTop !== false ? ' active' : ''}`}
                        title={t('canvas.layer.pin')}
                        onClick={() =>
                          updateLayer(layer.id, { pinnedTop: layer.pinnedTop === false })
                        }
                      >
                        ↑
                      </button>
                    )}
                    <button
                      type="button"
                      class={`btn btn-ghost btn-icon${layer.locked ? ' active' : ''}`}
                      title={layer.locked ? t('canvas.layer.unlock') : t('canvas.layer.lock')}
                      onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                    >
                      {layer.locked ? <IconLock size={15} /> : <IconUnlock size={15} />}
                    </button>
                  </div>
                );
              })}
            </div>

            <div class="layer-legend">
              <div class="kv-label">{t('canvas.legend')}</div>
              {LINK_MEDIA.map((item) => (
                <div class="legend-row" key={item}>
                  <span class="legend-line" style={{ background: MEDIA_COLORS[item] }} />
                  <span>{t(`media.${item}`)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div class="canvas-zoom">
          <button
            type="button"
            class="btn btn-ghost canvas-zoom-value"
            title={t('canvas.zoomReset')}
            onClick={() => setView((current) => zoomAt(current, { x: size.width / 2, y: size.height / 2 }, 1))}
          >
            100%
          </button>
          <button type="button" class="btn btn-ghost btn-icon" title={t('canvas.fit')} onClick={fitAll}>
            <IconFit size={16} />
          </button>
        </div>

        {minimapOpen && (
          <Minimap
            doc={doc}
            view={view}
            size={size}
            theme={theme}
            onNavigate={navigateMinimap}
          />
        )}
      </div>

      <div class="canvas-bottom">
        <div class="canvas-dock">
          {bottomActions.map((action) => (
            <button
              type="button"
              key={action.id}
              class={`canvas-dock-btn${action.warn ? ' warn' : ''}`}
              onClick={action.onClick}
            >
              {action.label}
              {typeof action.count === 'number' && action.count > 0 && (
                <span class="tab-count">{action.count}</span>
              )}
            </button>
          ))}
        </div>

        <div class="canvas-status" title={t('canvas.hint')}>
          <span class="mono">
            {t('canvas.status.devices', { n: String(doc.devices.length) })}
            {visibleCount !== doc.devices.length ? ` (${visibleCount})` : ''}
            {' · '}
            {t('canvas.status.links', { n: String(doc.links.length) })}
            {selection.length > 0 ? ` · ${t('canvas.status.selected', { n: String(selection.length) })}` : ''}
          </span>
          <span class="mono canvas-pointer">
            {pointer ? `${Math.round(pointer.x)}:${Math.round(pointer.y)}` : ''}
          </span>
        </div>
      </div>

      {pickerOpen && (
        <TemplatePicker
          onPick={(template) => addDevice(template)}
          onClose={() => setPickerOpen(false)}
          onOpenLibrary={
            onOpenTemplates
              ? () => {
                  setPickerOpen(false);
                  onOpenTemplates();
                }
              : undefined
          }
        />
      )}

      {textEdit && (
        <Modal
          title={textEdit.note ? t('canvas.tool.note') : t('canvas.tool.text')}
          onClose={() => setTextEdit(null)}
          footer={
            <>
              <button type="button" class="btn" onClick={() => setTextEdit(null)}>
                {t('projects.cancel')}
              </button>
              <button type="button" class="btn btn-primary" onClick={saveText}>
                {textEdit.mode === 'edit' ? t('canvas.save') : t('common.add')}
              </button>
            </>
          }
        >
          <label class="field-label" for="canvas-text">
            {t('canvas.prompt.text')}
          </label>
          <textarea
            id="canvas-text"
            class="input textarea"
            autofocus
            value={textValue}
            onInput={(event) => setTextValue((event.target as HTMLTextAreaElement).value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') saveText();
            }}
          />
        </Modal>
      )}

      {searchOpen && (
        <Modal
          title={t('canvas.search')}
          onClose={() => setSearchOpen(false)}
          footer={
            <button type="button" class="btn" onClick={() => setSearchOpen(false)}>
              {t('projects.cancel')}
            </button>
          }
        >
          <input
            ref={searchInputRef}
            class="input"
            autofocus
            placeholder={t('canvas.searchPlaceholder')}
            value={searchQuery}
            onInput={(event) => setSearchQuery((event.target as HTMLInputElement).value)}
          />
          <div class="search-list" style={{ marginTop: '10px' }}>
            {searchMatches.length === 0 && (
              <div class="muted" style={{ fontSize: '12.5px' }}>
                {t('canvas.searchEmpty')}
              </div>
            )}
            {searchMatches.map((match) => (
              <div
                class="search-item"
                key={match.id}
                onClick={() => {
                  if (match.type === 'device') {
                    setSelection([match.id]);
                    setSelectedLinkId(null);
                    setSelectedAnnotationId(null);
                  } else {
                    setSelectedLinkId(match.id);
                    setSelectedAnnotationId(null);
                    setSelection([]);
                  }
                  setSearchOpen(false);
                }}
              >
                <span class={`badge ${match.type === 'device' ? 'badge-neutral' : 'badge-warn'}`}>
                  {match.type === 'device' ? t('canvas.type.device') : t('canvas.type.link')}
                </span>
                <span>{match.name}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
