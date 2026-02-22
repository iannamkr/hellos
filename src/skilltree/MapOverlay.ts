import Phaser from 'phaser';
import type { NodeDef, NodeState } from './types';
import type { Allocator } from './allocator';
import type { NodePos } from './layout';
import { SCREEN_H, WORLD, HALF, ZOOM_MIN, ZOOM_MAX, DEFAULT_SP, RCOL, nRad } from './constants';

export class MapOverlay {
  mapCam!: Phaser.Cameras.Scene2D.Camera;
  worldC!: Phaser.GameObjects.Container;
  visible = false;

  private scene: Phaser.Scene;
  private nodeMap: Map<string, NodeDef>;
  private positions: Map<string, NodePos>;
  private allEdges: { a: string; b: string }[];
  private treeRegions: { id: number; code: string; name: string }[];
  private allocator: Allocator;

  private mapOverC!: Phaser.GameObjects.Container;
  private edgeGfx!: Phaser.GameObjects.Graphics;
  private nodeG = new Map<string, Phaser.GameObjects.Graphics>();
  private nodeL = new Map<string, Phaser.GameObjects.Text>();
  private spLbl!: Phaser.GameObjects.Text;

  private dragActive = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragX = 0;
  private dragY = 0;

  constructor(
    scene: Phaser.Scene,
    data: {
      nodeMap: Map<string, NodeDef>;
      positions: Map<string, NodePos>;
      allEdges: { a: string; b: string }[];
      treeRegions: { id: number; code: string; name: string }[];
      allocator: Allocator;
    },
  ) {
    this.scene = scene;
    this.nodeMap = data.nodeMap;
    this.positions = data.positions;
    this.allEdges = data.allEdges;
    this.treeRegions = data.treeRegions;
    this.allocator = data.allocator;
  }

  createCam() {
    this.mapCam = this.scene.cameras.add(80, 40, 1760, 1000);
    this.mapCam.setBounds(-HALF, -HALF, WORLD, WORLD);
    this.mapCam.setZoom(0.32);
    this.mapCam.centerOn(0, 0);
    this.mapCam.setBackgroundColor(0x08080c);
    this.mapCam.visible = false;
  }

  createWorld() {
    const s = this.scene;
    this.worldC = s.add.container(0, 0).setDepth(1);
    this.edgeGfx = s.add.graphics();
    this.worldC.add(this.edgeGfx);

    for (const r of this.treeRegions) {
      const angle = ((r.id - 1) / 8) * Math.PI * 2;
      const rad = 400;
      const t = s.add.text(Math.cos(angle) * rad, Math.sin(angle) * rad, `${r.code}\n${r.name}`, {
        fontSize: '14px', color: `#${(RCOL[r.code] ?? 0x888888).toString(16).padStart(6, '0')}`,
        align: 'center', resolution: 2,
      }).setOrigin(0.5).setAlpha(0.3);
      this.worldC.add(t);
    }

    for (const [id, def] of this.nodeMap) {
      const p = this.positions.get(id);
      if (!p) continue;
      const g = s.add.graphics().setPosition(p.x, p.y);
      this.nodeG.set(id, g);
      this.worldC.add(g);
      const label = s.add.text(p.x, p.y + nRad(def.tier) + 10, def.name, {
        fontSize: '10px', color: '#666', align: 'center', resolution: 2,
      }).setOrigin(0.5, 0);
      this.nodeL.set(id, label);
      this.worldC.add(label);
    }
  }

  createOverlay(onToggle: () => void) {
    const s = this.scene;
    this.mapOverC = s.add.container(0, 0).setDepth(5000).setVisible(false);
    const dimmer = s.add.rectangle(0, 0, 1920, SCREEN_H, 0x000000, 0.7).setOrigin(0, 0);
    this.mapOverC.add(dimmer);

    const cls = s.add.rectangle(1920 - 60, 10, 50, 30, 0x444444, 0.9).setOrigin(0, 0).setStrokeStyle(1, 0x888888);
    cls.setInteractive();
    cls.on('pointerdown', onToggle);
    const clsLbl = s.add.text(1920 - 35, 17, 'X', { fontSize: '14px', color: '#fff', resolution: 2 }).setOrigin(0.5, 0);
    this.mapOverC.add([cls, clsLbl]);

    this.spLbl = s.add.text(100, 15, '', { fontSize: '14px', color: '#ffcc33', resolution: 2 });
    this.mapOverC.add(this.spLbl);

    const hint = s.add.text(960, SCREEN_H - 30, 'Click node to select  |  Drag to pan  |  Scroll to zoom  |  ESC to close', {
      fontSize: '11px', color: '#888', resolution: 2,
    }).setOrigin(0.5, 0);
    this.mapOverC.add(hint);
  }

