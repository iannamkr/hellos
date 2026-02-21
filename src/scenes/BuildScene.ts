import Phaser from 'phaser';
import type { KeystoneId, SkillId, SupportId, ItemId, ClusterId, NodeId, BuildConfig, Tag } from '../types';
import { KEYSTONES, SKILLS, SUPPORTS, ITEMS, PRESETS, getKeystone, getSkill, getSupport, getItem } from '../data/buildData';
import { CLUSTERS, getNode, getCluster, getBuildTags, isClusterActive, isNodeUnlocked, isMiniKeystoneAvailable } from '../data/treeData';

const FONT = 'Courier New';
const D = 10000;
const TABS = ['\ud504\ub9ac\uc14b', '\ube4c\ub4dc', '\ud2b8\ub9ac'] as const;
type TabKey = typeof TABS[number];

function presetMatch(
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

  // ── UI ──
  private activeTab: TabKey = '\ud504\ub9ac\uc14b';
  private content!: Phaser.GameObjects.Container;
  private summary!: Phaser.GameObjects.Container;
  private tabBtns: Phaser.GameObjects.Text[] = [];
  private desc!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'BuildScene' }); }

  create(): void {
    this.children.removeAll(true);
    const W = this.scale.width;
    const H = this.scale.height;

    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a0a).setDepth(D);

    this.add.text(W / 2, 28, 'BUILD', {
      fontSize: '44px', color: '#cccccc', fontFamily: FONT,
      padding: { top: 12, bottom: 2 },
    }).setOrigin(0.5, 0).setDepth(D);

    // ── Layout ──
    const LX = 48, LW = 1060;
    const RX = 1140, RW = 732;
    const TAB_Y = 88;
    const CY = 138, CB = H - 168, CH = CB - CY;
    const DY = CB + 10;
    const SY = DY + 66;

    // ── Tabs ──
    const tw = Math.floor(LW / TABS.length);
    this.tabBtns = [];
    for (let i = 0; i < TABS.length; i++) {
      const btn = this.add.text(LX + i * tw + tw / 2, TAB_Y, TABS[i], {
        fontSize: '24px', color: '#666666', fontFamily: FONT,
        backgroundColor: '#111111', padding: { x: 20, y: 8 },
      }).setOrigin(0.5, 0).setDepth(D).setInteractive({ useHandCursor: true });
      const key = TABS[i];
      btn.on('pointerdown', () => { this.activeTab = key; this._refresh(); });
      this.tabBtns.push(btn);
    }

    // ── Left panel ──
    this.add.rectangle(LX + LW / 2, CY + CH / 2, LW, CH, 0x111111, 0.85).setDepth(D);
    this.content = this.add.container(LX, CY).setDepth(D + 1);
    const cm = this.make.graphics({ add: false } as any);
    cm.fillStyle(0xffffff).fillRect(LX, CY, LW, CH);
    this.content.setMask(cm.createGeometryMask());

    // ── Right panel ──
    this.add.rectangle(RX + RW / 2, CY + CH / 2, RW, CH, 0x111111, 0.85).setDepth(D);
    this.summary = this.add.container(RX, CY).setDepth(D + 1);
    const sm = this.make.graphics({ add: false } as any);
    sm.fillStyle(0xffffff).fillRect(RX, CY, RW, CH);
    this.summary.setMask(sm.createGeometryMask());

    // ── Description bar ──
    const fullW = RX + RW - LX;
    this.add.rectangle(LX + fullW / 2, DY + 26, fullW, 52, 0x111111).setDepth(D);
    this.desc = this.add.text(LX + 16, DY + 8, this._hint(), {
      fontSize: '18px', color: '#555555', fontFamily: FONT,
      wordWrap: { width: fullW - 32 },
      padding: { top: 6, bottom: 2 },
    }).setDepth(D + 1);

    // ── Start button ──
    const sb = this.add.text(W / 2, SY, 'START', {
      fontSize: '34px', color: '#00ff88', fontFamily: FONT,
      backgroundColor: 'transparent', padding: { left: 32, right: 32, top: 10, bottom: 6 },
    }).setOrigin(0.5, 0).setDepth(D + 1).setInteractive({ useHandCursor: true });
    sb.on('pointerdown', () => this._start());
    sb.on('pointerover', () => sb.setColor('#ffffff'));
    sb.on('pointerout', () => sb.setColor('#00ff88'));

    this._refresh();
  }

  // ═══════════════════════════════════════════════════════════════
  // REFRESH
  // ═══════════════════════════════════════════════════════════════

  private _refresh(): void {
    for (let i = 0; i < TABS.length; i++) {
      const on = TABS[i] === this.activeTab;
      this.tabBtns[i].setColor(on ? '#ffaa00' : '#666666');
      this.tabBtns[i].setBackgroundColor(on ? '#1a1a00' : '#111111');
    }
    this.content.removeAll(true);
    switch (this.activeTab) {
      case '\ud504\ub9ac\uc14b': this._tabPreset(); break;
      case '\ube4c\ub4dc': this._tabBuild(); break;
      case '\ud2b8\ub9ac': this._tabTree(); break;
    }
    this._fillSummary();
    this._resetDesc();
  }

  // ═══════════════════════════════════════════════════════════════
  // TAB: 프리셋
  // ═══════════════════════════════════════════════════════════════

  private _tabPreset(): void {
    let y = 20;
    this._hdr(20, y, '\ud504\ub9ac\uc14b \uc120\ud0dd');
    y += 36;
    for (const pr of PRESETS) {
      const sel = presetMatch(pr, this.selectedKeystone, this.selectedSkill, this.selectedSupports, this.selectedItem);
      const c = sel ? '#ffaa00' : '#888888';
      const t = this._li(20, y, `${sel ? '\u25b6' : '  '} ${pr.label}`, c);
      this._sub(48, y + 30, pr.desc);
      t.on('pointerdown', () => {
        this.selectedKeystone = pr.build.keystone;
        this.selectedSkill = pr.build.skill;
        this.selectedSupports = [...pr.build.supports];
        this.selectedItem = pr.build.item;
        this.selectedClusters = []; this.selectedNodes = [];
        this._refresh();
      });
      t.on('pointerover', () => { t.setColor('#ffffff'); this._setDesc(`${pr.label}: ${pr.desc}`); });
      t.on('pointerout', () => { t.setColor(c); this._resetDesc(); });
      y += 56;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TAB: 빌드 (키스톤 + 스킬 + 서포트 + 아이템)
  // ═══════════════════════════════════════════════════════════════

  private _tabBuild(): void {
    const tags = this._tags();
    const P = 20;
    const col = 490; // column width
    let y = P;

    // ── 키스톤 (2-col) ──
    this._hdr(P, y, '\ud0a4\uc2a4\ud1a4');
    y += 32;
    for (let i = 0; i < KEYSTONES.length; i++) {
      const ks = KEYSTONES[i];
      const sel = ks.id === this.selectedKeystone;
      const c = sel ? '#ffaa00' : '#888888';
      const cx = P + (i % 2) * col;
      const cy = y + Math.floor(i / 2) * 30;
      const t = this._li(cx, cy, `${sel ? '\u25b6' : '  '} ${ks.label}`, c);
      t.on('pointerdown', () => { this.selectedKeystone = ks.id; this._prune(); this._refresh(); });
      t.on('pointerover', () => { t.setColor('#ffffff'); this._setDesc(`${ks.penalty} / ${ks.benefit} \xb7 \uad50\ub9ac: ${ks.armyRule}`); });
      t.on('pointerout', () => { t.setColor(c); this._resetDesc(); });
    }
    y += Math.ceil(KEYSTONES.length / 2) * 30 + 16;

    // ── 스킬 (2-col) ──
    this._hdr(P, y, '\uc2a4\ud0ac');
    y += 32;
    for (let i = 0; i < SKILLS.length; i++) {
      const sk = SKILLS[i];
      const sel = sk.id === this.selectedSkill;
      const c = sel ? '#ffaa00' : '#888888';
      const cx = P + (i % 2) * col;
      const cy = y + Math.floor(i / 2) * 30;
      const t = this._li(cx, cy, `${sel ? '\u25b6' : '  '} ${sk.label}`, c);
      t.on('pointerdown', () => { this.selectedSkill = sk.id; this._prune(); this._refresh(); });
      t.on('pointerover', () => { t.setColor('#ffffff'); this._setDesc(sk.desc); });
      t.on('pointerout', () => { t.setColor(c); this._resetDesc(); });
    }
    y += Math.ceil(SKILLS.length / 2) * 30 + 16;

    // ── 서포트 (2-col, max 2) ──
    this._hdr(P, y, `\uc11c\ud3ec\ud2b8 (${this.selectedSupports.length}/2)`);
    y += 32;
    for (let i = 0; i < SUPPORTS.length; i++) {
      const sp = SUPPORTS[i];
      const sel = this.selectedSupports.includes(sp.id);
      const avail = sp.requiredTags.every(t => tags.includes(t));
      const can = sel || (this.selectedSupports.length < 2 && avail);
      let c = '#888888';
      if (!avail) c = '#444444';
      else if (sel) c = '#ffaa00';
      else if (!can) c = '#555555';

      const cx = P + (i % 2) * col;
      const cy = y + Math.floor(i / 2) * 30;
      const t = this._li(cx, cy, `${sel ? '\u25b6' : '  '} ${sp.label}${!avail ? ' \u00d7' : ''}`, c, can || sel);
      if (can || sel) {
        t.on('pointerdown', () => {
          if (sel) this.selectedSupports = this.selectedSupports.filter(s => s !== sp.id);
          else this.selectedSupports.push(sp.id);
          this._prune(); this._refresh();
        });
      }
      t.on('pointerover', () => {
        if (can || sel) t.setColor('#ffffff');
        this._setDesc(`${sp.desc} \xb7 \uad70\ub2e8: ${sp.armyRule}${!avail ? ` (\ud544\uc694: ${sp.requiredTags.join(',')})` : ''}`);
      });
      t.on('pointerout', () => { t.setColor(c); this._resetDesc(); });
    }
    y += Math.ceil(SUPPORTS.length / 2) * 30 + 16;

    // ── 아이템 (2-col) ──
    this._hdr(P, y, '\uc544\uc774\ud15c');
    y += 32;
    for (let i = 0; i < ITEMS.length; i++) {
      const it = ITEMS[i];
      const sel = it.id === this.selectedItem;
      const c = sel ? '#ffaa00' : '#888888';
      const cx = P + (i % 2) * col;
      const cy = y + Math.floor(i / 2) * 30;
      const t = this._li(cx, cy, `${sel ? '\u25b6' : '  '} ${it.label}`, c);
      t.on('pointerdown', () => { this.selectedItem = it.id; this._prune(); this._refresh(); });
      t.on('pointerover', () => { t.setColor('#ffffff'); this._setDesc(`${it.penalty} / ${it.benefit} \xb7 \uad70\ub2e8: ${it.armyRule}`); });
      t.on('pointerout', () => { t.setColor(c); this._resetDesc(); });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TAB: 트리 (클러스터 + 노드)
  // ═══════════════════════════════════════════════════════════════

  private _tabTree(): void {
    const tags = this._tags();
    const P = 20;
    let y = P;

    // Cluster selection (3-col, 2 rows)
    this._hdr(P, y, `\ud074\ub7ec\uc2a4\ud130 (${this.selectedClusters.length}/2)`);
    y += 34;
    const cw = 165;
    for (let i = 0; i < CLUSTERS.length; i++) {
      const cl = CLUSTERS[i];
      const act = isClusterActive(cl.id, tags);
      const sel = this.selectedClusters.includes(cl.id);
      const can = act && (sel || this.selectedClusters.length < 2);
      const c = !act ? '#333333' : sel ? '#ffaa00' : '#888888';
      const cx = P + (i % 3) * cw;
      const cy = y + Math.floor(i / 3) * 36;
      const t = this._li(cx, cy, `${sel ? '\u25b6' : '  '} ${cl.id}:${cl.label}`, c, can);
      if (can) {
        t.on('pointerdown', () => {
          if (sel) {
            this.selectedClusters = this.selectedClusters.filter(x => x !== cl.id);
            this.selectedNodes = this.selectedNodes.filter(n => getNode(n).cluster !== cl.id);
          } else this.selectedClusters.push(cl.id);
          this._refresh();
        });
        t.on('pointerover', () => { t.setColor('#ffffff'); this._setDesc(`${cl.label}(${cl.labelEn}): \ud65c\uc131 \ud0dc\uadf8 ${cl.activationTags.join(', ')}`); });
        t.on('pointerout', () => { t.setColor(c); this._resetDesc(); });
      }
    }
    y += 80;

    // Current tags (reference)
    this._sub(P, y, `\ud604\uc7ac \ud0dc\uadf8: ${tags.join(', ')}`);
    y += 28;

    // Nodes per cluster
    for (const cId of this.selectedClusters) {
      const cl = getCluster(cId);
      const nodesIn = this.selectedNodes.filter(n => getNode(n).cluster === cId);
      const nonKs = nodesIn.filter(n => !getNode(n).isMiniKeystone).length;

      this._hdr(P, y, `\u2500\u2500 ${cl.label}(${cl.labelEn}) ${nodesIn.length}/4 \u2500\u2500`);
      y += 34;

      for (const nId of cl.nodes) {
        const nd = getNode(nId);
        const sel = this.selectedNodes.includes(nId);
        const ok = isNodeUnlocked(nId, tags);
        const ksOk = !nd.isMiniKeystone || isMiniKeystoneAvailable(nId, this.selectedNodes);
        const lim = !sel && nonKs >= 4 && !nd.isMiniKeystone;
        const tlim = !sel && nodesIn.length >= 4;
        const can = ok && ksOk && !lim && !tlim;

        let c = '#888888', reason = '';
        if (!ok) { c = '#333333'; reason = ` (${nd.requiredTags.join(',')})`; }
        else if (!ksOk) { c = '#555555'; reason = ' (3\ub178\ub4dc)'; }
        else if (lim || tlim) { c = '#555555'; reason = ' (\uc0c1\ud55c)'; }
        else if (sel) c = '#ffaa00';

        const ico = nd.isMiniKeystone ? '\u2605' : nd.type === 'ban' ? 'B' : nd.type === 'convert' ? 'C' : 'R';
        const t = this._li(P, y, `${sel ? '\u25b6' : '  '} ${ico} ${nd.label}${reason}`, c, can || sel);
        if (can || sel) {
          t.on('pointerdown', () => {
            if (sel) {
              this.selectedNodes = this.selectedNodes.filter(n => n !== nId);
              if (!nd.isMiniKeystone) {
                const ksN = cl.nodes.find(id => getNode(id).isMiniKeystone);
                if (ksN && this.selectedNodes.includes(ksN) && !isMiniKeystoneAvailable(ksN, this.selectedNodes))
                  this.selectedNodes = this.selectedNodes.filter(n => n !== ksN);
              }
            } else this.selectedNodes.push(nId);
            this._refresh();
          });
        }
        t.on('pointerover', () => {
          if (can || sel) t.setColor('#ffffff');
          this._setDesc(`\uae08: ${nd.ban} \u2192 \ubc29: ${nd.liberation}`);
        });
        t.on('pointerout', () => { t.setColor(c); this._resetDesc(); });
        y += 34;
      }
      y += 12;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RIGHT PANEL — SUMMARY
  // ═══════════════════════════════════════════════════════════════

  private _fillSummary(): void {
    this.summary.removeAll(true);
    const P = 20, fw = 692;
    let y = P;

    this._st(P, y, '\ube4c\ub4dc \uc694\uc57d', '#ffaa00', '24px');
    y += 40;

    const ks = getKeystone(this.selectedKeystone);
    const sk = getSkill(this.selectedSkill);
    const s0 = this.selectedSupports[0] ? getSupport(this.selectedSupports[0]) : null;
    const s1 = this.selectedSupports[1] ? getSupport(this.selectedSupports[1]) : null;
    const it = getItem(this.selectedItem);
    const supLabel = [s0?.label, s1?.label].filter(Boolean).join(' + ') || '\ubbf8\uc120\ud0dd';

    for (const [label, value] of [
      ['\ud0a4\uc2a4\ud1a4', ks.label],
      ['\uc2a4\ud0ac', `${sk.label} (${sk.desc})`],
      ['\uc11c\ud3ec\ud2b8', supLabel],
      ['\uc544\uc774\ud15c', it.label],
    ] as const) {
      this._st(P, y, `${label}: ${value}`, '#aaaaaa', '20px', fw);
      y += 28;
    }

    y += 8;
    for (let i = 0; i < 2; i++) {
      const cId = this.selectedClusters[i];
      const cl = cId ? getCluster(cId) : null;
      const cnt = cl ? this.selectedNodes.filter(n => getNode(n).cluster === cl.id).length : 0;
      this._st(P, y, `\ud2b8\ub9ac${i + 1}: ${cl ? `${cl.label}(${cnt})` : '\ubbf8\uc120\ud0dd'}`, '#888888', '20px', fw);
      y += 28;
    }

    y += 8;
    this._st(P, y, `\uad50\ub9ac: ${ks.armyRule}`, '#888888', '18px', fw);
    y += 24;
    this._st(P, y, '\uc785\ub825: WASD/\ud074\ub9ad/Shift \ub300\uc2dc\xb7Reform', '#666666', '18px', fw);
    y += 36;

    const { topBan, topLib } = this._topBanLib();
    this._st(P, y, `\uae08\uc9c0: ${topBan}`, '#ff6666', '18px', fw);
    y += 26;
    this._st(P, y, `\ud574\ubc29: ${topLib}`, '#66ff88', '18px', fw);
    y += 36;

    this._st(P, y, `\ud0dc\uadf8: ${this._tags().join(', ')}`, '#555555', '16px', fw);
    y += 36;

    if (this.selectedNodes.length > 0) {
      this._st(P, y, '\u2500\u2500 \uc120\ud0dd \ub178\ub4dc \u2500\u2500', '#888888', '18px');
      y += 28;
      for (const nId of this.selectedNodes) {
        const nd = getNode(nId);
        this._st(P, y, `${nd.isMiniKeystone ? '\u2605' : '-'} ${nd.label}`, '#aaaaaa', '16px', fw);
        y += 22;
        this._st(P + 12, y, `\uae08: ${nd.ban}`, '#884444', '16px', fw - 12);
        y += 22;
        this._st(P + 12, y, `\ubc29: ${nd.liberation}`, '#448844', '16px', fw - 12);
        y += 24;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  private _li(x: number, y: number, text: string, color: string, interactive = true): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, text, {
      fontSize: '22px', color, fontFamily: FONT,
      backgroundColor: color === '#ffaa00' ? '#1a1a00' : undefined,
      padding: { left: 8, right: 8, top: 6, bottom: 2 },
    }).setOrigin(0, 0);
    if (interactive) t.setInteractive({ useHandCursor: true });
    this.content.add(t);
    return t;
  }

  private _sub(x: number, y: number, text: string): void {
    this.content.add(this.add.text(x, y, text, {
      fontSize: '16px', color: '#666666', fontFamily: FONT, padding: { x: 4, y: 2 },
    }).setOrigin(0, 0));
  }

  private _hdr(x: number, y: number, text: string): void {
    this.content.add(this.add.text(x, y, text, {
      fontSize: '20px', color: '#ffaa00', fontFamily: FONT, padding: { x: 4, y: 2 },
    }).setOrigin(0, 0));
  }

  private _st(x: number, y: number, text: string, color: string, size: string, fw?: number): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: size, color, fontFamily: FONT, padding: { left: 4, top: 2, right: 4, bottom: 2 },
    };
    if (fw) { style.wordWrap = { width: fw }; }
    this.summary.add(this.add.text(x, y, text, style).setOrigin(0, 0));
  }

  private _hint(): string { return '\uc635\uc158 \uc704\uc5d0 \ub9c8\uc6b0\uc2a4\ub97c \uc62c\ub824\ubcf4\uc138\uc694'; }
  private _setDesc(t: string): void { this.desc.setText(t).setColor('#aaaaaa'); }
  private _resetDesc(): void { this.desc.setText(this._hint()).setColor('#555555'); }

  private _start(): void {
    if (this.selectedSupports.length < 2) return;
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

  private _tags(): Tag[] {
    const tags = new Set<Tag>();
    for (const t of getKeystone(this.selectedKeystone).tags) tags.add(t);
    for (const t of getSkill(this.selectedSkill).tags) tags.add(t);
    for (const sid of this.selectedSupports) {
      for (const t of getSupport(sid).tags) tags.add(t);
    }
    for (const t of getItem(this.selectedItem).tags) tags.add(t);
    return [...tags];
  }

  private _topBanLib(): { topBan: string; topLib: string } {
    for (const nId of this.selectedNodes) {
      const nd = getNode(nId);
      if (nd.isMiniKeystone) return { topBan: nd.ban, topLib: nd.liberation };
    }
    const ks = getKeystone(this.selectedKeystone);
    if (ks.penalty && ks.benefit) return { topBan: ks.penalty, topLib: ks.benefit };
    if (this.selectedSupports[0]) {
      const s0 = getSupport(this.selectedSupports[0]);
      if (s0.desc) return { topBan: s0.desc, topLib: s0.armyRule };
    }
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
