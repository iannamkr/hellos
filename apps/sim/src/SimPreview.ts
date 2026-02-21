import type { BalanceData } from '../../../shared/balance/schema';

const WORLD_W = 1920;
const CANVAS_W = 800;
const CANVAS_H = 450;
const SCALE = CANVAS_W / WORLD_W;

const FLAG_X = 960;
const FLAG_Y = 540;

const CLR = {
  commander: '#00ffcc',
  vanguard:  '#4d88ff',
  archer:    '#66ff66',
  cavalry:   '#ffcc33',
  chaser:    '#ff4444',
  dasher:    '#ff8844',
  buffer:    '#aa55ff',
  flag:      '#ffaa00',
  bg:        '#1a1a2e',
};

export class SimPreview {
  private canvas: HTMLCanvasElement;
  private c: CanvasRenderingContext2D;
  private raf = 0;
  private lastTime = 0;
  private elapsed = 0;
  private balance: BalanceData;

  constructor(container: HTMLElement, balance: BalanceData) {
    this.balance = balance;
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.canvas.style.width = '100%';
    this.canvas.style.aspectRatio = '16 / 9';
    container.appendChild(this.canvas);
    this.c = this.canvas.getContext('2d')!;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  setBalance(b: BalanceData): void {
    this.balance = b;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.canvas.remove();
  }

  // ── RAF loop ──

  private tick = (now: number): void => {
    const dt = Math.min(now - this.lastTime, 100);
    this.lastTime = now;
    this.elapsed += dt;
    this.draw();
    this.raf = requestAnimationFrame(this.tick);
  };

  // ── Coordinate helpers (world → canvas pixels) ──

  private sx(wx: number): number { return wx * SCALE; }
  private sy(wy: number): number { return wy * SCALE; }
  private sw(w: number): number { return w * SCALE; }

  // ── Main draw ──

  private draw(): void {
    const c = this.c;
    c.fillStyle = CLR.bg;
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const cmdAngle = this.elapsed * (Math.PI * 2 / 8000);
    const cmdX = FLAG_X + Math.cos(cmdAngle) * 30;
    const cmdY = FLAG_Y + Math.sin(cmdAngle) * 30;

    this.drawRadii(cmdX, cmdY);
    this.drawChasers();
    this.drawBuffers();
    this.drawDashers();
    this.drawAllies(cmdX, cmdY);
    this.fillCircle(FLAG_X, FLAG_Y, 10, CLR.flag);
    this.label('FLAG', FLAG_X, FLAG_Y - 20, '#fff');
    this.fillCircle(cmdX, cmdY, 8, CLR.commander);
    this.drawLabels(cmdX, cmdY);
  }

  // ── Sub-draws ──

  private drawRadii(cx: number, cy: number): void {
    const c = this.c;
    const b = this.balance;
    c.setLineDash([4, 4]);
    c.lineWidth = 1;

    // Command aura (orange, commander center)
    c.strokeStyle = '#ffaa0088';
    this.strokeCircle(cx, cy, b.game.commandAuraRadius);

    // Chaser lineHoldDist (red, FLAG center)
    c.strokeStyle = '#ff444466';
    this.strokeCircle(FLAG_X, FLAG_Y, b.enemies.chaser.lineHoldDist ?? 350);

    // Vanguard engageRadius / returnRadius (blue, centered on front line)
    const lineY = FLAG_Y - 160; // V_LINE_DEPTH
    c.strokeStyle = '#4d88ff44';
    this.strokeCircle(FLAG_X, lineY, b.units.vanguard.engageRadius);
    c.strokeStyle = '#4d88ff33';
    this.strokeCircle(FLAG_X, lineY, b.units.vanguard.returnRadius);

    // Buffer auraRadius labels drawn per-buffer in drawBuffers
    c.setLineDash([]);
  }

  private drawChasers(): void {
    const b = this.balance;
    const n = b.game.platoonSizeChaser;
    const ly = FLAG_Y - (b.enemies.chaser.lineHoldDist ?? 350);
    const sp = b.enemies.chaser.slotSpacing ?? 45;
    for (let i = 0; i < n; i++) {
      this.fillRect(FLAG_X + (i - (n - 1) / 2) * sp, ly, 10, 10, CLR.chaser);
    }
  }

  private drawBuffers(): void {
    const b = this.balance;
    const n = b.game.platoonSizeBuffer;
    const ly = FLAG_Y - (b.enemies.chaser.lineHoldDist ?? 350) - 80;
    const ar = b.enemies.buffer.auraRadius ?? 120;
    const c = this.c;

    for (let i = 0; i < n; i++) {
      const x = FLAG_X + (i - (n - 1) / 2) * 100;
      c.setLineDash([3, 3]);
      c.strokeStyle = '#aa55ff44';
      c.lineWidth = 1;
      this.strokeCircle(x, ly, ar);
      c.setLineDash([]);
      this.fillRect(x, ly, 10, 10, CLR.buffer);
    }
  }

  private drawDashers(): void {
    const b = this.balance;
    const n = b.game.platoonSizeDasher;
    const ly = FLAG_Y - (b.enemies.chaser.lineHoldDist ?? 350) - 140;
    const sp = 80;
    for (let i = 0; i < n; i++) {
      this.fillRect(FLAG_X + (i - (n - 1) / 2) * sp, ly, 10, 10, CLR.dasher);
    }
  }

  private drawAllies(ax: number, ay: number): void {
    // committedDir = (0,-1): up = forward. fx=0,fy=-1, rx=1,ry=0
    // lineAnchor = FLAG + dir * 160 → FLAG_Y - 160

    const lineY = FLAG_Y - 160; // V_LINE_DEPTH=160, dir=(0,-1)

    // Vanguard: 1-rank line anchored on FLAG, SLOT_TABLE=[0,-60,60,-120,120,-180,180]
    const vSlots = [0, -60, 60, -120, 120, -180, 180];
    for (const s of vSlots) {
      this.fillRect(FLAG_X + s, lineY, 8, 8, CLR.vanguard);
    }

    // Front line visualization (thin line across vanguard)
    const c = this.c;
    c.strokeStyle = CLR.vanguard + '55';
    c.lineWidth = 1;
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(this.sx(FLAG_X - 300), this.sy(lineY));
    c.lineTo(this.sx(FLAG_X + 300), this.sy(lineY));
    c.stroke();

    // Archer: 2 ranks at rear -260/-320, gap=70 (5 units)
    const ar0 = 3, ar1 = 2;
    for (let i = 0; i < ar0; i++)
      this.fillRect(ax + (i - (ar0 - 1) / 2) * 70, ay + 260, 8, 8, CLR.archer);
    for (let i = 0; i < ar1; i++)
      this.fillRect(ax + (i - (ar1 - 1) / 2) * 70, ay + 320, 8, 8, CLR.archer);

    // Cavalry: gap-based, positioned at low-density gaps along front line
    // GAP_SAMPLES=[-240,-120,0,120,240], C_GAP_OFFSET=-40 (slightly behind line)
    const gapSamples = [-240, -120, 120, 240]; // 4 cavalry at spread gaps
    for (const gs of gapSamples) {
      this.fillRect(FLAG_X + gs, lineY + 40, 8, 8, CLR.cavalry); // behind line by 40
    }
  }

  private drawLabels(cx: number, cy: number): void {
    const b = this.balance;

    // Command aura radius
    const ar = b.game.commandAuraRadius;
    this.label(`${ar}`, cx, cy - ar - 10, '#ffffff88');

    // Chaser lineHoldDist
    const lh = b.enemies.chaser.lineHoldDist ?? 350;
    this.label(`${lh}`, FLAG_X + 50, FLAG_Y - lh, '#ffffff88');

    // Vanguard engageRadius
    const er = b.units.vanguard.engageRadius;
    const lineY = FLAG_Y - 160;
    this.label(`${er}`, FLAG_X + er + 20, lineY, '#ffffff88');

    // Buffer auraRadius
    const bar = b.enemies.buffer.auraRadius ?? 120;
    const bly = FLAG_Y - (b.enemies.chaser.lineHoldDist ?? 350) - 80;
    this.label(`${bar}`, FLAG_X, bly - bar - 10, '#ffffff88');
  }

  // ── Primitives ──

  private fillCircle(wx: number, wy: number, pr: number, color: string): void {
    this.c.fillStyle = color;
    this.c.beginPath();
    this.c.arc(this.sx(wx), this.sy(wy), pr, 0, Math.PI * 2);
    this.c.fill();
  }

  private strokeCircle(wx: number, wy: number, worldR: number): void {
    this.c.beginPath();
    this.c.arc(this.sx(wx), this.sy(wy), this.sw(worldR), 0, Math.PI * 2);
    this.c.stroke();
  }

  private fillRect(wx: number, wy: number, pw: number, ph: number, color: string): void {
    this.c.fillStyle = color;
    this.c.fillRect(this.sx(wx) - pw / 2, this.sy(wy) - ph / 2, pw, ph);
  }

  private label(text: string, wx: number, wy: number, color: string): void {
    this.c.fillStyle = color;
    this.c.font = '18px sans-serif';
    this.c.textAlign = 'center';
    this.c.fillText(text, this.sx(wx), this.sy(wy));
  }
}
