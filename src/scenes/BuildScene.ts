import Phaser from 'phaser';
import type { KeystoneId, SkillId, SupportId, ItemId, ClusterId, NodeId, BuildConfig, Tag } from '../types';
import { KEYSTONES, SKILLS, SUPPORTS, ITEMS, PRESETS, getKeystone, getSkill, getSupport, getItem } from '../data/buildData';
import { CLUSTERS, getNode, getCluster, getBuildTags, isClusterActive, isNodeUnlocked, isMiniKeystoneAvailable } from '../data/treeData';

// ── Layout (1920×1080, safe margin 48) ──
const SAFE = 48;
const GAP = 18;
const DEPTH = 10000;
const FONT = 'Courier New';
const TPAD = { left: 6, top: 4, right: 6, bottom: 4 };
const LSPC = 8;

// Panel rects (offset from safe origin)
const LP = { ox: 32, oy: 60, w: 980, h: 820 };
const RP = { ox: 1040, oy: 60, w: 760, h: 820 };
const BB = { ox: 32, oy: 910, w: 1760, h: 60 };
const SB = { ox: 740, oy: 860, w: 360, h: 56 };

// Section fixed heights (left panel)
const SECT = [120, 120, 120, 150, 140]; // preset, keystone, skill, support, item

function isPresetMatch(
  p: typeof PRESETS[number], ks: KeystoneId, sk: SkillId, sups: SupportId[], it: ItemId,
): boolean {
  return p.build.keystone === ks && p.build.skill === sk &&
    p.build.supports[0] === sups[0] && p.build.supports[1] === sups[1] && p.build.item === it;
}

export class BuildScene extends Phaser.Scene {
  // ── Selection state ──
  private selectedKeystone: KeystoneId = 'closePact';
  private selectedSkill: SkillId = 'slash';
  private selectedSupports: SupportId[] = ['closeShock', 'markStack'];
  private selectedItem: ItemId = 'heavyBlade';
  private selectedClusters: ClusterId[] = [];
  private selectedNodes: NodeId[] = [];

  // ── UI hierarchy ──
  private root!: Phaser.GameObjects.Container;
  private lp!: Phaser.GameObjects.Container; // left panel
  private rp!: Phaser.GameObjects.Container; // right panel
  private barText!: Phaser.GameObjects.Text;
  private maskGfx: Phaser.GameObjects.Graphics[] = [];

  constructor() { super({ key: 'BuildScene' }); }

  create(): void {
    // ── 1. Nuke previous ──
    for (const g of this.maskGfx) g.destroy();
    this.maskGfx = [];
    this.children.removeAll(true);

    const W = this.cameras.main.width;
    const H = this.cameras.main.height;
    const sx = SAFE, sy = SAFE;

    // ── 2. Root container ──
    this.root = this.add.container(0, 0).setDepth(DEPTH).setScrollFactor(0);

    // Background
    this.root.add(this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a0a));

    // Title
    this.root.add(this.add.text(W / 2, sy, 'BUILD', {
      fontSize: '42px', color: '#cccccc', fontFamily: FONT, padding: TPAD, lineSpacing: LSPC,
    }).setOrigin(0.5, 0));

    // ── 3. Panel backgrounds (behind containers) ──
    const lx = sx + LP.ox, ly = sy + LP.oy;
    const rx = sx + RP.ox, ry = sy + RP.oy;
    const bx = sx + BB.ox, by = sy + BB.oy;
    this.root.add(this.add.rectangle(lx + LP.w / 2, ly + LP.h / 2, LP.w, LP.h, 0x111111, 0.85));
    this.root.add(this.add.rectangle(rx + RP.w / 2, ry + RP.h / 2, RP.w, RP.h, 0x111111, 0.85));

    // ── 4. Left panel + mask ──
    this.lp = this.add.container(lx, ly);
    const lmg = this.make.graphics({ add: false });
    lmg.fillStyle(0xffffff).fillRect(lx, ly, LP.w, LP.h);
    this.lp.setMask(lmg.createGeometryMask());
    this.maskGfx.push(lmg);
    this.root.add(this.lp);

