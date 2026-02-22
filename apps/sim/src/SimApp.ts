import type { BalanceData, SquadType, EnemyType } from '../../../shared/balance/schema';
import { DEFAULT_BALANCE } from '../../../shared/balance/defaults';
import { loadBalance, saveBalanceToApi, exportBalanceToJson, importBalanceFromJson } from '../../../shared/balance/storage';
import { summarize } from '../../../shared/balance/calc';
import { SimPreview } from './SimPreview';
import type { FieldSpec, ModCategory } from '../../../shared/balance/fields';
import {
  COMMANDER_FIELDS, COMMANDER_REFORM_FIELDS, COMMANDER_DIRECTION_FIELDS, COMMANDER_CHARGE_FIELDS,
  VANGUARD_BASE_FIELDS, VANGUARD_FORMATION_FIELDS,
  ARCHER_BASE_FIELDS, ARCHER_FORMATION_FIELDS,
  CAVALRY_BASE_FIELDS, CAVALRY_FORMATION_FIELDS, CAVALRY_STATE_FIELDS, CAVALRY_STABILITY_FIELDS,
  CHASER_BASE_FIELDS, CHASER_FIELDS, DASHER_BASE_FIELDS, DASHER_FIELDS, BUFFER_BASE_FIELDS, BUFFER_FIELDS,
  GAME_SPAWN_FIELDS, GAME_ARMY_FIELDS, GAME_SEPARATION_FIELDS, GAME_ANCHOR_FIELDS,
  GAME_FLAG_FIELDS, GAME_CAMERA_FIELDS, GAME_ENCOUNTER_FIELDS, GAME_ZONE_FIELDS, GAME_CAP_FIELDS,
  GAME_MOVEMENT_FIELDS, GAME_DIRECTION_FIELDS, GAME_SQUAD_FIELDS, GAME_FRONTLINE_FIELDS,
  MODIFIER_FIELDS, MOD_CATEGORY_LABELS, MOD_DESCRIPTIONS,
  UNIT_DESCRIPTIONS, ENEMY_DESCRIPTIONS,
} from '../../../shared/balance/fields';

const SQUAD_TYPES: SquadType[] = ['vanguard', 'archer', 'cavalry'];
const ENEMY_TYPES: EnemyType[] = ['chaser', 'dasher', 'buffer'];

type Tab = 'commander' | 'units' | 'enemies' | 'game' | 'modifiers';

