import Phaser from 'phaser';
import rawData from './skill_tree.json';
import type { SkillTreeJson, NodeDef, TreeMode } from './types';
import { buildAdjacency, type AdjMap, validateTree, bfs } from './graph';
import { Allocator } from './allocator';
import { EffectRegistry, StatAccumulator, ConcentrationManager, RuleRegistry } from './effects';
import { calculateEnumeratedLayout, calculateGeneratedLayout, type NodePos } from './layout';
import { generateTree } from './generator';
import { saveTree, loadTree, clearTree, exportBuild, importBuild } from './persistence';
import { FilterBar } from './FilterBar';
import { MapOverlay } from './MapOverlay';
import {
  SCREEN_H, LEFT_W, CENTER_W, RIGHT_W, CENTER_X, RIGHT_X,
  CARD_PAD, CARD_GAP, CARD_COLS, CARD_W, CARD_H, FILTER_H, PCARD_H, MAX_VISIBLE, MAX_UTILITY,
  DEFAULT_SP, DEFAULT_SEED,
  RCOL, CARD_BG, TIER_PRI, REGIONS,
  type CardEntry,
} from './constants';

// ═══════════════════════════════════════════════════════════════════
export class SkillTreeScene extends Phaser.Scene {
  // ── data ──
  private treeData!: SkillTreeJson;
  private adj!: AdjMap;
  private nodeMap!: Map<string, NodeDef>;
  private allEdges!: { a: string; b: string }[];
  private allocator!: Allocator;
  private effects!: EffectRegistry;
  private stats!: StatAccumulator;
  private concentration!: ConcentrationManager;
  private ruleReg!: RuleRegistry;
  private positions!: Map<string, NodePos>;
  private mode: TreeMode = 'enumerated';
  private seed = DEFAULT_SEED;

  // ── map overlay ──
  private map!: MapOverlay;

  // ── containers ──
  private bgC!: Phaser.GameObjects.Container;
  private leftC!: Phaser.GameObjects.Container;
  private filterC!: Phaser.GameObjects.Container;
  private cardsC!: Phaser.GameObjects.Container;
  private rightC!: Phaser.GameObjects.Container;

  // ── dynamic arrays ──
  private leftDyn: Phaser.GameObjects.GameObject[] = [];
  private cardsDyn: Phaser.GameObjects.GameObject[] = [];
  private rightDyn: Phaser.GameObjects.GameObject[] = [];

  // ── right pre-created buttons ──
  private allocBg!: Phaser.GameObjects.Rectangle;
  private allocLbl!: Phaser.GameObjects.Text;
  private refundBg!: Phaser.GameObjects.Rectangle;
  private refundLbl!: Phaser.GameObjects.Text;

  // ── left pre-created elements ──
  private stanceBtns: { nodeId: string; bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; cdText: Phaser.GameObjects.Text }[] = [];
  private lAllocBg!: Phaser.GameObjects.Rectangle;
  private lAllocLbl!: Phaser.GameObjects.Text;
  private lMapBg!: Phaser.GameObjects.Rectangle;
  private lMapLbl!: Phaser.GameObjects.Text;
  private lPinBg!: Phaser.GameObjects.Rectangle;
  private lPinLbl!: Phaser.GameObjects.Text;

  // ── ui state ──
  private selected: string | null = null;
  private pinned = false;
  private newNodes = new Set<string>();
  private cardScrollY = 0;
  private cardContentH = 0;
  private leftScrollY = 0;
  private leftContentH = 800;
  private rightScrollY = 0;
  private rightContentH = 800;

  // ── filters ──
  private filterBar!: FilterBar;
  private showAllCards = false;
  private utilityExpanded = false;

  // ── cached card data ──
  private _mainCards: CardEntry[] = [];
  private _utilityCards: CardEntry[] = [];
  private _allMainCount = 0;

  constructor() { super({ key: 'SkillTreeScene' }); }

  // ═══════════════════════════════════════════════════════════════
  create() {
    // Reset instance state for re-entry (Phaser reuses the scene instance)
    this.stanceBtns = [];
    this.leftDyn = [];
    this.cardsDyn = [];
    this.rightDyn = [];
    this.newNodes.clear();
    this.selected = null;
    this.pinned = false;
    this.cardScrollY = 0;
    this.leftScrollY = 0;
    this.rightScrollY = 0;

    this.input.mouse?.disableContextMenu();
    this._buildData();
    this._initMap();
    this._setupCam();
    this._createPanels();
    this._createFilterBar();
    this._createRightFixed();
    this._createLeftFixed();
    this.map.createWorld();
    this.map.createOverlay(() => this._toggleMap());
    this.map.setupIgnores(this.cameras.main, [this.bgC, this.leftC, this.filterC, this.cardsC, this.rightC]);
    this._loadSave();
    this._refreshAll();

    // Clean up extra camera on scene shutdown so it doesn't block input in other scenes
    this.events.once('shutdown', () => {
      this.cameras.remove(this.map.mapCam, true);
    });
  }

  update() { this._updateStanceCooldown(); }

  // ═══════════════════════════════════════════════════════════════
  // DATA
  // ═══════════════════════════════════════════════════════════════
  private _buildData() {
    this.treeData = rawData as unknown as SkillTreeJson;
    let nodes = this.treeData.nodes;
    let edges = this.treeData.edges;
    if (this.mode === 'generated') {
      const gen = generateTree(this.treeData, this.seed);
      nodes = gen.nodes; edges = gen.edges;
    }
    this.nodeMap = new Map(nodes.map(n => [n.id, n]));
    this.allEdges = edges;
    this.adj = buildAdjacency(edges);
    for (const n of nodes) { if (!this.adj.has(n.id)) this.adj.set(n.id, new Set()); }
    const ids = new Set(nodes.map(n => n.id));
    validateTree(ids, edges);
    bfs(this.adj, this.treeData.meta.pathing.start_node);
    const ep = calculateEnumeratedLayout(nodes);
    this.positions = this.mode === 'generated' ? calculateGeneratedLayout(nodes, ep) : ep;
    this.allocator = new Allocator(this.adj, this.nodeMap, this.treeData.meta.pathing.start_node, DEFAULT_SP);
    this.effects = new EffectRegistry();
    this.stats = new StatAccumulator();
    const cdMs = this.treeData.meta.skill_system?.switch_cooldown_ms ?? 1500;
    this.concentration = new ConcentrationManager(cdMs);
    this.ruleReg = new RuleRegistry(this.concentration);
  }