    // ── 5. Right panel + mask ──
    this.rp = this.add.container(rx, ry);
    const rmg = this.make.graphics({ add: false });
    rmg.fillStyle(0xffffff).fillRect(rx, ry, RP.w, RP.h);
    this.rp.setMask(rmg.createGeometryMask());
    this.maskGfx.push(rmg);
    this.root.add(this.rp);

    // ── 6. Bottom bar + mask ──
    const bar = this.add.container(bx, by);
    bar.add(this.add.rectangle(BB.w / 2, BB.h / 2, BB.w, BB.h, 0x111111));
    this.barText = this.add.text(24, (BB.h - 24) / 2, this._barDefault(), {
      fontSize: '16px', color: '#555555', fontFamily: FONT,
      padding: TPAD, lineSpacing: LSPC, fixedWidth: BB.w - 48,
    }).setOrigin(0, 0);
    bar.add(this.barText);
    const bmg = this.make.graphics({ add: false });
    bmg.fillStyle(0xffffff).fillRect(bx, by, BB.w, BB.h);
    bar.setMask(bmg.createGeometryMask());
    this.maskGfx.push(bmg);
    this.root.add(bar);

    // ── 7. Start button ──
    const sbx = sx + SB.ox, sby = sy + SB.oy;
    const sbc = this.add.container(sbx + SB.w / 2, sby + SB.h / 2);
    sbc.add(this.add.rectangle(0, 0, SB.w, SB.h, 0x1a1a1a));
    const sbTxt = this.add.text(0, 0, '>> 시작', {
      fontSize: '36px', color: '#00ff88', fontFamily: FONT, padding: TPAD, lineSpacing: LSPC,
    }).setOrigin(0.5);
    sbc.add(sbTxt);
    sbc.setSize(SB.w, SB.h).setInteractive({ useHandCursor: true });
    sbc.on('pointerdown', () => this._startGame());
    sbc.on('pointerover', () => sbTxt.setColor('#ffffff'));
    sbc.on('pointerout', () => sbTxt.setColor('#00ff88'));
    this.root.add(sbc);

    // ── 8. Populate panels ──
    this._fillLeft();
    this._fillRight();