export class SimApp {
  private root: HTMLElement;
  private balance: BalanceData;
  private tab: Tab = 'commander';
  private selectedUnit: SquadType = 'vanguard';
  private selectedEnemy: EnemyType = 'chaser';
  private selectedModCategory: ModCategory = 'items';
  private selectedModId = 'heavyBlade';
  private errorMsg = '';
  private dirty = false;
  private preview!: SimPreview;
  private previewContainer!: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.balance = loadBalance();
    this.previewContainer = document.createElement('div');
    this.previewContainer.className = 'preview';
    this.injectStyles();
    this.render();
    this.preview = new SimPreview(this.previewContainer, this.balance);
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #1a1a2e; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; }
      #app { display: flex; flex-direction: column; height: 100vh; padding: 12px; gap: 12px; }
      .header { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
      .header h1 { font-size: 18px; color: #ffaa00; }
      .header button { padding: 6px 16px; border: 1px solid #555; background: #2a2a4a; color: #e0e0e0; border-radius: 4px; cursor: pointer; font-size: 13px; }
      .header button:hover { background: #3a3a5a; }
      .header button.primary { background: #2a6a2a; border-color: #4a4; color: #fff; font-weight: bold; }
      .header button.primary:hover { background: #3a8a3a; }
      .header button.primary.dirty { background: #4a8a2a; box-shadow: 0 0 8px #4a4; }
      .header button.danger { border-color: #a44; color: #f88; }
      .header .save-status { font-size: 12px; color: #8a8; }
      .main { display: flex; flex: 1; gap: 12px; min-height: 0; }
      .sidebar { width: 180px; flex-shrink: 0; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
      .tab-bar { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
      .tab-bar button { padding: 8px 12px; border: 1px solid #444; background: #2a2a4a; color: #aaa; cursor: pointer; border-radius: 4px; font-size: 13px; text-align: left; }
      .tab-bar button.active { background: #3a3a6a; color: #fff; border-color: #ffaa00; }
      .list-item { padding: 8px 12px; border: 1px solid #333; border-radius: 4px; cursor: pointer; font-size: 13px; text-transform: capitalize; line-height: 1.4; }
      .list-item:hover { background: #2a2a4a; }
      .list-item.active { background: #3a3a6a; border-color: #ffaa00; color: #ffaa00; }
      .list-item .desc { display: block; font-size: 11px; color: #777; text-transform: none; margin-top: 1px; }
      .list-item.active .desc { color: #bb8800; }
      .sub-header { font-size: 11px; color: #666; margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 1px; }
      .editor { flex: 1; background: #22223a; border: 1px solid #333; border-radius: 6px; padding: 16px; overflow-y: auto; }
      .editor h2 { font-size: 16px; margin-bottom: 12px; text-transform: capitalize; color: #ffcc44; }
      .editor h3 { font-size: 13px; color: #888; margin: 12px 0 6px; border-bottom: 1px solid #333; padding-bottom: 4px; }
      .preview { width: 400px; flex-shrink: 0; padding: 12px; background: #22223a; border: 1px solid #333; border-radius: 6px; }
      .field { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      .field label { width: 150px; text-align: right; color: #aaa; font-size: 13px; cursor: help; }
      #tooltip { position: fixed; background: #111; color: #ffcc44; font-size: 12px; padding: 4px 8px; border-radius: 4px; white-space: nowrap; z-index: 10000; border: 1px solid #555; pointer-events: none; display: none; }
      .field input { width: 100px; padding: 4px 8px; border: 1px solid #444; background: #1a1a2e; color: #e0e0e0; border-radius: 4px; font-size: 14px; }
      .field input:focus { outline: none; border-color: #ffaa00; }
      .io-panel { background: #22223a; border: 1px solid #333; border-radius: 6px; padding: 12px; flex-shrink: 0; }
      .io-panel textarea { width: 100%; height: 70px; background: #1a1a2e; color: #e0e0e0; border: 1px solid #444; border-radius: 4px; padding: 8px; font-family: monospace; font-size: 12px; resize: vertical; }
      .io-panel .btn-row { display: flex; gap: 8px; margin-top: 8px; }
      .io-panel button { padding: 4px 12px; border: 1px solid #555; background: #2a2a4a; color: #e0e0e0; border-radius: 4px; cursor: pointer; font-size: 13px; }
      .io-panel button:hover { background: #3a3a5a; }
      .error { color: #f66; font-size: 12px; margin-top: 4px; }
      .summary { flex-shrink: 0; background: #22223a; border: 1px solid #333; border-radius: 6px; padding: 12px; overflow-x: auto; }
      .summary h3 { font-size: 14px; color: #ffcc44; margin-bottom: 8px; }
      .summary table { border-collapse: collapse; font-size: 13px; }
      .summary th, .summary td { padding: 4px 12px; border: 1px solid #333; text-align: right; }
      .summary th { background: #2a2a4a; color: #aaa; text-transform: capitalize; }
      .summary td { color: #e0e0e0; }
    `;
    document.head.appendChild(style);
  }

  private render(): void {
    const editorScroll = this.root.querySelector('.editor')?.scrollTop ?? 0;
    const sidebarScroll = this.root.querySelector('.sidebar')?.scrollTop ?? 0;

    const sum = summarize(this.balance);
    const selectedKey = this.tab === 'commander' ? 'Commander'
      : this.tab === 'game' ? 'Game Settings'
      : this.tab === 'modifiers' ? `${MOD_CATEGORY_LABELS[this.selectedModCategory]} / ${this.selectedModId}`
      : this.tab === 'units' ? this.selectedUnit : this.selectedEnemy;

    let listHtml = '';
    if (this.tab === 'units') {
      listHtml = SQUAD_TYPES.map(s => `<div class="list-item ${this.selectedUnit === s ? 'active' : ''}" data-select="${s}">${s}${UNIT_DESCRIPTIONS[s] ? `<span class="desc">${UNIT_DESCRIPTIONS[s]}</span>` : ''}</div>`).join('');
    } else if (this.tab === 'enemies') {
      listHtml = ENEMY_TYPES.map(e => `<div class="list-item ${this.selectedEnemy === e ? 'active' : ''}" data-select="${e}">${e}${ENEMY_DESCRIPTIONS[e] ? `<span class="desc">${ENEMY_DESCRIPTIONS[e]}</span>` : ''}</div>`).join('');
    } else if (this.tab === 'modifiers') {
      listHtml = this.renderModifierList();
    }

    this.root.innerHTML = `
      <div class="header">
        <h1>Balance Simulator</h1>
        <button id="btn-save" class="primary ${this.dirty ? 'dirty' : ''}">Save</button>
        <span class="save-status" id="save-status">${this.dirty ? 'Unsaved changes' : ''}</span>
        <button id="btn-reset" class="danger">Reset to Defaults</button>
      </div>
      <div class="main">
        <div class="sidebar">
          <div class="tab-bar">
            <button data-tab="commander" class="${this.tab === 'commander' ? 'active' : ''}">Cmdr</button>
            <button data-tab="units" class="${this.tab === 'units' ? 'active' : ''}">Units</button>
            <button data-tab="enemies" class="${this.tab === 'enemies' ? 'active' : ''}">Enemies</button>
            <button data-tab="game" class="${this.tab === 'game' ? 'active' : ''}">Game</button>
            <button data-tab="modifiers" class="${this.tab === 'modifiers' ? 'active' : ''}">Mods</button>
          </div>
          ${listHtml}
        </div>
        <div class="editor">
          <h2>${selectedKey}</h2>
          ${this.renderEditorFields()}
        </div>
      </div>
      <div class="io-panel">
        <textarea id="io-text" placeholder="Paste JSON here to import, or click Export to see current data..."></textarea>
        <div class="btn-row">
          <button id="btn-export">Export</button>
          <button id="btn-copy">Copy</button>
          <button id="btn-import">Import / Apply</button>
          <button id="btn-file">Load File...</button>
          <input type="file" id="file-input" accept=".json" style="display:none">
        </div>
        ${this.errorMsg ? `<div class="error">${this.errorMsg}</div>` : ''}
      </div>
      <div class="summary">
        ${this.renderSummaryInner(sum)}
      </div>
      <div id="tooltip"></div>
    `;

    this.bind();
    this._mountPreview();

    const newEditor = this.root.querySelector('.editor');
    const newSidebar = this.root.querySelector('.sidebar');
    if (newEditor) newEditor.scrollTop = editorScroll;
    if (newSidebar) newSidebar.scrollTop = sidebarScroll;
  }

  private _mountPreview(): void {
    const main = this.root.querySelector('.main');
    if (main) main.appendChild(this.previewContainer);
  }

  private renderModifierList(): string {
    const cats: ModCategory[] = ['items', 'supports', 'keystones', 'nodes'];
    let html = '';
    for (const cat of cats) {
      html += `<div class="sub-header">${MOD_CATEGORY_LABELS[cat]}</div>`;
      const ids = Object.keys(MODIFIER_FIELDS[cat]);
      for (const id of ids) {
        const active = this.selectedModCategory === cat && this.selectedModId === id;
        const desc = MOD_DESCRIPTIONS[cat]?.[id] ?? '';
        html += `<div class="list-item ${active ? 'active' : ''}" data-mod-cat="${cat}" data-mod-id="${id}">${id}${desc ? `<span class="desc">${desc}</span>` : ''}</div>`;
      }
    }
    return html;
  }

  private renderEditorFields(): string {
    switch (this.tab) {
      case 'commander': return this.renderCommanderEditor();
      case 'units': return this.renderUnitEditor();
      case 'enemies': return this.renderEnemyEditor();
      case 'game': return this.renderGameEditor();
      case 'modifiers': return this.renderModifierEditor();
    }
  }

  private renderCommanderEditor(): string {
    let html = this.renderFields(this.balance.commander, COMMANDER_FIELDS);
    html += `<h3>Reform</h3>` + this.renderFields(this.balance.commander, COMMANDER_REFORM_FIELDS);
    html += `<h3>Direction</h3>` + this.renderFields(this.balance.commander, COMMANDER_DIRECTION_FIELDS);
    html += `<h3>Charge</h3>` + this.renderFields(this.balance.commander, COMMANDER_CHARGE_FIELDS);
    return html;
  }

  private renderUnitEditor(): string {
    const stats = this.balance.units[this.selectedUnit];
    const baseFields = this.selectedUnit === 'vanguard' ? VANGUARD_BASE_FIELDS
      : this.selectedUnit === 'archer' ? ARCHER_BASE_FIELDS : CAVALRY_BASE_FIELDS;
    let html = this.renderFields(stats, baseFields);
    if (this.selectedUnit === 'vanguard') {
      html += `<h3>Formation</h3>` + this.renderFields(stats, VANGUARD_FORMATION_FIELDS);
    } else if (this.selectedUnit === 'archer') {
      html += `<h3>Formation</h3>` + this.renderFields(stats, ARCHER_FORMATION_FIELDS);
    } else if (this.selectedUnit === 'cavalry') {
      html += `<h3>Formation</h3>` + this.renderFields(stats, CAVALRY_FORMATION_FIELDS);
      html += `<h3>State Machine</h3>` + this.renderFields(stats, CAVALRY_STATE_FIELDS);
      html += `<h3>Stability</h3>` + this.renderFields(stats, CAVALRY_STABILITY_FIELDS);
    }
    return html;
  }

  private renderGameEditor(): string {
    let html = this.renderFields(this.balance.game, GAME_SPAWN_FIELDS);
    html += `<h3>Army Composition</h3>` + this.renderFields(this.balance.game, GAME_ARMY_FIELDS);
    html += `<h3>Separation</h3>` + this.renderFields(this.balance.game, GAME_SEPARATION_FIELDS);
    html += `<h3>Anchor Decay</h3>` + this.renderFields(this.balance.game, GAME_ANCHOR_FIELDS);
    html += `<h3>Flag Penetration</h3>` + this.renderFields(this.balance.game, GAME_FLAG_FIELDS);
    html += `<h3>Camera</h3>` + this.renderFields(this.balance.game, GAME_CAMERA_FIELDS);
    html += `<h3>Encounter</h3>` + this.renderFields(this.balance.game, GAME_ENCOUNTER_FIELDS);
    html += `<h3>Zone</h3>` + this.renderFields(this.balance.game, GAME_ZONE_FIELDS);
    html += `<h3>Cooldown Caps / Speed</h3>` + this.renderFields(this.balance.game, GAME_CAP_FIELDS);
    html += `<h3>Movement</h3>` + this.renderFields(this.balance.game, GAME_MOVEMENT_FIELDS);
    html += `<h3>Direction</h3>` + this.renderFields(this.balance.game, GAME_DIRECTION_FIELDS);
    html += `<h3>Squad Timing</h3>` + this.renderFields(this.balance.game, GAME_SQUAD_FIELDS);
    html += `<h3>Front-line</h3>` + this.renderFields(this.balance.game, GAME_FRONTLINE_FIELDS);
    return html;
  }

  private renderModifierEditor(): string {
    const cat = this.selectedModCategory;
    const id = this.selectedModId;
    const fields = MODIFIER_FIELDS[cat]?.[id];
    if (!fields || fields.length === 0) return '<p style="color:#666">No editable fields</p>';

    // Ensure the category/id exists in balance data
    if (!this.balance.modifiers[cat]) (this.balance.modifiers as any)[cat] = {};
    if (!(this.balance.modifiers[cat] as any)[id]) (this.balance.modifiers[cat] as any)[id] = {};
    const obj = (this.balance.modifiers[cat] as any)[id];

    return fields.map(f => {
      const val = obj[f.key];
      const step = f.step ?? (f.key.includes('Mult') || f.key.includes('Factor') || f.key.includes('Lerp') ? 0.01 : 1);
      return `<div class="field">
        <label data-tip="${f.tip}">${f.label}</label>
        <input type="number" data-mod-field="${f.key}" value="${val ?? ''}" min="-9999" max="9999" step="${step}">
      </div>`;
    }).join('');
  }

  private renderFields(obj: any, fields: readonly FieldSpec[]): string {
    return fields.map(f => {
      const val = obj[f.key];
      const step = f.step ?? (f.key.includes('Mult') || f.key.includes('Boost') || f.key.includes('Factor') || f.key.includes('Lerp') ? 0.01 : 1);
      return `<div class="field">
        <label data-tip="${f.tip}">${f.label}</label>
        <input type="number" data-field="${f.key}" value="${val ?? ''}" min="0" max="9999" step="${step}">
      </div>`;
    }).join('');
  }

  private renderEnemyEditor(): string {
    const stats = this.balance.enemies[this.selectedEnemy];
    const baseFields = this.selectedEnemy === 'chaser' ? CHASER_BASE_FIELDS
      : this.selectedEnemy === 'dasher' ? DASHER_BASE_FIELDS : BUFFER_BASE_FIELDS;
    let html = this.renderFields(stats, baseFields);
    // Type-specific fields
    const extra = this.selectedEnemy === 'chaser' ? CHASER_FIELDS
      : this.selectedEnemy === 'dasher' ? DASHER_FIELDS
      : BUFFER_FIELDS;
    if (extra.length) {
      const label = this.selectedEnemy === 'chaser' ? 'Formation' : this.selectedEnemy === 'dasher' ? 'Dash / Disrupt / Egress' : 'Aura';
      html += `<h3>${label}</h3>` + this.renderFields(stats, extra);
    }
    return html;
  }

  private bind(): void {
    // Tooltip
    const tip = this.root.querySelector<HTMLDivElement>('#tooltip')!;
    this.root.querySelectorAll<HTMLLabelElement>('label[data-tip]').forEach(lbl => {
      lbl.addEventListener('mouseenter', (e: MouseEvent) => {
        tip.textContent = lbl.dataset.tip!;
        tip.style.display = 'block';
        tip.style.left = e.clientX + 12 + 'px';
        tip.style.top = e.clientY + 12 + 'px';
      });
      lbl.addEventListener('mousemove', (e: MouseEvent) => {
        tip.style.left = e.clientX + 12 + 'px';
        tip.style.top = e.clientY + 12 + 'px';
      });
      lbl.addEventListener('mouseleave', () => {
        tip.style.display = 'none';
      });
    });

    // Tabs
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.tab as Tab;
        this.render();
      });
    });

    // List selection (units/enemies)
    this.root.querySelectorAll<HTMLDivElement>('[data-select]').forEach(el => {
      el.addEventListener('click', () => {
        if (this.tab === 'units') this.selectedUnit = el.dataset.select as SquadType;
        else if (this.tab === 'enemies') this.selectedEnemy = el.dataset.select as EnemyType;
        this.render();
      });
    });

    // Modifier list selection
    this.root.querySelectorAll<HTMLDivElement>('[data-mod-cat]').forEach(el => {
      el.addEventListener('click', () => {
        this.selectedModCategory = el.dataset.modCat as ModCategory;
        this.selectedModId = el.dataset.modId!;
        this.render();
      });
    });

    // Field inputs (commander/units/enemies/game)
    this.root.querySelectorAll<HTMLInputElement>('input[data-field]').forEach(inp => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.field!;
        const val = inp.value === '' ? undefined : Number(inp.value);
        const target = this.tab === 'commander' ? this.balance.commander
          : this.tab === 'units' ? this.balance.units[this.selectedUnit]
          : this.tab === 'enemies' ? this.balance.enemies[this.selectedEnemy]
          : this.balance.game;
        (target as any)[key] = val;
        this.markDirty();
        const sumEl = this.root.querySelector('.summary');
        if (sumEl) sumEl.innerHTML = this.renderSummaryInner(summarize(this.balance));
      });
    });

    // Modifier field inputs
    this.root.querySelectorAll<HTMLInputElement>('input[data-mod-field]').forEach(inp => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.modField!;
        const val = inp.value === '' ? undefined : Number(inp.value);
        const cat = this.selectedModCategory;
        const id = this.selectedModId;
        if (!this.balance.modifiers[cat]) (this.balance.modifiers as any)[cat] = {};
        if (!(this.balance.modifiers[cat] as any)[id]) (this.balance.modifiers[cat] as any)[id] = {};
        (this.balance.modifiers[cat] as any)[id][key] = val;
        this.markDirty();
      });
    });

    // Save
    this.root.querySelector('#btn-save')?.addEventListener('click', () => this.save());

    // Reset
    this.root.querySelector('#btn-reset')?.addEventListener('click', () => {
      this.balance = structuredClone(DEFAULT_BALANCE);
      this.preview.setBalance(this.balance);
      this.save();
    });

    // Export
    const textarea = this.root.querySelector<HTMLTextAreaElement>('#io-text')!;
    this.root.querySelector('#btn-export')?.addEventListener('click', () => {
      textarea.value = exportBalanceToJson(this.balance);
      this.errorMsg = '';
    });

    // Copy
    this.root.querySelector('#btn-copy')?.addEventListener('click', () => {
      textarea.select();
      navigator.clipboard.writeText(textarea.value);
    });

    // Import
    this.root.querySelector('#btn-import')?.addEventListener('click', () => {
      try {
        this.balance = importBalanceFromJson(textarea.value);
        this.errorMsg = '';
        this.preview.setBalance(this.balance);
        this.save();
      } catch (e: any) {
        this.errorMsg = e.message || 'Import failed';
        this.render();
      }
    });

    // File load
    const fileInput = this.root.querySelector<HTMLInputElement>('#file-input')!;
    this.root.querySelector('#btn-file')?.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          this.balance = importBalanceFromJson(reader.result as string);
          this.errorMsg = '';
          this.preview.setBalance(this.balance);
          this.save();
        } catch (e: any) {
          this.errorMsg = e.message || 'File import failed';
          this.render();
        }
      };
      reader.readAsText(file);
    });
  }

  private renderSummaryInner(sum: ReturnType<typeof summarize>): string {
    return `
      <h3>DPS &amp; TTK Summary</h3>
      <table>
        <tr><th></th>${ENEMY_TYPES.map(e => `<th>${e}</th>`).join('')}<th>DPS</th></tr>
        ${SQUAD_TYPES.map(s => `
          <tr>
            <th>${s}</th>
            ${ENEMY_TYPES.map(e => {
              const v = sum.ttkMatrix[s][e];
              return `<td>${v === Infinity ? '---' : v.toFixed(2) + 's'}</td>`;
            }).join('')}
            <td>${sum.unitDps[s].toFixed(2)}</td>
          </tr>
        `).join('')}
      </table>
    `;
  }

  private markDirty(): void {
    if (this.dirty) return;
    this.dirty = true;
    const btn = this.root.querySelector<HTMLButtonElement>('#btn-save');
    if (btn) btn.classList.add('dirty');
    const status = this.root.querySelector('#save-status');
    if (status) status.textContent = 'Unsaved changes';
  }

  private async save(): Promise<void> {
    try {
      await saveBalanceToApi(this.balance);
      this.dirty = false;
      this.errorMsg = '';
      this.render();
      const status = this.root.querySelector('#save-status');
      if (status) {
        status.textContent = 'Saved!';
        setTimeout(() => { if (status.parentElement) status.textContent = ''; }, 1500);
      }
    } catch (e: any) {
      this.errorMsg = 'Save failed: ' + (e.message || 'unknown error');
      this.render();
    }
  }
}