  drawNodes(selected: string | null) {
    for (const [id, g] of this.nodeG) {
      const def = this.nodeMap.get(id);
      if (!g || !def) continue;
      const st = this.allocator.getNodeState(id);
      const r = nRad(def.tier);
      const rc = RCOL[def.region] ?? 0xaaaaaa;
      g.clear();
      if (def.tier === 'START') {
        g.fillStyle(st === 'allocated' ? 0xffffff : 0x555555, 1);
        this._star(g, 0, 0, r, r * 0.5, 8);
        g.lineStyle(2, 0xffffff, 0.5); g.strokeCircle(0, 0, r + 4);
        continue;
      }
      const fills: Record<NodeState, [number, number]> = {
        allocated: [rc, 1], allocatable: [0x1a1a1a, 1], reachable: [0x1a1a1a, 1], locked: [0x111111, 1],
      };
      g.fillStyle(...fills[st]); g.fillCircle(0, 0, r);
      if (st === 'allocated') { g.lineStyle(2, rc, 0.4); g.strokeCircle(0, 0, r + 3); }
      else if (st === 'allocatable') { g.lineStyle(2, rc, 0.8); g.strokeCircle(0, 0, r); }
      else { g.lineStyle(1, 0x333333, 0.3); g.strokeCircle(0, 0, r); }
      if (id === selected) { g.lineStyle(2, 0xffcc33, 0.9); g.strokeCircle(0, 0, r + 6); }
    }
  }

  drawEdges() {
    const g = this.edgeGfx; g.clear();
    const seen = new Set<string>();
    for (const e of this.allEdges) {
      const k = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
      if (seen.has(k)) continue; seen.add(k);
      const p1 = this.positions.get(e.a), p2 = this.positions.get(e.b);
      if (!p1 || !p2) continue;
      const both = this.allocator.allocated.has(e.a) && this.allocator.allocated.has(e.b);
      g.lineStyle(both ? 2.5 : 1, both ? (RCOL[this.nodeMap.get(e.a)?.region ?? 'HUB'] ?? 0x888888) : 0x2a2a2a, both ? 0.55 : 0.35);
      g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.strokePath();
    }
  }

  toggle(selected: string | null) {
    this.visible = !this.visible;
    this.mapOverC.setVisible(this.visible);
    this.mapCam.visible = this.visible;
    if (this.visible) {
      this.drawEdges();
      this.drawNodes(selected);
      this.spLbl.setText(`SP: ${this.allocator.skillPoints}/${DEFAULT_SP}`);
    }
    this.dragActive = false;
  }

  showNode(id: string, selected: string | null) {
    const pos = this.positions.get(id);
    if (!pos) return;
    if (!this.visible) {
      this.visible = true;
      this.mapOverC.setVisible(true);
      this.mapCam.visible = true;
      this.drawEdges();
      this.drawNodes(selected);
      this.spLbl.setText(`SP: ${this.allocator.skillPoints}/${DEFAULT_SP}`);
    }
    this.mapCam.centerOn(pos.x, pos.y);
    this.mapCam.setZoom(0.8);
  }

  /** Returns the clicked node ID, or null. */
  handleClick(ptr: Phaser.Input.Pointer): string | null {
    const wp = this.mapCam.getWorldPoint(ptr.x, ptr.y);
    for (const [id] of this.nodeMap) {
      const pos = this.positions.get(id);
      if (!pos) continue;
      const r = nRad(this.nodeMap.get(id)?.tier ?? 'MINOR') + 5;
      if (Phaser.Math.Distance.Between(wp.x, wp.y, pos.x, pos.y) < r / this.mapCam.zoom * 2) {
        return id;
      }
    }
    return null;
  }

  handleWheel(dy: number) {
    const z = this.mapCam.zoom * (dy > 0 ? 0.9 : 1.11);
    this.mapCam.setZoom(Phaser.Math.Clamp(z, ZOOM_MIN, ZOOM_MAX));
  }

  handlePointerDown(ptr: Phaser.Input.Pointer) {
    if (ptr.button !== 0) return;
    this.dragActive = true;
    this.dragStartX = ptr.x; this.dragStartY = ptr.y;
    this.dragX = ptr.x; this.dragY = ptr.y;
  }

  handlePointerMove(ptr: Phaser.Input.Pointer) {
    if (!this.dragActive) return;
    this.mapCam.scrollX -= (ptr.x - this.dragX) / this.mapCam.zoom;
    this.mapCam.scrollY -= (ptr.y - this.dragY) / this.mapCam.zoom;
    this.dragX = ptr.x; this.dragY = ptr.y;
  }

  /** Returns true if it was a click (not drag). */
  handlePointerUp(ptr: Phaser.Input.Pointer): boolean {
    if (!this.dragActive) return false;
    this.dragActive = false;
    return Phaser.Math.Distance.Between(this.dragStartX, this.dragStartY, ptr.x, ptr.y) < 5;
  }

  setupIgnores(mainCam: Phaser.Cameras.Scene2D.Camera, uiContainers: Phaser.GameObjects.GameObject[]) {
    mainCam.ignore(this.worldC);
    this.mapCam.ignore([...uiContainers, this.mapOverC]);
  }

  updateData(data: { nodeMap: Map<string, NodeDef>; positions: Map<string, NodePos>; allEdges: { a: string; b: string }[]; allocator: Allocator }) {
    this.nodeMap = data.nodeMap;
    this.positions = data.positions;
    this.allEdges = data.allEdges;
    this.allocator = data.allocator;
  }

  resetForReentry() {
    this.nodeG.clear();
    this.nodeL.clear();
    this.visible = false;
    this.dragActive = false;
  }

  destroyWorld() {
    this.worldC.destroy();
    this.nodeG.clear();
    this.nodeL.clear();
  }

  private _star(g: Phaser.GameObjects.Graphics, cx: number, cy: number, ro: number, ri: number, n: number) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 === 0 ? ro : ri;
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      i === 0 ? g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
              : g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath(); g.fillPath();
  }
}