    // ── 9. Orphan scan ──
    for (const c of [...this.children.list]) {
      if (c !== this.root) c.destroy();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // LEFT PANEL
  // ═══════════════════════════════════════════════════════════════

  private _fillLeft(): void {
    this.lp.removeAll(true);
    const tags = this._tags();
    const P = 24;
    const fw = LP.w - 2 * P;
    const col = Math.floor(fw / 2);

    // Section y starts (local to panel)
    let sy = P;
    const s: number[] = [sy];
    for (let i = 0; i < SECT.length - 1; i++) { sy += SECT[i] + GAP; s.push(sy); }
    const treeY = sy + SECT[SECT.length - 1] + GAP;

    // ── PRESETS ──
    let y = s[0];
    this._lhdr(P, y, '프리셋');
    y += 32;
    for (let i = 0; i < PRESETS.length; i++) {
      const pr = PRESETS[i];
      const sel = isPresetMatch(pr, this.selectedKeystone, this.selectedSkill, this.selectedSupports, this.selectedItem);
      const c = sel ? '#ffaa00' : '#666666';
      const b = this._lbtn(P + (i % 2) * col, y + Math.floor(i / 2) * 28,
        `${sel ? '▶' : '  '} ${pr.label}`, c, col);
      b.on('pointerdown', () => {
        if (sel) return;
        this.selectedKeystone = pr.build.keystone; this.selectedSkill = pr.build.skill;
        this.selectedSupports = [...pr.build.supports]; this.selectedItem = pr.build.item;
        this.selectedClusters = []; this.selectedNodes = [];
        this._fillLeft(); this._fillRight();
      });
      b.on('pointerover', () => { b.setColor('#ffffff'); this._bar(pr.desc); });
      b.on('pointerout', () => { b.setColor(c); this._barReset(); });
    }

    // ── KEYSTONE ──
    y = s[1]; this._lhdr(P, y, '키스톤'); y += 32;
    this._grid1(P, y, KEYSTONES, this.selectedKeystone, col,
      id => { this.selectedKeystone = id as KeystoneId; this._prune(); this._fillLeft(); this._fillRight(); },
      i => `${(i as any).penalty} / ${(i as any).benefit}`);

    // ── SKILL ──
    y = s[2]; this._lhdr(P, y, '스킬'); y += 32;
    this._grid1(P, y, SKILLS, this.selectedSkill, col,
      id => { this.selectedSkill = id as SkillId; this._prune(); this._fillLeft(); this._fillRight(); },
      i => (i as any).desc);

    // ── SUPPORTS ──
    y = s[3]; this._lhdr(P, y, '서포트', '2개 선택'); y += 32;
    this._gridN(P, y, SUPPORTS, this.selectedSupports, 2, col,
      ids => { this.selectedSupports = ids as SupportId[]; this._prune(); this._fillLeft(); this._fillRight(); },
      i => (i as any).desc);

    // ── ITEM ──
    y = s[4]; this._lhdr(P, y, '아이템'); y += 32;
    this._grid1(P, y, ITEMS, this.selectedItem, col,
      id => { this.selectedItem = id as ItemId; this._prune(); this._fillLeft(); this._fillRight(); },
      i => `${(i as any).penalty} / ${(i as any).benefit}`);

    // ── PASSIVE TREE ──
    y = treeY;
    const c0L = this.selectedClusters[0] ? `${getCluster(this.selectedClusters[0]).label}(${this.selectedNodes.filter(n => getNode(n).cluster === this.selectedClusters[0]).length}/4)` : '';
    const c1L = this.selectedClusters[1] ? `${getCluster(this.selectedClusters[1]).label}(${this.selectedNodes.filter(n => getNode(n).cluster === this.selectedClusters[1]).length}/4)` : '';
    this._lhdr(P, y, `패시브 트리  ${[c0L, c1L].filter(Boolean).join('  ') || '미선택'}`, 'cls 2, 0~4');
    y += 32;

    // Cluster bar
    const cw = 145;
    for (let i = 0; i < CLUSTERS.length; i++) {
      const cl = CLUSTERS[i];
      const act = isClusterActive(cl.id, tags);
      const sel = this.selectedClusters.includes(cl.id);
      const can = act && (sel || this.selectedClusters.length < 2);
      const c = !act ? '#333333' : sel ? '#ffaa00' : '#888888';
      const b = this._lbtn(P + i * cw, y, `${sel ? '▶' : '  '}${cl.id}:${cl.label}`, c, cw, can);
      if (can) {
        b.on('pointerdown', () => {
          if (sel) { this.selectedClusters = this.selectedClusters.filter(x => x !== cl.id); this.selectedNodes = this.selectedNodes.filter(n => getNode(n).cluster !== cl.id); }
          else this.selectedClusters.push(cl.id);
          this._fillLeft(); this._fillRight();
        });
        b.on('pointerover', () => { b.setColor('#ffffff'); this._bar(`${cl.label}(${cl.labelEn})`); });
        b.on('pointerout', () => { b.setColor(c); this._barReset(); });
      }
    }
    y += 28;

    // Node lists
    for (const cId of this.selectedClusters) {
      const cl = getCluster(cId);
      const nodesIn = this.selectedNodes.filter(n => getNode(n).cluster === cId);
      const nonKs = nodesIn.filter(n => !getNode(n).isMiniKeystone).length;

      const hdr = this.add.text(P, y, `── ${cl.label}(${cl.labelEn}) ──`, {
        fontSize: '20px', color: '#ffaa00', fontFamily: FONT, padding: TPAD, lineSpacing: LSPC,
      }).setOrigin(0, 0);
      this.lp.add(hdr);
      y += 28;

      for (const nId of cl.nodes) {
        const nd = getNode(nId);
        const sel = this.selectedNodes.includes(nId);
        const ok = isNodeUnlocked(nId, tags);
        const ksOk = !nd.isMiniKeystone || isMiniKeystoneAvailable(nId, this.selectedNodes);
        const lim = !sel && nonKs >= 4 && !nd.isMiniKeystone;
        const tlim = !sel && nodesIn.length >= 4;
        const can = ok && ksOk && !lim && !tlim;

        let c = '#888888'; let reason = '';
        if (!ok) { c = '#333333'; reason = ` (${nd.requiredTags.join(',')})`; }
        else if (!ksOk) { c = '#555555'; reason = ' (3노드)'; }
        else if (lim || tlim) { c = '#555555'; reason = ' (상한)'; }
        else if (sel) { c = '#ffaa00'; }

        const ico = nd.isMiniKeystone ? '★' : nd.type === 'ban' ? 'B' : nd.type === 'convert' ? 'C' : 'R';
        const b = this._lbtn(P, y, `${sel ? '▶' : '  '} ${ico} ${nd.label}${reason}`, c, fw, can || sel);
        if (can || sel) {
          b.on('pointerdown', () => {
            if (sel) {
              this.selectedNodes = this.selectedNodes.filter(n => n !== nId);
              if (!nd.isMiniKeystone) {
                const ksN = cl.nodes.find(id => getNode(id).isMiniKeystone);
                if (ksN && this.selectedNodes.includes(ksN) && !isMiniKeystoneAvailable(ksN, this.selectedNodes))
                  this.selectedNodes = this.selectedNodes.filter(n => n !== ksN);
              }
            } else this.selectedNodes.push(nId);
            this._fillLeft(); this._fillRight();
          });
          b.on('pointerover', () => { b.setColor('#ffffff'); this._bar(`${nd.ban} → ${nd.liberation}`); });
          b.on('pointerout', () => { b.setColor(c); this._barReset(); });
        }
        y += 26;
      }
      y += 6;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RIGHT PANEL
  // ═══════════════════════════════════════════════════════════════

  private _fillRight(): void {
    this.rp.removeAll(true);
    const P = 24;
    const fw = RP.w - 2 * P;
    let y = P;

    // Title
    this.rp.add(this.add.text(P, y, '빌드 요약', {
      fontSize: '24px', color: '#ffaa00', fontFamily: FONT, padding: TPAD, lineSpacing: LSPC,
    }).setOrigin(0, 0));
    y += 36;

    // Summary (8 lines, 240px block)
    const ks = getKeystone(this.selectedKeystone);
    const sk = getSkill(this.selectedSkill);
    const s0 = getSupport(this.selectedSupports[0]);
    const s1 = getSupport(this.selectedSupports[1]);
    const it = getItem(this.selectedItem);
    const c0 = this.selectedClusters[0] ? getCluster(this.selectedClusters[0]) : null;
    const c1 = this.selectedClusters[1] ? getCluster(this.selectedClusters[1]) : null;
    const c0N = c0 ? this.selectedNodes.filter(n => getNode(n).cluster === c0.id).length : 0;
    const c1N = c1 ? this.selectedNodes.filter(n => getNode(n).cluster === c1.id).length : 0;

    for (const line of [
      `키스톤: ${ks.label}`, `스킬: ${sk.label} (${sk.desc})`,
      `서포트: ${s0.label} + ${s1.label}`, `아이템: ${it.label}`,
      `트리1: ${c0 ? `${c0.label}(${c0N})` : '미선택'}`, `트리2: ${c1 ? `${c1.label}(${c1N})` : '미선택'}`,
      `교리: ${ks.armyRule}`, `입력: WASD/클릭/Shift 대시·Reform`,
    ]) {
      this.rp.add(this.add.text(P, y, line, {
        fontSize: '18px', color: '#aaaaaa', fontFamily: FONT,
        padding: TPAD, lineSpacing: LSPC, wordWrap: { width: fw }, fixedWidth: fw,
      }).setOrigin(0, 0));
      y += 24;
    }
    y = P + 36 + 240; // fixed block

    // Ban/Liberation (90px block)
    const { topBan, topLib } = this._topBanLib();
    this.rp.add(this.add.text(P, y, `금지: ${topBan}`, {
      fontSize: '18px', color: '#ff6666', fontFamily: FONT,
      padding: TPAD, lineSpacing: LSPC, wordWrap: { width: fw }, fixedWidth: fw,
    }).setOrigin(0, 0));
    y += 28;
    this.rp.add(this.add.text(P, y, `해방: ${topLib}`, {
      fontSize: '18px', color: '#66ff88', fontFamily: FONT,
      padding: TPAD, lineSpacing: LSPC, wordWrap: { width: fw }, fixedWidth: fw,
    }).setOrigin(0, 0));
    y = P + 36 + 240 + 90; // fixed block

    // Tags (2 lines, mask clips)
    this.rp.add(this.add.text(P, y, `태그: ${this._tags().join(', ')}`, {
      fontSize: '16px', color: '#555555', fontFamily: FONT,
      padding: TPAD, lineSpacing: LSPC, wordWrap: { width: fw }, fixedWidth: fw,
    }).setOrigin(0, 0));
    y += 50;

    // Full ban/lib from nodes
    if (this.selectedNodes.length > 0) {
      this.rp.add(this.add.text(P, y, '── 전체 금지/해방 ──', {
        fontSize: '18px', color: '#888888', fontFamily: FONT, padding: TPAD, lineSpacing: LSPC,
      }).setOrigin(0, 0));
      y += 28;
      for (const nId of this.selectedNodes) {
        const nd = getNode(nId);
        this.rp.add(this.add.text(P, y, `${nd.isMiniKeystone ? '★' : '-'} ${nd.label}`, {
          fontSize: '16px', color: '#aaaaaa', fontFamily: FONT,
          padding: TPAD, lineSpacing: LSPC, fixedWidth: fw,
        }).setOrigin(0, 0));
        y += 22;
        this.rp.add(this.add.text(P + 12, y, `금: ${nd.ban}`, {
          fontSize: '16px', color: '#884444', fontFamily: FONT,
          padding: TPAD, lineSpacing: LSPC, wordWrap: { width: fw - 12 }, fixedWidth: fw - 12,
        }).setOrigin(0, 0));
        y += 22;
        this.rp.add(this.add.text(P + 12, y, `방: ${nd.liberation}`, {
          fontSize: '16px', color: '#448844', fontFamily: FONT,
          padding: TPAD, lineSpacing: LSPC, wordWrap: { width: fw - 12 }, fixedWidth: fw - 12,
        }).setOrigin(0, 0));
        y += 24;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  private _lhdr(x: number, y: number, title: string, hint?: string): void {
    const t = this.add.text(x, y, title, {
      fontSize: '24px', color: '#888888', fontFamily: FONT, padding: TPAD, lineSpacing: LSPC,
    }).setOrigin(0, 0);
    this.lp.add(t);
    if (hint) {
      const h = this.add.text(x + t.width + 12, y + 4, hint, {
        fontSize: '16px', color: '#555555', fontFamily: FONT, padding: TPAD, lineSpacing: LSPC,
      }).setOrigin(0, 0);
      this.lp.add(h);
    }
  }

  private _lbtn(x: number, y: number, text: string, color: string, w: number, interactive = true): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, text, {
      fontSize: '20px', color, fontFamily: FONT, padding: TPAD, lineSpacing: LSPC,
      backgroundColor: color === '#ffaa00' ? '#1a1a00' : undefined, fixedWidth: w,
    }).setOrigin(0, 0);
    if (interactive) t.setInteractive({ useHandCursor: true });
    this.lp.add(t);
    return t;
  }

  private _grid1(x0: number, y: number, items: { id: string; label: string }[],
    sel: string, cw: number, onSel: (id: string) => void, desc: (i: any) => string,
  ): void {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; const isSel = it.id === sel;
      const c = isSel ? '#ffaa00' : '#666666';
      const b = this._lbtn(x0 + (i % 2) * cw, y + Math.floor(i / 2) * 28,
        `${isSel ? '▶' : '  '} ${it.label}`, c, cw);
      b.on('pointerdown', () => onSel(it.id));
      b.on('pointerover', () => { b.setColor('#ffffff'); this._bar(desc(it)); });
      b.on('pointerout', () => { b.setColor(c); this._barReset(); });
    }
  }

  private _gridN(x0: number, y: number, items: { id: string; label: string }[],
    sel: string[], max: number, cw: number,
    onSel: (ids: string[]) => void, desc: (i: any) => string,
  ): void {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; const isSel = sel.includes(it.id);
      const can = isSel || sel.length < max;
      const c = isSel ? '#ffaa00' : can ? '#666666' : '#333333';
      const b = this._lbtn(x0 + (i % 2) * cw, y + Math.floor(i / 2) * 28,
        `${isSel ? '▶' : '  '} ${it.label}`, c, cw, can);
      if (can) {
        b.on('pointerdown', () => { if (isSel) onSel(sel.filter(s => s !== it.id)); else onSel([...sel, it.id]); });
        b.on('pointerover', () => { b.setColor('#ffffff'); this._bar(desc(it)); });
        b.on('pointerout', () => { b.setColor(c); this._barReset(); });
      }
    }
  }

  private _startGame(): void {
    this.scene.start('GameScene', {
      build: {
        keystone: this.selectedKeystone, skill: this.selectedSkill,
        supports: [this.selectedSupports[0], this.selectedSupports[1]],
        item: this.selectedItem,
        clusters: this.selectedClusters.length === 2 ? [this.selectedClusters[0], this.selectedClusters[1]] : [],
        nodes: [...this.selectedNodes],
      } as BuildConfig,
    });
  }

  private _barDefault(): string { return 'WASD 이동 · 좌클릭 공격 · Shift 탭:대시 · Shift 홀드:Reform · 클릭으로 선택'; }
  private _bar(t: string): void { this.barText.setText(t).setColor('#aaaaaa'); }
  private _barReset(): void { this.barText.setText(this._barDefault()).setColor('#555555'); }

  private _tags(): Tag[] {
    return getBuildTags({
      keystone: this.selectedKeystone, skill: this.selectedSkill,
      supports: [this.selectedSupports[0], this.selectedSupports[1]],
      item: this.selectedItem, clusters: [], nodes: [],
    });
  }

  private _topBanLib(): { topBan: string; topLib: string } {
    for (const nId of this.selectedNodes) {
      const nd = getNode(nId);
      if (nd.isMiniKeystone) return { topBan: nd.ban, topLib: nd.liberation };
    }
    const ks = getKeystone(this.selectedKeystone);
    if (ks.penalty && ks.benefit) return { topBan: ks.penalty, topLib: ks.benefit };
    const s0 = getSupport(this.selectedSupports[0]);
    if (s0.desc) return { topBan: s0.desc, topLib: s0.armyRule };
    const it = getItem(this.selectedItem);
    return { topBan: it.penalty, topLib: it.benefit };
  }

  private _prune(): void {
    const tags = this._tags();
    this.selectedClusters = this.selectedClusters.filter(c => isClusterActive(c, tags));
    this.selectedNodes = this.selectedNodes.filter(n => {
      const nd = getNode(n);
      return this.selectedClusters.includes(nd.cluster) && isNodeUnlocked(n, tags);
    });
    this.selectedNodes = this.selectedNodes.filter(n => {
      const nd = getNode(n);
      return !nd.isMiniKeystone || isMiniKeystoneAvailable(n, this.selectedNodes);
    });
  }
}
