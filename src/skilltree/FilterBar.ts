import Phaser from 'phaser';
import type { NodeDef } from './types';
import { CENTER_W, RCOL, REGIONS } from './constants';

const CHIP_H = 28;
const ROW1_Y = 6;
const ROW2_Y = 42;
const SORT_LABELS = ['Recommended', 'Cost', 'Name'];

export class FilterBar {
  filterRegion = '';
  filterTier = '';
  sortMode = 0;
  searchText = '';
  searchActive = false;
  showMinor = false;

  private scene: Phaser.Scene;
  private onRefresh: () => void;

  private regionChips: { val: string; bg: Phaser.GameObjects.Rectangle; lbl: Phaser.GameObjects.Text }[] = [];
  private tierChips: { val: string; bg: Phaser.GameObjects.Rectangle; lbl: Phaser.GameObjects.Text }[] = [];
  private sortLbl!: Phaser.GameObjects.Text;
  private searchBg!: Phaser.GameObjects.Rectangle;
  private searchLbl!: Phaser.GameObjects.Text;
  private minorBg!: Phaser.GameObjects.Rectangle;
  private minorLbl!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, onRefresh: () => void) {
    this.scene = scene;
    this.onRefresh = onRefresh;
  }

  create(parentContainer: Phaser.GameObjects.Container) {
    const s = this.scene;
    const bg = s.add.rectangle(0, 0, CENTER_W, 88, 0x101018, 0.95).setOrigin(0, 0);
    const divider = s.add.rectangle(0, 88 - 1, CENTER_W, 1, 0x333333, 0.5).setOrigin(0, 0);
    parentContainer.add([bg, divider]);

    // ── Row 1: Region chips ──
    let x = 10;
    const regionOpts = [{ val: '', label: 'All' }, ...REGIONS.map(r => ({ val: r, label: r }))];
    for (const opt of regionOpts) {
      const w = opt.val === '' ? 42 : 50;
      const cbg = s.add.rectangle(x, ROW1_Y, w, CHIP_H, 0x1a1a28, 0.9).setOrigin(0, 0).setStrokeStyle(1, 0x333333);
      const clbl = s.add.text(x + w / 2, ROW1_Y + CHIP_H / 2, opt.label, { fontSize: '10px', color: '#666', resolution: 2 }).setOrigin(0.5, 0.5);
      cbg.setInteractive();
      const v = opt.val;
      cbg.on('pointerdown', () => { this.filterRegion = this.filterRegion === v ? '' : v; this._updateChips(); this.onRefresh(); });
      cbg.on('pointerover', () => { if (this.filterRegion !== v) cbg.setStrokeStyle(1, 0x888888); });
      cbg.on('pointerout', () => { if (this.filterRegion !== v) cbg.setStrokeStyle(1, 0x333333); });
      parentContainer.add([cbg, clbl]);
      this.regionChips.push({ val: v, bg: cbg, lbl: clbl });
      x += w + 4;
    }

    // Show Map button (right end of row 1) — handled externally via onToggleMap
    // The caller adds the map button separately since it's not a filter concern

    // ── Row 2: Tier chips + Sort + Search + Minor + Clear ──
    x = 10;
    const tierOpts = [
      { val: '', label: 'All Tiers' },
      { val: 'MAJOR', label: 'Major' },
      { val: 'KEYSTONE', label: 'Keystone' },
      { val: 'STANCE', label: 'Stance' },
    ];
    for (const opt of tierOpts) {
      const w = opt.val === '' ? 62 : 68;
      const cbg = s.add.rectangle(x, ROW2_Y, w, CHIP_H, 0x1a1a28, 0.9).setOrigin(0, 0).setStrokeStyle(1, 0x333333);
      const clbl = s.add.text(x + w / 2, ROW2_Y + CHIP_H / 2, opt.label, { fontSize: '10px', color: '#666', resolution: 2 }).setOrigin(0.5, 0.5);
      cbg.setInteractive();
      const v = opt.val;
      cbg.on('pointerdown', () => { this.filterTier = this.filterTier === v ? '' : v; this._updateChips(); this.onRefresh(); });
      cbg.on('pointerover', () => { if (this.filterTier !== v) cbg.setStrokeStyle(1, 0x888888); });
      cbg.on('pointerout', () => { if (this.filterTier !== v) cbg.setStrokeStyle(1, 0x333333); });
      parentContainer.add([cbg, clbl]);
      this.tierChips.push({ val: v, bg: cbg, lbl: clbl });
      x += w + 4;
    }

    x += 12;
    const sortW = 110;
    const sortBg = s.add.rectangle(x, ROW2_Y, sortW, CHIP_H, 0x1a1a28, 0.9).setOrigin(0, 0).setStrokeStyle(1, 0x444444);
    this.sortLbl = s.add.text(x + sortW / 2, ROW2_Y + CHIP_H / 2, `Sort: ${SORT_LABELS[0]}`, { fontSize: '10px', color: '#aaa', resolution: 2 }).setOrigin(0.5, 0.5);
    sortBg.setInteractive();
    sortBg.on('pointerdown', () => { this.sortMode = (this.sortMode + 1) % SORT_LABELS.length; this.sortLbl.setText(`Sort: ${SORT_LABELS[this.sortMode]}`); this.onRefresh(); });
    sortBg.on('pointerover', () => sortBg.setStrokeStyle(1, 0x888888));
    sortBg.on('pointerout', () => sortBg.setStrokeStyle(1, 0x444444));
    parentContainer.add([sortBg, this.sortLbl]);
    x += sortW + 4;

    // Search field
    const searchW = 140;
    this.searchBg = s.add.rectangle(x, ROW2_Y, searchW, CHIP_H, 0x111118, 0.95).setOrigin(0, 0).setStrokeStyle(1, 0x333333);
    this.searchLbl = s.add.text(x + 10, ROW2_Y + CHIP_H / 2, 'Search...', { fontSize: '10px', color: '#555', resolution: 2 }).setOrigin(0, 0.5);
    this.searchBg.setInteractive();
    this.searchBg.on('pointerdown', () => { this.searchActive = !this.searchActive; if (!this.searchActive) this.searchText = ''; this.onRefresh(); this._updateSearchField(); });
    parentContainer.add([this.searchBg, this.searchLbl]);
    x += searchW + 4;

    // Minor toggle
    const minorW = 62;
    this.minorBg = s.add.rectangle(x, ROW2_Y, minorW, CHIP_H, 0x1a1a28, 0.9).setOrigin(0, 0).setStrokeStyle(1, 0x333333);
    this.minorLbl = s.add.text(x + minorW / 2, ROW2_Y + CHIP_H / 2, 'Minor', { fontSize: '10px', color: '#666', resolution: 2 }).setOrigin(0.5, 0.5);
    this.minorBg.setInteractive();
    this.minorBg.on('pointerdown', () => { this.showMinor = !this.showMinor; this._updateMinorChip(); this.onRefresh(); });
    this.minorBg.on('pointerover', () => { if (!this.showMinor) this.minorBg.setStrokeStyle(1, 0x888888); });
    this.minorBg.on('pointerout', () => { if (!this.showMinor) this.minorBg.setStrokeStyle(1, 0x333333); });
    parentContainer.add([this.minorBg, this.minorLbl]);
    x += minorW + 4;

    // Clear all filters
    const clearW = 52;
    const clearBg = s.add.rectangle(x, ROW2_Y, clearW, CHIP_H, 0x1a1a28, 0.9).setOrigin(0, 0).setStrokeStyle(1, 0x333333);
    const clearLbl = s.add.text(x + clearW / 2, ROW2_Y + CHIP_H / 2, 'Clear', { fontSize: '10px', color: '#666', resolution: 2 }).setOrigin(0.5, 0.5);
    clearBg.setInteractive();
    clearBg.on('pointerdown', () => this.clearAll());
    clearBg.on('pointerover', () => clearBg.setStrokeStyle(1, 0xaa4444));
    clearBg.on('pointerout', () => clearBg.setStrokeStyle(1, 0x333333));
    parentContainer.add([clearBg, clearLbl]);

    this._updateChips();
    this._updateMinorChip();
  }

  matches(def: NodeDef): boolean {
    if (this.searchText && !def.name.toLowerCase().includes(this.searchText)) return false;
    if (this.filterRegion && def.region !== this.filterRegion) return false;
    if (this.filterTier && def.tier !== this.filterTier) return false;
    return true;
  }

  clearAll() {
    this.filterRegion = ''; this.filterTier = ''; this.sortMode = 0;
    this.searchText = ''; this.searchActive = false; this.showMinor = false;
    this.sortLbl.setText(`Sort: ${SORT_LABELS[0]}`);
    this._updateChips(); this._updateSearchField(); this._updateMinorChip(); this.onRefresh();
  }

  handleKeydown(e: KeyboardEvent) {
    if (!this.searchActive) return;
    if (e.key === 'Backspace') { this.searchText = this.searchText.slice(0, -1); this.onRefresh(); this._updateSearchField(); }
    else if (e.key.length === 1 && /[a-zA-Z0-9 ]/.test(e.key)) { this.searchText += e.key.toLowerCase(); this.onRefresh(); this._updateSearchField(); }
  }

  dismissSearch() {
    this.searchActive = false; this.searchText = ''; this.onRefresh(); this._updateSearchField();
  }

  resetForReentry() {
    this.regionChips = [];
    this.tierChips = [];
  }

  private _updateChips() {
    for (const chip of this.regionChips) {
      const active = this.filterRegion === chip.val;
      const rc = RCOL[chip.val] ?? 0x888888;
      if (active) {
        chip.bg.setFillStyle(chip.val === '' ? 0x333344 : rc, chip.val === '' ? 0.9 : 0.25);
        chip.bg.setStrokeStyle(2, chip.val === '' ? 0x8888cc : rc);
        chip.lbl.setColor(chip.val === '' ? '#aabbff' : '#fff');
      } else {
        chip.bg.setFillStyle(0x1a1a28, 0.9);
        chip.bg.setStrokeStyle(1, 0x333333);
        chip.lbl.setColor('#666');
      }
    }
    for (const chip of this.tierChips) {
      const active = this.filterTier === chip.val;
      const tc: Record<string, number> = { '': 0x8888cc, MAJOR: 0x5588aa, KEYSTONE: 0xaa8833, STANCE: 0xccaa33 };
      const c = tc[chip.val] ?? 0x888888;
      if (active) {
        chip.bg.setFillStyle(chip.val === '' ? 0x333344 : c, chip.val === '' ? 0.9 : 0.25);
        chip.bg.setStrokeStyle(2, c);
        chip.lbl.setColor('#fff');
      } else {
        chip.bg.setFillStyle(0x1a1a28, 0.9);
        chip.bg.setStrokeStyle(1, 0x333333);
        chip.lbl.setColor('#666');
      }
    }
  }

  private _updateSearchField() {
    if (this.searchActive) {
      this.searchBg.setStrokeStyle(1, 0x5588cc);
      this.searchLbl.setText(this.searchText ? this.searchText + '_' : '_');
      this.searchLbl.setColor('#ddd');
    } else {
      this.searchBg.setStrokeStyle(1, 0x333333);
      this.searchLbl.setText('Search...');
      this.searchLbl.setColor('#555');
    }
  }

  private _updateMinorChip() {
    if (this.showMinor) {
      this.minorBg.setFillStyle(0x1a2828, 0.9);
      this.minorBg.setStrokeStyle(2, 0x44aa66);
      this.minorLbl.setColor('#44aa66');
    } else {
      this.minorBg.setFillStyle(0x1a1a28, 0.9);
      this.minorBg.setStrokeStyle(1, 0x333333);
      this.minorLbl.setColor('#666');
    }
  }
}