  private _initMap() {
    this.map = new MapOverlay(this, {
      nodeMap: this.nodeMap,
      positions: this.positions,
      allEdges: this.allEdges,
      treeRegions: this.treeData.regions,
      allocator: this.allocator,
    });
    this.map.createCam();
  }

  // ═══════════════════════════════════════════════════════════════
  // CAMERAS & INPUT
  // ═══════════════════════════════════════════════════════════════
  private _setupCam() {
    const cam = this.cameras.main;
    cam.setBackgroundColor(0x08080c);

    this.input.on('wheel', (_p: any, _o: any, _dx: number, dy: number) => {
      if (this.map.visible) { this.map.handleWheel(dy); return; }
      const px = this.input.activePointer.x;
      if (px < LEFT_W) {
        this.leftScrollY = Phaser.Math.Clamp(this.leftScrollY + dy * 0.5, 0, Math.max(0, this.leftContentH - SCREEN_H + 40));
        this.leftC.setY(-this.leftScrollY);
      } else if (px < RIGHT_X) {
        this.cardScrollY = Phaser.Math.Clamp(this.cardScrollY + dy * 0.5, 0, Math.max(0, this.cardContentH - SCREEN_H + FILTER_H + 40));
        this.cardsC.setY(FILTER_H - this.cardScrollY);
      } else {
        this.rightScrollY = Phaser.Math.Clamp(this.rightScrollY + dy * 0.5, 0, Math.max(0, this.rightContentH - SCREEN_H + 40));
        this.rightC.setY(-this.rightScrollY);
      }
    });

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (!this.map.visible) return;
      this.map.handlePointerDown(ptr);
    });
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!this.map.visible) return;
      this.map.handlePointerMove(ptr);
    });
    this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      if (this.map.visible && this.map.handlePointerUp(ptr)) {
        const id = this.map.handleClick(ptr);
        if (id) { this._selectNode(id); this._toggleMap(); }
      }
    });

    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.map.visible) { this._toggleMap(); return; }
      if (this.filterBar.searchActive) { this.filterBar.dismissSearch(); return; }
      this._saveState(); this.scene.start('BuildScene');
    });

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.filterBar.handleKeydown(e));

    for (let k = 1; k <= 6; k++) {
      const i = k - 1;
      this.input.keyboard!.on(`keydown-${k}`, () => { if (!this.filterBar.searchActive) this._onStanceBtnClick(i); });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PANELS
  // ═══════════════════════════════════════════════════════════════
  private _createPanels() {
    this.bgC = this.add.container(0, 0).setDepth(0);
    const lb = this.add.rectangle(0, 0, LEFT_W, SCREEN_H, 0x0a0a0f, 1).setOrigin(0, 0);
    const cb = this.add.rectangle(CENTER_X, 0, CENTER_W, SCREEN_H, 0x0c0c12, 1).setOrigin(0, 0);
    const rb = this.add.rectangle(RIGHT_X, 0, RIGHT_W, SCREEN_H, 0x0a0a0f, 1).setOrigin(0, 0);
    const d1 = this.add.rectangle(LEFT_W, 0, 2, SCREEN_H, 0x222222, 1).setOrigin(0, 0);
    const d2 = this.add.rectangle(RIGHT_X, 0, 2, SCREEN_H, 0x222222, 1).setOrigin(0, 0);
    this.bgC.add([lb, cb, rb, d1, d2]);

    this.leftC = this.add.container(0, 0).setDepth(100);
    this.cardsC = this.add.container(CENTER_X, FILTER_H).setDepth(100);
    this.rightC = this.add.container(RIGHT_X, 0).setDepth(100);
  }

  // ═══════════════════════════════════════════════════════════════
  // FILTER BAR (2-row chip layout)
  // ═══════════════════════════════════════════════════════════════
  private _createFilterBar() {
    this.filterC = this.add.container(CENTER_X, 0).setDepth(200);
    this.filterBar = new FilterBar(this, () => this._refreshAll());
    this.filterBar.create(this.filterC);

    // Show Map button (right end of row 1) — not a filter concern, stays here
    const CHIP_H = 28;
    const ROW1_Y = 6;
    const mBg = this.add.rectangle(CENTER_W - 100, ROW1_Y, 90, CHIP_H, 0x1a1a30, 0.9).setOrigin(0, 0).setStrokeStyle(1, 0x5555aa);
    const mLbl = this.add.text(CENTER_W - 55, ROW1_Y + CHIP_H / 2, 'Show Map', { fontSize: '10px', color: '#aabbff', resolution: 2 }).setOrigin(0.5, 0.5);
    mBg.setInteractive();
    mBg.on('pointerdown', () => this._toggleMap());
    mBg.on('pointerover', () => mBg.setFillStyle(0x2a2a44, 1));
    mBg.on('pointerout', () => mBg.setFillStyle(0x1a1a30, 0.9));
    this.filterC.add([mBg, mLbl]);
  }

  // ═══════════════════════════════════════════════════════════════
  // RIGHT FIXED
  // ═══════════════════════════════════════════════════════════════
  private _createRightFixed() {
    this.allocBg = this.add.rectangle(0, 0, RIGHT_W - 40, 38, 0x226633, 0.9)
      .setOrigin(0, 0).setStrokeStyle(2, 0x44aa66).setVisible(false);
    this.allocBg.setInteractive();
    this.allocBg.on('pointerdown', () => { if (this.selected) this._allocateNode(this.selected); });
    this.allocBg.on('pointerover', () => this.allocBg.setFillStyle(0x338844, 1));
    this.allocBg.on('pointerout', () => this.allocBg.setFillStyle(0x226633, 0.9));
    this.allocLbl = this.add.text(0, 0, 'ALLOCATE', { fontSize: '14px', color: '#fff', fontStyle: 'bold', resolution: 2 })
      .setOrigin(0.5, 0.5).setVisible(false);
    this.rightC.add([this.allocBg, this.allocLbl]);

    this.refundBg = this.add.rectangle(0, 0, RIGHT_W - 40, 32, 0x662233, 0.85)
      .setOrigin(0, 0).setStrokeStyle(1, 0x555555).setVisible(false);
    this.refundBg.setInteractive();
    this.refundBg.on('pointerdown', () => { if (this.selected) this._refundNode(this.selected); });
    this.refundBg.on('pointerover', () => this.refundBg.setFillStyle(0x883344, 1));
    this.refundBg.on('pointerout', () => this.refundBg.setFillStyle(0x662233, 0.85));
    this.refundLbl = this.add.text(0, 0, 'Refund', { fontSize: '12px', color: '#ddd', resolution: 2 })
      .setOrigin(0.5, 0.5).setVisible(false);
    this.rightC.add([this.refundBg, this.refundLbl]);
  }

  // ═══════════════════════════════════════════════════════════════
  // LEFT FIXED
  // ═══════════════════════════════════════════════════════════════
  private _createLeftFixed() {
    for (let i = 0; i < 6; i++) {
      const sbg = this.add.rectangle(0, 0, LEFT_W - 32, 28, 0x1a1a22, 0.9)
        .setOrigin(0, 0).setStrokeStyle(1, 0x444444).setVisible(false);
      const slbl = this.add.text(0, 0, '', { fontSize: '11px', color: '#ccc', resolution: 2 }).setVisible(false);
      const scd = this.add.text(0, 0, '', { fontSize: '9px', color: '#ff9944', resolution: 2 }).setVisible(false);
      sbg.setInteractive();
      const idx = i;
      sbg.on('pointerdown', () => this._onStanceBtnClick(idx));
      this.leftC.add([sbg, slbl, scd]);
      this.stanceBtns.push({ nodeId: '', bg: sbg, label: slbl, cdText: scd });
    }

    // Quick action: Allocate
    this.lAllocBg = this.add.rectangle(0, 0, 150, 30, 0x226633, 0.9)
      .setOrigin(0, 0).setStrokeStyle(1, 0x44aa66).setVisible(false);
    this.lAllocBg.setInteractive();
    this.lAllocBg.on('pointerdown', () => { if (this.selected) this._allocateNode(this.selected); });
    this.lAllocBg.on('pointerover', () => this.lAllocBg.setFillStyle(0x338844, 1));
    this.lAllocBg.on('pointerout', () => this.lAllocBg.setFillStyle(0x226633, 0.9));
    this.lAllocLbl = this.add.text(0, 0, 'Allocate', { fontSize: '11px', color: '#fff', fontStyle: 'bold', resolution: 2 })
      .setOrigin(0.5, 0.5).setVisible(false);
    this.leftC.add([this.lAllocBg, this.lAllocLbl]);

    // Quick action: Pin/Unpin
    this.lPinBg = this.add.rectangle(0, 0, 70, 30, 0x1a1a28, 0.85)
      .setOrigin(0, 0).setStrokeStyle(1, 0x444444).setVisible(false);
    this.lPinBg.setInteractive();
    this.lPinBg.on('pointerdown', () => { this.pinned = !this.pinned; this._refreshLeft(); });
    this.lPinLbl = this.add.text(0, 0, 'Pin', { fontSize: '10px', color: '#aaa', resolution: 2 })
      .setOrigin(0.5, 0.5).setVisible(false);
    this.leftC.add([this.lPinBg, this.lPinLbl]);

    // Quick action: Show in Map
    this.lMapBg = this.add.rectangle(0, 0, 110, 30, 0x222244, 0.85)
      .setOrigin(0, 0).setStrokeStyle(1, 0x5555aa).setVisible(false);
    this.lMapBg.setInteractive();
    this.lMapBg.on('pointerdown', () => { if (this.selected) this._showInMap(this.selected); });
    this.lMapLbl = this.add.text(0, 0, 'Show in Map', { fontSize: '10px', color: '#aabbff', resolution: 2 })
      .setOrigin(0.5, 0.5).setVisible(false);
    this.leftC.add([this.lMapBg, this.lMapLbl]);

    // Export/Import (near bottom)
    const expBg = this.add.rectangle(16, SCREEN_H - 60, 120, 28, 0x1a1a28, 0.9).setOrigin(0, 0).setStrokeStyle(1, 0x444444);
    const expLbl = this.add.text(76, SCREEN_H - 52, 'Export', { fontSize: '11px', color: '#aaa', resolution: 2 }).setOrigin(0.5, 0);
    expBg.setInteractive();
    expBg.on('pointerdown', () => this._exportBuild());
    this.leftC.add([expBg, expLbl]);

    const impBg = this.add.rectangle(148, SCREEN_H - 60, 120, 28, 0x1a1a28, 0.9).setOrigin(0, 0).setStrokeStyle(1, 0x444444);
    const impLbl = this.add.text(208, SCREEN_H - 52, 'Import', { fontSize: '11px', color: '#aaa', resolution: 2 }).setOrigin(0.5, 0);
    impBg.setInteractive();
    impBg.on('pointerdown', () => this._importBuildFromClipboard());
    this.leftC.add([impBg, impLbl]);
  }

  // ═══════════════════════════════════════════════════════════════
  // MAP WRAPPERS
  // ═══════════════════════════════════════════════════════════════
  private _toggleMap() { this.map.toggle(this.selected); }
  private _showInMap(id: string) { this.map.showNode(id, this.selected); }

  // ═══════════════════════════════════════════════════════════════
  // REFRESH ALL + CARD COMPUTATION + AUTO-SELECT
  // ═══════════════════════════════════════════════════════════════
  private _refreshAll() {
    this._computeCards();
    this._autoSelect();
    this._refreshLeft();
    this._refreshCenter();
    this._refreshRight();
  }

  private _computeCards() {
    const main: CardEntry[] = [];
    const utility: CardEntry[] = [];
    const minorPool: CardEntry[] = [];
    const activeRegion = this.concentration.activeStanceId ? this.nodeMap.get(this.concentration.activeStanceId)?.region : null;

    for (const [id, def] of this.nodeMap) {
      if (def.tier === 'START') continue;
      const st = this.allocator.getNodeState(id);
      if (st !== 'allocatable') continue;

      if (!this.filterBar.matches(def)) continue;

      const pi = this.allocator.getPathTo(id);
      const cost = pi?.cost ?? 1;
      const tierScore = TIER_PRI[def.tier] ?? 0;
      const regionBonus = activeRegion && def.region === activeRegion ? 5 : 0;
      const costBonus = Math.max(0, 10 - cost);
      const score = tierScore * 10 + regionBonus + costBonus;
      const entry: CardEntry = { id, def, state: st, cost, score, isNew: this.newNodes.has(id) };

      if (def.region === 'HUB' && def.tier === 'MINOR') {
        utility.push(entry);
      } else if (def.tier === 'MINOR' && !this.filterBar.showMinor) {
        minorPool.push(entry);
      } else {
        main.push(entry);
      }
    }

    this._sortCards(main);

    // Backfill from minor pool if main < 8
    if (main.length < 8) {
      this._sortCards(minorPool);
      while (main.length < 8 && minorPool.length > 0) {
        main.push(minorPool.shift()!);
      }
    }

    this._allMainCount = main.length;
    this._mainCards = this.showAllCards ? main : main.slice(0, MAX_VISIBLE);

    this._sortCards(utility);
    this._utilityCards = utility.slice(0, MAX_UTILITY);
  }

  private _sortCards(cards: CardEntry[]) {
    if (this.filterBar.sortMode === 0) cards.sort((a, b) => b.score - a.score || a.cost - b.cost);
    else if (this.filterBar.sortMode === 1) cards.sort((a, b) => a.cost - b.cost);
    else cards.sort((a, b) => a.def.name.localeCompare(b.def.name));
  }

  private _autoSelect() {
    if (this.pinned && this.selected) {
      const inCards = this._mainCards.some(c => c.id === this.selected) || this._utilityCards.some(c => c.id === this.selected);
      const isAllocated = this.allocator.allocated.has(this.selected!);
      if (inCards || isAllocated) return;
      this.pinned = false;
    }

    if (this._mainCards.length > 0) { this.selected = this._mainCards[0].id; return; }
    if (this._utilityCards.length > 0) { this.selected = this._utilityCards[0].id; return; }

    for (const [id, def] of this.nodeMap) {
      if (def.tier === 'START') continue;
      if (this.allocator.getNodeState(id) === 'allocatable') { this.selected = id; return; }
    }
    this.selected = null;
  }

  private _selectNode(id: string) {
    this.selected = id;
    this.pinned = false;
    this._refreshLeft();
    this._refreshCenter();
    this._refreshRight();
  }

  // ═══════════════════════════════════════════════════════════════
  // LEFT PANEL (Decision UI)
  // ═══════════════════════════════════════════════════════════════
  private _refreshLeft() {
    for (const o of this.leftDyn) o.destroy();
    this.leftDyn = [];
    let y = 16;

    // ── SP ──
    this._ltxt(16, y, `SP: ${this.allocator.skillPoints}/${DEFAULT_SP}`, '16px', '#ffcc33');
    y += 30;

    // ── Active Stance ──
    this._lsection(y, 'Active Stance'); y += 22;
    if (this.concentration.activeStanceId) {
      const nd = this.nodeMap.get(this.concentration.activeStanceId);
      this._ltxt(20, y, nd?.name ?? this.concentration.activeStanceId, '13px', '#ffcc33');
      y += 20;
    } else {
      this._ltxt(20, y, 'No stance active', '11px', '#555');
      y += 16;
      if (this.concentration.unlockedStances.size === 0) {
        this._ltxt(20, y, 'STANCE 노드를 찍으면 전투 중 태세 전환 가능', '10px', '#444');
        y += 14;
      }
    }

    const unlocked = [...this.concentration.unlockedStances];
    unlocked.sort((a, b) => REGIONS.indexOf(this.nodeMap.get(a)?.region ?? '') - REGIONS.indexOf(this.nodeMap.get(b)?.region ?? ''));
    for (let i = 0; i < 6; i++) {
      const btn = this.stanceBtns[i];
      if (i < unlocked.length) {
        const nid = unlocked[i]; const nd = this.nodeMap.get(nid);
        btn.nodeId = nid;
        btn.bg.setPosition(16, y).setVisible(true);
        btn.label.setPosition(44, y + 7).setText(`${i + 1}  ${nd?.name ?? nid}`).setVisible(true);
        btn.cdText.setPosition(LEFT_W - 50, y + 9).setVisible(true);
        const isActive = this.concentration.activeStanceId === nid;
        btn.bg.setStrokeStyle(isActive ? 2 : 1, isActive ? 0xffcc33 : 0x444444);
        btn.bg.setFillStyle(isActive ? 0x2a2a18 : 0x1a1a22, 0.9);
        btn.label.setColor(isActive ? '#ffcc33' : '#ccc');
        y += 34;
      } else {
        btn.nodeId = ''; btn.bg.setVisible(false); btn.label.setVisible(false); btn.cdText.setVisible(false);
      }
    }
    y += 8;

    // ── Build Summary ──
    this._lsection(y, 'Build Summary'); y += 22;
    const effLines: { line: string; pri: number; nodeName: string }[] = [];
    for (const id of this.allocator.allocated) {
      const nd = this.nodeMap.get(id);
      if (!nd) continue;
      const p = TIER_PRI[nd.tier] ?? 0;
      if (p <= 0) continue;
      for (const line of nd.effect_lines ?? []) effLines.push({ line, pri: p, nodeName: nd.name });
    }
    effLines.sort((a, b) => b.pri - a.pri);
    if (effLines.length > 0) {
      for (const { line, nodeName } of effLines.slice(0, 6)) {
        this._ltxt(20, y, `${nodeName}: ${line}`, '11px', '#8cb8d0');
        y += 16;
      }
    } else {
      this._ltxt(20, y, 'No major effects yet', '10px', '#444');
      y += 14;
    }
    y += 8;

    // ── Tradeoffs ──
    this._lsection(y, 'Tradeoffs'); y += 22;
    const tradeEntries: { line: string; pri: number }[] = [];
    for (const id of this.allocator.allocated) {
      const nd = this.nodeMap.get(id);
      if (!nd) continue;
      const p = TIER_PRI[nd.tier] ?? 0;
      for (const l of nd.tradeoff_lines ?? []) tradeEntries.push({ line: l, pri: p });
    }
    const seenTrades = new Set<string>();
    const uniqueTrades = tradeEntries.filter(t => { if (seenTrades.has(t.line)) return false; seenTrades.add(t.line); return true; });
    uniqueTrades.sort((a, b) => b.pri - a.pri);
    if (uniqueTrades.length > 0) {
      for (const { line } of uniqueTrades.slice(0, 4)) {
        this._ltxt(20, y, line, '11px', '#cc6666');
        y += 16;
      }
    } else {
      this._ltxt(20, y, 'No tradeoffs active', '10px', '#444');
      y += 14;
    }
    y += 8;

    // ── Recommended Next 3 ──
    this._lsection(y, 'Recommended Next'); y += 22;
    const recs = this._mainCards.slice(0, 3);
    if (recs.length > 0) {
      for (const rec of recs) {
        const rc = RCOL[rec.def.region] ?? 0xaaaaaa;
        const rbg = this.add.rectangle(16, y, LEFT_W - 32, 36, 0x12121a, 0.8).setOrigin(0, 0).setStrokeStyle(1, rc);
        rbg.setInteractive();
        const rid = rec.id;
        rbg.on('pointerdown', () => this._selectNode(rid));
        rbg.on('pointerover', () => rbg.setStrokeStyle(2, 0xffffff));
        rbg.on('pointerout', () => rbg.setStrokeStyle(1, rc));
        this.leftC.add(rbg); this.leftDyn.push(rbg);

        const isTopSel = this.selected === rec.id;
        const nameT = this.add.text(24, y + 4, rec.def.name, { fontSize: '11px', color: isTopSel ? '#ffcc33' : '#ddd', fontStyle: 'bold', resolution: 2 });
        this.leftC.add(nameT); this.leftDyn.push(nameT);

        const rcHex = `#${rc.toString(16).padStart(6, '0')}`;
        const badgeT = this.add.text(LEFT_W - 24, y + 6, `${rec.def.region}/${rec.def.tier}`, { fontSize: '9px', color: rcHex, resolution: 2 }).setOrigin(1, 0);
        this.leftC.add(badgeT); this.leftDyn.push(badgeT);

        const eff = (rec.def.effect_lines ?? [])[0] ?? '';
        if (eff) {
          const effT = this.add.text(24, y + 20, eff, { fontSize: '9px', color: '#8cb8d0', wordWrap: { width: LEFT_W - 60 }, resolution: 2 });
          this.leftC.add(effT); this.leftDyn.push(effT);
        }
        y += 42;
      }
    } else {
      this._ltxt(20, y, 'No picks available', '10px', '#444');
      y += 14;
    }
    y += 8;

    // ── Selected Node Quick Actions ──
    this._lsection(y, 'Quick Actions'); y += 22;
    this.lAllocBg.setVisible(false); this.lAllocLbl.setVisible(false);
    this.lMapBg.setVisible(false); this.lMapLbl.setVisible(false);
    this.lPinBg.setVisible(false); this.lPinLbl.setVisible(false);

    if (this.selected) {
      const def = this.nodeMap.get(this.selected);
      const st = this.allocator.getNodeState(this.selected);
      this._ltxt(20, y, `Selected: ${def?.name ?? this.selected}`, '11px', '#ccc');
      y += 18;

      let bx = 16;
      if (st === 'allocatable') {
        this.lAllocBg.setPosition(bx, y).setVisible(true);
        this.lAllocLbl.setPosition(bx + 75, y + 15).setVisible(true);
        bx += 160;
      }
      this.lPinBg.setPosition(bx, y).setVisible(true);
      this.lPinLbl.setText(this.pinned ? 'Unpin' : 'Pin').setPosition(bx + 35, y + 15).setVisible(true);
      bx += 80;
      this.lMapBg.setPosition(bx, y).setVisible(true);
      this.lMapLbl.setPosition(bx + 55, y + 15).setVisible(true);
      y += 38;
    } else {
      this._ltxt(20, y, 'Auto-selecting top recommendation', '10px', '#444');
      y += 14;
    }
    y += 12;

    this._ltxt(16, y, `Allocated: ${this.allocator.allocated.size} nodes`, '10px', '#555');
    y += 20;

    this.leftContentH = y + 80;
  }

  private _ltxt(x: number, y: number, text: string, size: string, color: string): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, text, { fontSize: size, color, wordWrap: { width: LEFT_W - 36 }, resolution: 2 });
    this.leftC.add(t); this.leftDyn.push(t); return t;
  }

  private _lsection(y: number, label: string) {
    this._ltxt(16, y, label, '12px', '#555');
    const r = this.add.rectangle(16, y + 16, LEFT_W - 32, 1, 0x333333, 0.5).setOrigin(0, 0);
    this.leftC.add(r); this.leftDyn.push(r);
  }

  // ═══════════════════════════════════════════════════════════════
  // CENTER PANEL (Card Grid)
  // ═══════════════════════════════════════════════════════════════
  private _refreshCenter() {
    for (const o of this.cardsDyn) o.destroy();
    this.cardsDyn = [];

    let idx = 0;
    for (const card of this._mainCards) {
      const col = idx % CARD_COLS;
      const row = Math.floor(idx / CARD_COLS);
      const cx = CARD_PAD + col * (CARD_W + CARD_GAP);
      const cy = row * (CARD_H + CARD_GAP);
      this._renderCard(cx, cy, card);
      idx++;
    }

    let bottomY = Math.ceil(this._mainCards.length / CARD_COLS) * (CARD_H + CARD_GAP);

    // "Show All" / "Show Less" toggle
    if (this._allMainCount > MAX_VISIBLE) {
      const saBg = this.add.rectangle(CARD_PAD, bottomY, CENTER_W - CARD_PAD * 2, 32, 0x1a1a28, 0.9).setOrigin(0, 0).setStrokeStyle(1, 0x444444);
      saBg.setInteractive();
      saBg.on('pointerdown', () => { this.showAllCards = !this.showAllCards; this._refreshAll(); });
      const saText = this.showAllCards ? 'Show less' : `Show all ${this._allMainCount} picks`;
      const saLbl = this.add.text(CENTER_W / 2 - CARD_PAD, bottomY + 9, saText, { fontSize: '11px', color: '#aaa', resolution: 2 }).setOrigin(0.5, 0);
      this.cardsC.add([saBg, saLbl]); this.cardsDyn.push(saBg, saLbl);
      bottomY += 40;
    }

    // Utility Picks (HUB Core Links)
    if (this._utilityCards.length > 0) {
      bottomY += 8;
      const uhBg = this.add.rectangle(CARD_PAD, bottomY, CENTER_W - CARD_PAD * 2, 28, 0x111118, 0.9).setOrigin(0, 0);
      uhBg.setInteractive();
      uhBg.on('pointerdown', () => { this.utilityExpanded = !this.utilityExpanded; this._refreshCenter(); });
      const arrow = this.utilityExpanded ? '\u25BC' : '\u25B6';
      const uhLbl = this.add.text(CARD_PAD + 8, bottomY + 6, `${arrow} Utility Picks (${this._utilityCards.length})`, { fontSize: '11px', color: '#666', resolution: 2 });
      this.cardsC.add([uhBg, uhLbl]); this.cardsDyn.push(uhBg, uhLbl);
      bottomY += 32;

      if (this.utilityExpanded) {
        for (const uc of this._utilityCards) {
          const ubg = this.add.rectangle(CARD_PAD, bottomY, CENTER_W - CARD_PAD * 2, 50, CARD_BG[uc.def.region] ?? 0x161620, 0.7)
            .setOrigin(0, 0).setStrokeStyle(1, 0x333333);
          ubg.setInteractive();
          const uid = uc.id;
          ubg.on('pointerdown', () => this._selectNode(uid));
          ubg.on('pointerover', () => ubg.setStrokeStyle(1, 0xaaaaaa));
          ubg.on('pointerout', () => ubg.setStrokeStyle(1, 0x333333));
          this.cardsC.add(ubg); this.cardsDyn.push(ubg);

          const uname = this.add.text(CARD_PAD + 12, bottomY + 8, uc.def.name, { fontSize: '11px', color: '#aaa', fontStyle: 'bold', resolution: 2 });
          this.cardsC.add(uname); this.cardsDyn.push(uname);
          const ueff = (uc.def.effect_lines ?? [])[0] ?? '';
          if (ueff) {
            const uet = this.add.text(CARD_PAD + 12, bottomY + 26, ueff, { fontSize: '9px', color: '#8cb8d0', wordWrap: { width: CENTER_W - CARD_PAD * 2 - 24 }, resolution: 2 });
            this.cardsC.add(uet); this.cardsDyn.push(uet);
          }
          bottomY += 56;
        }
      }
    }

    this.cardContentH = bottomY;
  }

  private _renderCard(x: number, y: number, card: CardEntry) {
    const { id, def, cost, isNew } = card;
    const rc = RCOL[def.region] ?? 0xaaaaaa;
    const bgCol = CARD_BG[def.region] ?? 0x161620;
    const isSelected = this.selected === id;

    const bg = this.add.rectangle(x, y, CARD_W, CARD_H, bgCol, 0.9).setOrigin(0, 0)
      .setStrokeStyle(isSelected ? 2 : 1, isSelected ? 0xffcc33 : rc);
    bg.setInteractive();
    bg.on('pointerdown', () => this._selectNode(id));
    bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffffff));
    bg.on('pointerout', () => bg.setStrokeStyle(isSelected ? 2 : 1, isSelected ? 0xffcc33 : rc));
    this.cardsC.add(bg); this.cardsDyn.push(bg);

    let ty = y + 10;
    // Title (large)
    const title = this.add.text(x + 12, ty, def.name, { fontSize: '14px', color: '#fff', fontStyle: 'bold', resolution: 2 });
    this.cardsC.add(title); this.cardsDyn.push(title);
    ty += 20;

    // Region + Tier badge
    const badge = this.add.text(x + 12, ty, `${def.region} / ${def.tier}`, { fontSize: '10px', color: `#${rc.toString(16).padStart(6, '0')}`, resolution: 2 });
    this.cardsC.add(badge); this.cardsDyn.push(badge);

    if (def.tier === 'STANCE') {
      const sb = this.add.text(x + CARD_W - 12, ty, 'STANCE', { fontSize: '9px', color: '#ffcc33', fontStyle: 'bold', resolution: 2 }).setOrigin(1, 0);
      this.cardsC.add(sb); this.cardsDyn.push(sb);
    }
    if (isNew) {
      const nb = this.add.text(x + CARD_W - 12, y + 10, 'NEW', { fontSize: '9px', color: '#33cc66', fontStyle: 'bold', resolution: 2 }).setOrigin(1, 0);
      this.cardsC.add(nb); this.cardsDyn.push(nb);
    }
    ty += 16;

    // Effect lines: first bold, rest normal
    const effs = (def.effect_lines ?? []).slice(0, 3);
    for (let ei = 0; ei < effs.length; ei++) {
      const et = this.add.text(x + 12, ty, effs[ei], {
        fontSize: ei === 0 ? '11px' : '10px',
        color: '#8cb8d0',
        fontStyle: ei === 0 ? 'bold' : '',
        wordWrap: { width: CARD_W - 24 },
        resolution: 2,
      });
      this.cardsC.add(et); this.cardsDyn.push(et);
      ty += ei === 0 ? 16 : 14;
    }

    // Tradeoff lines (smaller)
    for (const line of (def.tradeoff_lines ?? []).slice(0, 2)) {
      const tt = this.add.text(x + 12, ty, line, { fontSize: '9px', color: '#cc6666', wordWrap: { width: CARD_W - 24 }, resolution: 2 });
      this.cardsC.add(tt); this.cardsDyn.push(tt);
      ty += 12;
    }

    // Footer: cost
    const ft = this.add.text(x + 12, y + CARD_H - 18, `Cost: ${cost} SP`, { fontSize: '9px', color: '#999', resolution: 2 });
    this.cardsC.add(ft); this.cardsDyn.push(ft);
  }

  // ═══════════════════════════════════════════════════════════════
  // RIGHT PANEL (Selection Preview)
  // ═══════════════════════════════════════════════════════════════
  private _refreshRight() {
    for (const o of this.rightDyn) o.destroy();
    this.rightDyn = [];
    this.allocBg.setVisible(false); this.allocLbl.setVisible(false);
    this.refundBg.setVisible(false); this.refundLbl.setVisible(false);

    if (!this.selected) {
      this._rtxt(20, 40, 'All nodes allocated or\nno picks available.', '12px', '#555');
      this.rightContentH = 200;
      return;
    }

    const def = this.nodeMap.get(this.selected);
    if (!def) return;
    const st = this.allocator.getNodeState(this.selected);
    const pi = this.allocator.getPathTo(this.selected);
    let y = 16;

    // Header
    this._rtxt(20, y, def.name, '16px', '#ffffff'); y += 24;
    const rc = RCOL[def.region] ?? 0xaaaaaa;
    this._rtxt(20, y, `${def.region} / ${def.tier}`, '11px', `#${rc.toString(16).padStart(6, '0')}`); y += 18;
    this._rtxt(20, y, st.toUpperCase(), '11px', st === 'allocated' ? '#44cc88' : st === 'allocatable' ? '#cccc44' : '#888'); y += 20;

    // Effects (prominent, first)
    for (const line of def.effect_lines ?? []) { this._rtxt(20, y, line, '11px', '#8cb8d0'); y += 16; }
    // Tradeoffs
    for (const line of def.tradeoff_lines ?? []) { this._rtxt(20, y, line, '11px', '#cc6666'); y += 16; }

    y += 4;
    // Cost + Requires near buttons
    if (pi && !this.allocator.allocated.has(this.selected)) { this._rtxt(20, y, `Path cost: ${pi.cost} SP`, '11px', '#999'); y += 18; }
    if (def.requires.length > 0) {
      const met = def.requires.every(r => this.allocator.allocated.has(r));
      this._rtxt(20, y, `Requires: ${def.requires.join(', ')} ${met ? '\u2713' : '\u2717'}`, '10px', met ? '#44aa66' : '#aa4444');
      y += 16;
    }

    y += 4;
    if (st === 'allocatable') {
      this.allocBg.setPosition(20, y).setVisible(true);
      this.allocLbl.setPosition(20 + (RIGHT_W - 40) / 2, y + 19).setVisible(true);
      y += 46;
    }
    if (st === 'allocated' && this.selected !== this.treeData.meta.pathing.start_node) {
      this.refundBg.setPosition(20, y).setVisible(true);
      this.refundLbl.setPosition(20 + (RIGHT_W - 40) / 2, y + 16).setVisible(true);
      y += 40;
    }

    // Next Unlocked Preview
    const preview = this._getPreviewNodes(this.selected);
    if (preview.length > 0 && !this.allocator.allocated.has(this.selected)) {
      y += 8;
      this._rsection(y, 'Next Unlocked'); y += 22;
      for (const pid of preview.slice(0, 12)) {
        const pdef = this.nodeMap.get(pid);
        if (!pdef) continue;
        this._renderPreviewCard(20, y, pid, pdef);
        y += PCARD_H + 8;
      }
    }

    this.rightContentH = y + 40;
  }

  private _rtxt(x: number, y: number, text: string, size: string, color: string): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, text, { fontSize: size, color, wordWrap: { width: RIGHT_W - 44 }, resolution: 2 });
    this.rightC.add(t); this.rightDyn.push(t); return t;
  }

  private _rsection(y: number, label: string) {
    this._rtxt(20, y, label, '12px', '#555');
    const r = this.add.rectangle(20, y + 16, RIGHT_W - 44, 1, 0x333333, 0.5).setOrigin(0, 0);
    this.rightC.add(r); this.rightDyn.push(r);
  }

  private _renderPreviewCard(x: number, y: number, id: string, def: NodeDef) {
    const rc = RCOL[def.region] ?? 0xaaaaaa;
    const w = RIGHT_W - 40;
    const bg = this.add.rectangle(x, y, w, PCARD_H, CARD_BG[def.region] ?? 0x161620, 0.8).setOrigin(0, 0).setStrokeStyle(1, rc);
    bg.setInteractive();
    bg.on('pointerdown', () => this._selectNode(id));
    bg.on('pointerover', () => bg.setStrokeStyle(2, 0xffffff));
    bg.on('pointerout', () => bg.setStrokeStyle(1, rc));
    this.rightC.add(bg); this.rightDyn.push(bg);

    let ty = y + 8;
    const title = this.add.text(x + 10, ty, def.name, { fontSize: '11px', color: '#ddd', fontStyle: 'bold', resolution: 2 });
    this.rightC.add(title); this.rightDyn.push(title);
    const badge = this.add.text(x + w - 10, ty, `${def.region}/${def.tier}`, { fontSize: '9px', color: `#${rc.toString(16).padStart(6, '0')}`, resolution: 2 }).setOrigin(1, 0);
    this.rightC.add(badge); this.rightDyn.push(badge);
    ty += 16;

    for (const line of (def.effect_lines ?? []).slice(0, 2)) {
      const et = this.add.text(x + 10, ty, line, { fontSize: '9px', color: '#8cb8d0', wordWrap: { width: w - 20 }, resolution: 2 });
      this.rightC.add(et); this.rightDyn.push(et);
      ty += 12;
    }
    for (const line of (def.tradeoff_lines ?? []).slice(0, 1)) {
      const tt = this.add.text(x + 10, ty, line, { fontSize: '9px', color: '#cc6666', wordWrap: { width: w - 20 }, resolution: 2 });
      this.rightC.add(tt); this.rightDyn.push(tt);
      ty += 12;
    }
  }

  private _getPreviewNodes(selectedId: string): string[] {
    if (this.allocator.allocated.has(selectedId)) return [];
    const simAlloc = new Set(this.allocator.allocated);
    const pi = this.allocator.getPathTo(selectedId);
    if (pi) for (const nid of pi.path) simAlloc.add(nid);

    const result: string[] = [];
    for (const [nid, nd] of this.nodeMap) {
      if (simAlloc.has(nid)) continue;
      if (this.allocator.getNodeState(nid) === 'allocatable') continue;
      const neighbors = this.adj.get(nid);
      if (!neighbors || ![...neighbors].some(x => simAlloc.has(x))) continue;
      if (!(nd.requires ?? []).every(r => simAlloc.has(r))) continue;
      result.push(nid);
    }
    result.sort((a, b) => (TIER_PRI[this.nodeMap.get(b)?.tier ?? 'MINOR'] ?? 0) - (TIER_PRI[this.nodeMap.get(a)?.tier ?? 'MINOR'] ?? 0));
    return result.slice(0, 12);
  }

  // ═══════════════════════════════════════════════════════════════
  // INTERACTIONS
  // ═══════════════════════════════════════════════════════════════
  private _applyAllocEffects(id: string) {
    this.effects.apply(id);
    const nd = this.nodeMap.get(id);
    if (nd) {
      this.stats.apply(id, nd.stats);
      this.ruleReg.apply(id, nd.rules, nd.tier === 'STANCE');
      if (nd.tier === 'STANCE') this.concentration.unlock(id);
    }
  }

  private _allocateNode(id: string) {
    if (!this.allocator.canAllocate(id)) return;
    const beforeAlloc = new Set<string>();
    for (const [nid] of this.nodeMap) {
      if (this.allocator.getNodeState(nid) === 'allocatable') beforeAlloc.add(nid);
    }

    const pi = this.allocator.getPathTo(id);
    if (pi && pi.path.length > 1) {
      for (const nid of pi.path) {
        if (this.allocator.allocate(nid)) this._applyAllocEffects(nid);
      }
    } else {
      this.allocator.allocate(id);
      this._applyAllocEffects(id);
    }

    this.newNodes.clear();
    for (const [nid] of this.nodeMap) {
      if (this.allocator.getNodeState(nid) === 'allocatable' && !beforeAlloc.has(nid)) {
        this.newNodes.add(nid);
      }
    }

    this.selected = null;
    this.pinned = false;
    this._refreshAll();
    this._saveState();
  }

  private _refundNode(id: string) {
    const r = this.allocator.refund(id);
    if (r.ok) {
      this.effects.remove(id); this.stats.remove(id); this.ruleReg.remove(id);
      const nd = this.nodeMap.get(id);
      if (nd?.tier === 'STANCE') this.concentration.lock(id);
      this.newNodes.clear();
      this.selected = null;
      this.pinned = false;
      this._refreshAll();
      this._saveState();
    }
  }

  private _onStanceBtnClick(idx: number) {
    const btn = this.stanceBtns[idx];
    if (!btn || !btn.nodeId) return;
    if (this.concentration.activate(btn.nodeId)) {
      this._refreshAll();
      this._saveState();
    }
  }

  private _updateStanceCooldown() {
    const now = Date.now();
    const onCd = this.concentration.isOnCooldown(now);
    for (const btn of this.stanceBtns) {
      if (!btn.bg.visible) continue;
      if (onCd) {
        const rem = (this.concentration.getCooldownRemaining(now) / 1000).toFixed(1);
        btn.cdText.setText(`${rem}s`);
        btn.bg.setAlpha(btn.nodeId === this.concentration.activeStanceId ? 1 : 0.5);
      } else {
        btn.cdText.setText('');
        btn.bg.setAlpha(1);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════
  private _saveState() {
    saveTree({
      treeVersion: this.treeData.meta.version,
      mode: this.mode,
      seed: this.seed,
      remainingSkillPoints: this.allocator.skillPoints,
      allocatedNodeIds: [...this.allocator.allocated],
      lastCamera: { x: this.map.mapCam.scrollX, y: this.map.mapCam.scrollY, zoom: this.map.mapCam.zoom },
      activeStanceId: this.concentration.activeStanceId,
    });
  }

  private _loadSave() {
    const d = loadTree();
    if (!d) return;
    if (d.treeVersion !== this.treeData.meta.version) { clearTree(); return; }
    if (d.mode !== this.mode) {
      this.mode = d.mode;
      this.seed = d.seed;
      this._rebuild();
    }
    const res = Allocator.reconstructOrder(d.allocatedNodeIds, this.adj, this.nodeMap, this.treeData.meta.pathing.start_node);
    for (const id of res.order) {
      this.allocator.allocate(id);
      this._applyAllocEffects(id);
    }
    if (d.activeStanceId && this.concentration.unlockedStances.has(d.activeStanceId)) {
      this.concentration.activeStanceId = d.activeStanceId;
    }
    this.allocator.skillPoints = d.remainingSkillPoints;
    if (d.lastCamera) {
      this.map.mapCam.scrollX = d.lastCamera.x;
      this.map.mapCam.scrollY = d.lastCamera.y;
      this.map.mapCam.setZoom(d.lastCamera.zoom);
    }
    this._refreshAll();
  }

  private _rebuild() {
    this.map.destroyWorld();
    this._buildData();
    this.map.updateData({ nodeMap: this.nodeMap, positions: this.positions, allEdges: this.allEdges, allocator: this.allocator });
    this.map.createWorld();
    this.map.setupIgnores(this.cameras.main, [this.bgC, this.leftC, this.filterC, this.cardsC, this.rightC]);
    this._refreshAll();
  }

  private _exportBuild() {
    const json = exportBuild(this.treeData.meta.version, this.seed, this.mode, [...this.allocator.allocated], this.nodeMap);
    navigator.clipboard?.writeText(json).catch(() => {});
  }

  private _importBuildFromClipboard() {
    const json = window.prompt('Paste build JSON:');
    if (!json) return;
    const res = importBuild(json);
    if (!res.ok || !res.data) return;
    if (res.data.treeVersion !== this.treeData.meta.version) return;

    clearTree();
    this._buildData();
    this.map.updateData({ nodeMap: this.nodeMap, positions: this.positions, allEdges: this.allEdges, allocator: this.allocator });
    this.map.destroyWorld();
    this.map.createWorld();
    this.map.setupIgnores(this.cameras.main, [this.bgC, this.leftC, this.filterC, this.cardsC, this.rightC]);

    const order = Allocator.reconstructOrder(res.data.allocatedNodeIds, this.adj, this.nodeMap, this.treeData.meta.pathing.start_node);
    for (const id of order.order) {
      this.allocator.allocate(id);
      this._applyAllocEffects(id);
    }
    this.selected = null;
    this.pinned = false;
    this._refreshAll();
    this._saveState();
  }
}
