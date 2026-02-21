import Phaser from 'phaser';
import { GameMode, type BuildConfig, type SupportId, type Tag, type Zone, type SquadType, type NodeId } from '../types';
import { getKeystone, getSkill, getSupport, getItem } from '../data/buildData';
import { getNode } from '../data/treeData';
import { Player }      from '../entities/Player';
import { EnemyBase }   from '../entities/EnemyBase';
import { Chaser }      from '../entities/Chaser';
import { Dasher }      from '../entities/Dasher';
import { BufferEnemy } from '../entities/BufferEnemy';
import { ArmyUnit }    from '../entities/ArmyUnit';
import type { GameRules } from '../army/GameRules';
import { POLICIES, moveToSlot } from '../army/SquadPolicy';
import { COLOR } from '../colors';

const CLOSE_RANGE = 120;
const SEED = 1337;
const SPAWN_DIST = Math.ceil(Math.sqrt(1920 * 1920 + 1080 * 1080) / 2) + 120;
const T_SEQ = [-360, -240, -120, 0, 120, 240, 360];
const PLATOON_SPAWN_INTERVAL = 5000;
const MAX_PLATOONS = { core: 3, repeat: 5 };
const VOLLEY_CYCLE = 900;
const VOLLEY_WINDOW = 120;

type SpawnChannel = 'front' | 'flankL' | 'flankR' | 'back';
type PlatoonType = 'chaser' | 'dasher' | 'buffer';

interface Platoon {
  type: PlatoonType;
  leader: EnemyBase;
  wingmen: EnemyBase[];
  enemies: EnemyBase[];
  spawnTime: number;
}

const PLATOON_SIZES: Record<PlatoonType, number> = { chaser: 7, dasher: 5, buffer: 5 };

// Wingman offsets: [lateral, behind] per formation type (WEDGE/LINE/COLUMN)
const WING_OFFSETS: Array<Array<[number, number]>> = [
  [[-35, 45], [35, 45], [-70, 90], [70, 90], [-105, 135], [105, 135]],
  [[-55, 0], [55, 0], [-110, 0], [110, 0], [-165, 0], [165, 0]],
  [[0, 55], [0, 110], [0, 165], [0, 220], [0, 275], [0, 330]],
];

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class GameScene extends Phaser.Scene {
  // Build
  private build!: BuildConfig;
  private allTags!: Set<Tag>;
  private supActive!: [boolean, boolean];
  private baseAttackCD = 400;
  private baseDashCD = 1400;
  private baseSpeed = 220;

  // Tree node runtime state
  private activeNodes = new Set<NodeId>();
  private d1MarkTarget: EnemyBase | null = null;  // D1 mark lock target
  private d1LockUntil = 0;      // D1 mark change lockout
  private d4BuffUntil = 0;      // D4 execution → archer priority shift
  private d6ExecTimer = 0;      // D6 forced exit timer (per enemy)
  private d6ExecTargets = new Map<EnemyBase, number>(); // D6 2s forced exit
  private e4StillTimer = 0;     // E4 still duration tracker
  private e4WeakenUntil = 0;    // E4 flank weaken window
  private e5MoveLockUntil = 0;  // E5 archer fire lock after moving
  private f5BackDirTimer = 0;   // F5 reverse movement tracker
  private b4BackSealUntil = 0;  // B4 back channel seal
  private c6BackSealUntil = 0;  // C6 back channel seal
  private e6BackSealUntil = 0;  // E6 back channel seal
  private f6BackSealUntil = 0;  // F6 back channel seal
  private a5FirstHitMap = new Map<EnemyBase, boolean>(); // A5 first hit tracker
  private nodeHudText!: Phaser.GameObjects.Text;

  // Entities
  player!: Player;
  enemies: EnemyBase[] = [];

  // Army
  private armyUnits: ArmyUnit[] = [];
  // (Individual HP on each ArmyUnit — no shared pool)
  private squadReformUntil = { vanguard: 0, archer: 0, cavalry: 0 };
  private squadProtectUntil = { vanguard: 0, archer: 0, cavalry: 0 };
  private facingAngle = 0;
  private moveDirX = 0;
  private moveDirY = 1;
  private arrowProjectiles: Phaser.Physics.Arcade.Image[] = [];
  private armySpeedBoostUntil = 0;
  private armyKillCount = 0;
  private rng!: () => number;

  // Mode-dependent
  private stageDuration = 60;
  private reinfTimes: number[] = [15, 35];

  // Command Aura
  private auraRadius = 260;
  private auraCenterX = 0;
  private auraCenterY = 0;
  private auraActive = true;
  private ssAnchorX = 0;
  private ssAnchorY = 0;
  private ssAnchorUntil = 0;

  // Tactical Mark
  private tacticalMarkTarget: EnemyBase | null = null;
  private tacticalMarkUntil = 0;

  // Contract (reinforcement buff)
  private contractType: SquadType | null = null;
  private contractUntil = 0;

  // Front-line state
  private frontLineIntact = true;
  private frontLineCollapseUntil = 0;

  // Reform (player-initiated)
  private reformActive = false;
  private reformUntil = 0;
  private reformStartTime = 0;
  private reformFrozenDirX = 0;
  private reformFrozenDirY = 1;
  private reformIndicator: Phaser.GameObjects.Text | null = null;
  private reformCDText: Phaser.GameObjects.Text | null = null;
  private reformCDTextUntil = 0;

  // Encounter / Situation cards
  private encounterActive = false;
  private encounterArcherHits = 0;
  private situationCardIdx = 0;
  private situationCardStart = 0;

  // Contract tracking
  private contractChaserSpawnCount = 0;

  // Reinforcement
  private reinfIdx = 0;
  private reinfPaused = false;

  // K5 state
  private k5LastTarget: EnemyBase | null = null;
  private k5ConsecutiveHits = 0;

  // P2 Mark-Stack
  private p2LastTarget: EnemyBase | null = null;

  // P3/I8 Zone
  private zone: Zone | null = null;
  private zoneGraphic: Phaser.GameObjects.Arc | null = null;

  // P4 Rhythm
  private rhythmCycleStart = 0;

  // P1 Dash-Prime
  private dashPrimeUntil = 0;

  // P7 Dash Tax
  private dashTaxBuffUntil = 0;

  // S5 Charge
  private isCharging = false;
  private chargeStartTime = 0;

  // Heal counters
  private k6HealCounter = 0;
  private i1HealCounter = 0;

  // Spawn
  private stageStartTime = 0;
  private nextSpawnTime = 0;
  private spawnIndex = 0;

  // Platoons
  private platoons: Platoon[] = [];
  private platoonFormCycle = 0;

  // Volley
  private volleyCycleStart = 0;
  private archerFiredThisWindow: Set<ArmyUnit> = new Set();

  // committedDir — slowly-updating formation direction
  private committedDirX = 0;
  private committedDirY = 1;
  private committedPendingSince = 0;
  private committedCooldownUntil = 0;

  // anchorPos — per-squad inertial position
  private anchorPosV = { x: 960, y: 540 };
  private anchorPosA = { x: 960, y: 540 };
  private anchorPosC = { x: 960, y: 540 };

  // FLAG — map center objective
  private flagX = 960;
  private flagY = 540;
  private flagPenetrationTime = 0;
  private flagGraphic: Phaser.GameObjects.Arc | null = null;

  // Wingman data
  private wingmanData: Map<EnemyBase, { leader: EnemyBase; latOffset: number; behindOffset: number }> = new Map();

  // Double platoon pending
  private doublePlatoonPending: { channel: SpawnChannel; time: number } | null = null;

  // Camera zoom
  private cameraZoom = 1.0;
  private cameraTargetZoom = 1.0;

  // Stage
  private timeLeft = 60;
  killCount = 0;
  gameOver = false;

  // Camera follow target (invisible, positioned at anchor average)
  private cameraTarget!: Phaser.GameObjects.Image;

  // UI (all setScrollFactor(0), screen-fixed)
  private timerText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;
  private hpDisplay!: Phaser.GameObjects.Graphics;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private cooldownGraphics!: Phaser.GameObjects.Graphics;
  private chargeGraphics!: Phaser.GameObjects.Graphics;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private contractText!: Phaser.GameObjects.Text;
  private encounterText!: Phaser.GameObjects.Text;
  private flagPenText!: Phaser.GameObjects.Text;
  private situationText!: Phaser.GameObjects.Text;
  private squadText!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'GameScene' }); }

  // ═══════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  init(data: { build: BuildConfig }): void {
    this.build = data.build;
    this.enemies = [];
    this.armyUnits = [];
    this.stageDuration = GameMode.repeat ? 90 : 60;
    this.reinfTimes = GameMode.repeat ? [15, 35, 55, 75] : [15, 35];
    this.timeLeft = this.stageDuration;
    this.killCount = 0;
    this.gameOver = false;
    this.zone = null;
    this.zoneGraphic = null;
    this.k5LastTarget = null;
    this.k5ConsecutiveHits = 0;
    this.p2LastTarget = null;
    this.dashPrimeUntil = 0;
    this.dashTaxBuffUntil = 0;
    this.isCharging = false;
    this.k6HealCounter = 0;
    this.i1HealCounter = 0;
    this.spawnIndex = 0;
    this.reinfIdx = 0;
    this.reinfPaused = false;
    // (Individual HP on each ArmyUnit — no shared pool reset needed)
    this.squadReformUntil = { vanguard: 0, archer: 0, cavalry: 0 };
    this.squadProtectUntil = { vanguard: 0, archer: 0, cavalry: 0 };
    this.moveDirX = 0;
    this.moveDirY = 1;
    this.arrowProjectiles = [];
    this.armySpeedBoostUntil = 0;
    this.armyKillCount = 0;
    this.rng = mulberry32(SEED);
    this.contractType = null;
    this.contractUntil = 0;
    this.encounterActive = false;
    this.encounterArcherHits = 0;
    this.frontLineIntact = true;
    this.frontLineCollapseUntil = 0;
    this.reformActive = false;
    this.reformUntil = 0;
    this.reformStartTime = 0;
    this.reformFrozenDirX = 0;
    this.reformFrozenDirY = 1;
    this.reformCDText = null;
    this.reformCDTextUntil = 0;
    this.situationCardIdx = 0;
    this.situationCardStart = 0;
    this.contractChaserSpawnCount = 0;
    this.auraRadius = 260;
    this.auraCenterX = 0;
    this.auraCenterY = 0;
    this.auraActive = true;
    this.ssAnchorX = 0;
    this.ssAnchorY = 0;
    this.ssAnchorUntil = 0;
    this.tacticalMarkTarget = null;
    this.tacticalMarkUntil = 0;
    this.platoons = [];
    this.platoonFormCycle = 0;
    this.volleyCycleStart = 0;
    this.archerFiredThisWindow = new Set();
    this.committedDirX = 0;
    this.committedDirY = 1;
    this.committedPendingSince = 0;
    this.committedCooldownUntil = 0;
    this.anchorPosV = { x: 960, y: 540 };
    this.anchorPosA = { x: 960, y: 540 };
    this.anchorPosC = { x: 960, y: 540 };
    this.flagX = 960;
    this.flagY = 540;
    this.flagPenetrationTime = 0;
    this.flagGraphic = null;
    this.wingmanData = new Map();
    this.doublePlatoonPending = null;
    this.cameraZoom = 1.0;
    this.cameraTargetZoom = 1.0;
    // Tree nodes
    this.activeNodes = new Set(this.build.nodes || []);
    this.d1MarkTarget = null;
    this.d1LockUntil = 0;
    this.d4BuffUntil = 0;
    this.d6ExecTimer = 0;
    this.d6ExecTargets = new Map();
    this.e4StillTimer = 0;
    this.e4WeakenUntil = 0;
    this.e5MoveLockUntil = 0;
    this.f5BackDirTimer = 0;
    this.b4BackSealUntil = 0;
    this.c6BackSealUntil = 0;
    this.e6BackSealUntil = 0;
    this.f6BackSealUntil = 0;
    this.a5FirstHitMap = new Map();
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this._createTextures();
    this._drawGrid(W, H);
    this._resolveBuild();

    this.player = new Player(this, W / 2, H / 2);
    this._applyStaticBuildEffects();

    // Init anchorPos to player spawn
    this.anchorPosV = { x: this.player.x, y: this.player.y };
    this.anchorPosA = { x: this.player.x, y: this.player.y };
    this.anchorPosC = { x: this.player.x, y: this.player.y };

    this._createArmy();

    this.stageStartTime = this.time.now;
    this.rhythmCycleStart = this.time.now;
    this.volleyCycleStart = this.time.now;
    this.nextSpawnTime = this.time.now + PLATOON_SPAWN_INTERVAL;

    // FLAG at map center
    this.flagX = W / 2;
    this.flagY = H / 2;
    this.flagGraphic = this.add.circle(this.flagX, this.flagY, 20, 0xffaa00, 0.2).setDepth(1);
    this.flagGraphic.setStrokeStyle(2, 0xffaa00, 0.4);

    this._spawnPlatoon();

    // Camera follows anchor average (not player directly)
    this.cameraTarget = this.add.image(W / 2, H / 2, 'player').setAlpha(0).setVisible(false);
    this.cameras.main.setZoom(1.0);
    this.cameras.main.startFollow(this.cameraTarget, true, 0.08, 0.08);

    this.input.on('pointerdown', () => {
      if (this.gameOver || this.reinfPaused) return;
      this._onPointerDown();
    });

    this.input.keyboard!.on('keydown-R', () => this.scene.restart({ build: this.build }));
    this.input.keyboard!.on('keydown-B', () => this.scene.start('BuildScene'));

    this.time.addEvent({ delay: 1000, callback: this._tickTimer, callbackScope: this, loop: true });

    // World-space graphics (camera-affected)
    this.aimGraphics = this.add.graphics().setDepth(9);
    this.chargeGraphics = this.add.graphics().setDepth(8);
    // World-space debug overlay (scrollFactor=1, follows camera)
    this.debugGraphics = this.add.graphics().setDepth(3);
    // Screen-space graphics (camera-independent)
    this.cooldownGraphics = this.add.graphics().setDepth(10000).setScrollFactor(0);
    this._setupUI(W, H);
  }

  update(): void {
    if (this.gameOver || this.reinfPaused) return;

    this._updateDynamicCooldowns();
    this.player.update();

    // Reform trigger
    if (this.player.reformTriggered) {
      this.player.reformTriggered = false;
      this.reformActive = true;
      this.reformStartTime = this.time.now;
      this.reformUntil = this.time.now + 550;
      // faceDir: mouse direction from commander position
      const ptr = this.input.activePointer;
      const fdx = ptr.worldX - this.player.x;
      const fdy = ptr.worldY - this.player.y;
      const fdLen = Math.sqrt(fdx * fdx + fdy * fdy);
      if (fdLen > 10) {
        this.reformFrozenDirX = fdx / fdLen;
        this.reformFrozenDirY = fdy / fdLen;
      } else {
        this.reformFrozenDirX = this.committedDirX;
        this.reformFrozenDirY = this.committedDirY;
      }
      this._showReformFlash();
      // Alpha flash on all units
      for (const u of this.armyUnits) {
        if (u.active) {
          u.setAlpha(0.85);
          this.time.delayedCall(120, () => { if (u.active) u.setAlpha(1); });
        }
      }
    }
    // Reform CD indicator
    if (this.player.reformOnCooldown) {
      this.player.reformOnCooldown = false;
      if (!this.reformCDText) {
        this.reformCDTextUntil = this.time.now + 400;
        this.reformCDText = this.add.text(this.scale.width / 2, 140, 'Reform CD', {
          fontSize: '20px', color: '#ff4444', fontFamily: 'Courier New',
        }).setOrigin(0.5).setDepth(10000).setScrollFactor(0);
      }
    }
    if (this.reformCDText && this.time.now >= this.reformCDTextUntil) {
      this.reformCDText.destroy();
      this.reformCDText = null;
    }
    // Reform end
    if (this.reformActive && this.time.now >= this.reformUntil) {
      this.reformActive = false;
      this._checkReformFrontlineBonus();
    }
    // Shift hold indicator
    this._updateReformIndicator();

    // Update raw moveDir from velocity
    if (this.player.isMoving) {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      if (body.velocity.x !== 0 || body.velocity.y !== 0) {
        const len = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
        this.moveDirX = body.velocity.x / len;
        this.moveDirY = body.velocity.y / len;
      }
    }
    this.facingAngle = Math.atan2(this.moveDirY, this.moveDirX);

    // committedDir + anchorPos
    this._updateCommittedDir();
    this._updateAnchorPos();

    if (this.player.dashActivatedThisFrame) this._onDashStart();
    if (this.player.dashJustEnded) this._onDashEnd();
    this._updateCharge();
    this._updateAura();
    this._updateTacticalMark();

    this._cleanupPlatoons();

    // Double platoon check
    if (this.doublePlatoonPending && this.time.now >= this.doublePlatoonPending.time) {
      const ch = this.doublePlatoonPending.channel;
      this.doublePlatoonPending = null;
      this._spawnPlatoonForChannel(ch);
    }

    if (this.time.now >= this.nextSpawnTime) {
      const maxP = GameMode.repeat ? MAX_PLATOONS.repeat : MAX_PLATOONS.core;
      if (this.platoons.length < maxP) {
        this._spawnPlatoon();
      }
      this.nextSpawnTime = this.time.now + PLATOON_SPAWN_INTERVAL;
    }
    this._updateVolley();
    this._updateFlag();

    this._updateTreeNodes();
    this._checkFrontLineState();
    this._updateEnemies();
    this._updateArmy();
    this._checkCavalryInterception();
    this._checkEnemyArmyCollision();
    this._checkPlayerCollision();
    this._updateSquadReform();
    this._checkReinforcement();
    this._updateZone();
    this._updateArrows();
    this._updateContract();
    this._updateEncounter();
    this._drawAimLine();
    this._refreshHpDisplay();
    this._drawCooldowns();
    this._drawDebugOverlay();
    this._refreshSquadDisplay();
    this._updateCameraZoom();

    // Camera follows anchor average
    const camX = (this.anchorPosV.x + this.anchorPosA.x + this.anchorPosC.x) / 3;
    const camY = (this.anchorPosV.y + this.anchorPosA.y + this.anchorPosC.y) / 3;
    this.cameraTarget.setPosition(camX, camY);
  }

  // ═══════════════════════════════════════════════════════════════
  // BUILD RESOLUTION
  // ═══════════════════════════════════════════════════════════════

  private _resolveBuild(): void {
    const ks = getKeystone(this.build.keystone);
    const sk = getSkill(this.build.skill);
    const s0 = getSupport(this.build.supports[0]);
    const s1 = getSupport(this.build.supports[1]);
    const it = getItem(this.build.item);

    this.allTags = new Set<Tag>([...ks.tags, ...sk.tags, ...s0.tags, ...s1.tags, ...it.tags]);

    const otherTags0 = new Set<Tag>([...ks.tags, ...sk.tags, ...s1.tags, ...it.tags]);
    const otherTags1 = new Set<Tag>([...ks.tags, ...sk.tags, ...s0.tags, ...it.tags]);
    this.supActive = [
      s0.requiredTags.some(t => otherTags0.has(t)),
      s1.requiredTags.some(t => otherTags1.has(t)),
    ];
  }

  private _applyStaticBuildEffects(): void {
    const p = this.player;
    const item = this.build.item;
    const ks = this.build.keystone;

    this.baseAttackCD = 400;
    this.baseDashCD = 1400;
    this.baseSpeed = 220;

    if (item === 'heavyBlade') this.baseAttackCD += 200;
    if (item === 'calmMind')   { this.baseAttackCD -= 100; this.baseDashCD += 300; }
    if (item === 'sprintBoots') { this.baseSpeed = 264; this.baseDashCD -= 200; p.maxHp -= 1; }
    if (item === 'ironSkin')   this.baseSpeed = 176;
    if (item === 'antiDashPlate') { p.dashGrantsInvincibility = false; p.iframesDuration = 2000; }

    if (this._hasSup('closeShock')) this.baseAttackCD += 150;

    if (ks === 'fragilePower') {
      p.maxHp -= 2;
      p.extraDashIframes = 100;
      // Reduce each unit's max HP by 1 (min 1)
      for (const u of this.armyUnits) {
        u.maxHp = Math.max(1, u.maxHp - 1);
        u.hp = Math.min(u.hp, u.maxHp);
      }
    }

    // Set aura radius by keystone
    if (ks === 'closePact') this.auraRadius = 200;
    else if (ks === 'kitingVow') this.auraRadius = 260;
    else this.auraRadius = 260;

    p.hp = p.maxHp;
    p.attackCooldown = this.baseAttackCD;
    p.dashCooldown = this.baseDashCD;
    p.speed = this.baseSpeed;

    // Tree node static effects
    if (this._hasNode('E6')) p.dashDisabled = true; // 성채 교리: dash disabled
    if (this._hasNode('F3')) {
      // 이동=전열 회전: commit angle 25° (handled in _updateCommittedDir)
      // commit cooldown 0.35s (handled in _updateCommittedDir)
    }
    if (this._hasNode('C6')) {
      // 돌격 교리: cavalry damage = 0 (handled in _armyUnitAttack)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SUPPORT HELPERS
  // ═══════════════════════════════════════════════════════════════

  private _hasSup(id: SupportId): boolean {
    return this.build.supports[0] === id || this.build.supports[1] === id;
  }

  private _supStr(id: SupportId): number {
    const idx = this.build.supports.indexOf(id);
    if (idx === -1) return 0;
    return this.supActive[idx] ? 1.0 : 0.3;
  }

  private _hasNode(id: NodeId): boolean {
    return this.activeNodes.has(id);
  }

  private _isVanguardLowHp(): boolean {
    const vAlive = this.armyUnits.filter(u => u.active && u.squadType === 'vanguard');
    const vTotal = this.armyUnits.filter(u => u.squadType === 'vanguard');
    if (vTotal.length === 0) return false;
    return vAlive.length / vTotal.length < 0.3;
  }

  // ═══════════════════════════════════════════════════════════════
  // DYNAMIC COOLDOWNS
  // ═══════════════════════════════════════════════════════════════

  private _updateDynamicCooldowns(): void {
    let atkCD = this.baseAttackCD;
    let dashCD = this.baseDashCD;
    const ks = this.build.keystone;

    if (ks === 'kitingVow') {
      const nearest = this._nearestEnemyDist();
      if (nearest <= CLOSE_RANGE) atkCD *= 2;
      else dashCD *= 0.7;
    }

    if (this._hasSup('zoneAnchor') && this.zone) {
      const str = this._supStr('zoneAnchor');
      if (this._isPlayerInZone()) atkCD *= (1 - 0.3 * str);
      else atkCD *= (1 + 0.2 * str);
    }

    if (this.build.item === 'zoneCore') {
      if (!this.zone || !this._isPlayerInZone()) atkCD += 200;
      if (this.zone && this._isPlayerInZone()) dashCD -= 400;
    }

    this.player.attackCooldown = Math.max(100, Math.round(atkCD));
    this.player.dashCooldown = Math.max(400, Math.round(dashCD));
    this.player.speed = this.baseSpeed;
  }

  // ═══════════════════════════════════════════════════════════════
  // INPUT
  // ═══════════════════════════════════════════════════════════════

  private _onPointerDown(): void {
    const skill = getSkill(this.build.skill);

    if (skill.special === 'charge') {
      if (!this.isCharging && this._canAttack()) {
        this.isCharging = true;
        this.chargeStartTime = this.time.now;
      }
      return;
    }

    if (this._canAttack()) {
      this.player.markAttackUsed();
      const ptr = this.input.activePointer;
      this._performAttack(ptr.worldX, ptr.worldY, false);
    }
  }

  private _canAttack(): boolean {
    if (!this.player.canAttack()) return false;
    const ks = this.build.keystone;
    if (ks === 'stillnessStance' && this.player.isMoving) return false;
    if (ks === 'momentumMode' && !this.player.isMoving) return false;
    return true;
  }

  private _updateCharge(): void {
    this.chargeGraphics.clear();
    if (!this.isCharging) return;

    const elapsed = this.time.now - this.chargeStartTime;
    const progress = Math.min(1, elapsed / 600);

    this.chargeGraphics.lineStyle(3, 0xffaa00, 0.6);
    this.chargeGraphics.strokeCircle(this.player.x, this.player.y, 20 + progress * 40);

    if (elapsed >= 600) {
      this.isCharging = false;
      this.player.markAttackUsed();
      const ptr = this.input.activePointer;
      this._performAttack(ptr.worldX, ptr.worldY, true);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // COMMAND AURA & TACTICAL MARK
  // ═══════════════════════════════════════════════════════════════

  private _updateAura(): void {
    const ks = this.build.keystone;
    const now = this.time.now;

    if (ks === 'stillnessStance') {
      if (!this.player.isMoving) {
        // Save anchor position when stopped
        this.ssAnchorX = this.player.x;
        this.ssAnchorY = this.player.y;
        this.ssAnchorUntil = now + 2000; // lingers 2s after moving
      }
      // Aura center = anchor if active, else player
      if (now < this.ssAnchorUntil) {
        this.auraCenterX = this.ssAnchorX;
        this.auraCenterY = this.ssAnchorY;
        this.auraActive = true;
      } else {
        this.auraCenterX = this.player.x;
        this.auraCenterY = this.player.y;
        this.auraActive = false;
      }
    } else if (ks === 'momentumMode') {
      this.auraCenterX = this.player.x;
      this.auraCenterY = this.player.y;
      this.auraActive = this.player.isMoving;
    } else {
      // Default: aura follows player, always active
      this.auraCenterX = this.player.x;
      this.auraCenterY = this.player.y;
      this.auraActive = true;
    }
  }

  private _updateTacticalMark(): void {
    if (!this.tacticalMarkTarget) return;
    if (!this.tacticalMarkTarget.active || this.time.now >= this.tacticalMarkUntil) {
      this.tacticalMarkTarget = null;
      this.tacticalMarkUntil = 0;
    }
  }

  private _canArcherFire(): boolean {
    const ks = this.build.keystone;

    if (ks === 'closePact') {
      // Archers fire only when commander close to an enemy
      const nearest = this._nearestEnemyDist();
      return nearest <= CLOSE_RANGE;
    }
    if (ks === 'kitingVow') {
      // Archers fire only when commander-to-mark dist >= 200
      if (this.tacticalMarkTarget && this.tacticalMarkTarget.active) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.tacticalMarkTarget.x, this.tacticalMarkTarget.y);
        return d >= 200;
      }
      // No mark → archers fire freely
      return true;
    }
    if (ks === 'stillnessStance') {
      // Archers fire only when anchor active AND mark target in anchor
      if (!this.auraActive) return false;
      if (this.tacticalMarkTarget && this.tacticalMarkTarget.active) {
        const d = Phaser.Math.Distance.Between(this.auraCenterX, this.auraCenterY, this.tacticalMarkTarget.x, this.tacticalMarkTarget.y);
        return d <= this.auraRadius;
      }
      return false;
    }
    if (ks === 'momentumMode') {
      // Archers fire only when commander is moving
      return this.player.isMoving;
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // DASH EVENTS
  // ═══════════════════════════════════════════════════════════════

  private _onDashStart(): void {
    // P7 Dash Tax: commander HP cost + attack buff
    if (this._hasSup('dashTax')) {
      this.player.hp -= 1;
      if (this.player.hp <= 0) {
        this._triggerDeath();
        return;
      }
      this.dashTaxBuffUntil = this.time.now + 1500;

      // Army effect: one unit from each squad takes 1 HP
      this._damageOneUnit('vanguard');
      this._damageOneUnit('archer');
      this._damageOneUnit('cavalry');
    }

    // I1 Blood Oath: HP cost on dash
    if (this.build.item === 'bloodOath') {
      this.player.hp -= 1;
      if (this.player.hp <= 0) {
        this._triggerDeath();
        return;
      }
    }
  }

  private _onDashEnd(): void {
    // P1 Dash-Prime: 1s window for stun/knockback
    if (this._hasSup('dashPrime')) {
      this.dashPrimeUntil = this.time.now + 1000;
      // Army effect: speed boost 1s
      this.armySpeedBoostUntil = this.time.now + 1000;
    }
  }

  private _triggerDeath(): void {
    this.gameOver = true;
    this.time.delayedCall(600, () => {
      this.scene.start('ResultScene', { survived: false, kills: this.killCount, build: this.build, elapsed: (this.time.now - this.stageStartTime) / 1000 });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ATTACK PIPELINE
  // ═══════════════════════════════════════════════════════════════

  private _performAttack(mouseX: number, mouseY: number, charged: boolean): void {
    // Tree node: commander attack blocked?
    if (this._isCommanderAttackBlocked()) return;
    // D1: mark change lockout
    if (this._hasNode('D1') && this.time.now < this.d1LockUntil) return;

    const skill = getSkill(this.build.skill);
    let arcDeg = skill.arcDeg;
    let arcRange = skill.arcRange;

    if (this.build.item === 'heavyBlade') arcRange = Math.round(arcRange * 1.2);

    if (skill.special === 'lunge') {
      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, mouseX, mouseY);
      const nx = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * 60, 0, 1920);
      const ny = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * 60, 0, 1080);
      this.player.setPosition(nx, ny);
    }

    let aimAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, mouseX, mouseY);
    const ks = this.build.keystone;

    if (ks === 'closePact') {
      const nearest = this._nearestEnemyInRange(CLOSE_RANGE);
      if (nearest) aimAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, nearest.x, nearest.y);
    }
    if (ks === 'momentumMode' && this.player.isMoving) {
      const nearest = this._nearestEnemy();
      if (nearest) aimAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, nearest.x, nearest.y);
    }

    const aimDeg = Phaser.Math.RadToDeg(aimAngle);
    const hitEnemies: EnemyBase[] = [];
    for (const e of this.enemies) {
      if (!e.active) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (dist > arcRange) continue;
      if (arcDeg >= 360) {
        hitEnemies.push(e);
      } else {
        const toEnemy = Phaser.Math.Angle.Between(this.player.x, this.player.y, e.x, e.y);
        const diff = Phaser.Math.Angle.ShortestBetween(aimDeg, Phaser.Math.RadToDeg(toEnemy));
        if (Math.abs(diff) <= arcDeg / 2) hitEnemies.push(e);
      }
    }

    for (const e of [...hitEnemies]) {
      if (!e.active) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      let dmg = this._calculateDamage(e, dist, charged);
      // B6: commander damage → 0
      if (this._hasNode('B6')) dmg = 0;
      if (dmg > 0) this.damageEnemy(e, dmg);
      if (e.active) this._applyOnHitEffects(e, dist);
    }

    if (this._hasSup('zoneAnchor')) {
      this._createZone(this.player.x, this.player.y);
    }

    this._drawArcFlash(aimAngle, arcRange, arcDeg, hitEnemies.length > 0);

    // Set tactical mark on nearest enemy
    const markCandidate = this._nearestEnemy();
    if (markCandidate) {
      // D1: mark change → 2s commander attack lockout
      if (this._hasNode('D1') && this.tacticalMarkTarget && this.tacticalMarkTarget !== markCandidate && this.tacticalMarkTarget.active) {
        this.d1LockUntil = this.time.now + 2000;
      }
      this.tacticalMarkTarget = markCandidate;
      this.tacticalMarkUntil = this.time.now + 3000;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // DAMAGE CALC
  // ═══════════════════════════════════════════════════════════════

  private _calculateDamage(enemy: EnemyBase, dist: number, charged: boolean): number {
    let mult = 1.0;
    let bonus = 0;
    const ks = this.build.keystone;

    if (charged) mult *= 3;
    if (ks === 'closePact' && dist > CLOSE_RANGE) return 0;

    if (ks === 'singleTargetOath') {
      if (this.k5LastTarget && this.k5LastTarget !== enemy && this.k5LastTarget.active) {
        mult *= 0.3;
        this.k5LastTarget.clearMarks();
        this.k5ConsecutiveHits = 0;
      }
      this.k5LastTarget = enemy;
      this.k5ConsecutiveHits++;
      if (this.k5ConsecutiveHits % 3 === 0) bonus += 5;
    }

    if (this._hasSup('finisherRule')) {
      const s = this._supStr('finisherRule');
      if (enemy.hp <= 2) bonus += Math.round(2 * s);
      else mult *= (1 - 0.3 * s);
    }

    if (this._hasSup('bufferHunter')) {
      const s = this._supStr('bufferHunter');
      if (enemy instanceof BufferEnemy) bonus += Math.round(2 * s);
      else mult *= (1 - 0.3 * s);
    }

    if (this._hasSup('farSnare') && dist <= CLOSE_RANGE) {
      mult *= (1 - 0.5 * this._supStr('farSnare'));
    }

    if (this._hasSup('commitmentLock')) {
      const s = this._supStr('commitmentLock');
      if (this.player.isMoving) mult *= (1 - 0.7 * s);
      else bonus += Math.round(2 * s);
    }

    if (this._hasSup('rhythmWindow')) {
      const s = this._supStr('rhythmWindow');
      if (this._isRhythmPowerWindow()) bonus += Math.round(1 * s);
      else mult *= (1 - 0.3 * s);
    }

    if (this._hasSup('dashTax') && this.time.now < this.dashTaxBuffUntil) {
      bonus += Math.round(2 * this._supStr('dashTax'));
    }

    if (this.build.item === 'hunterCharm' && enemy instanceof Chaser) bonus += 1;

    return Math.max(0, Math.round(1 * mult + bonus));
  }

  // ═══════════════════════════════════════════════════════════════
  // ON-HIT EFFECTS
  // ═══════════════════════════════════════════════════════════════

  private _applyOnHitEffects(enemy: EnemyBase, dist: number): void {
    if (this._hasSup('markStack')) {
      if (this.p2LastTarget && this.p2LastTarget !== enemy && this.p2LastTarget.active) {
        for (const e of this.enemies) if (e.active) e.clearMarks();
      }
      this.p2LastTarget = enemy;
      const s = this._supStr('markStack');
      if (s >= 1 || this.spawnIndex % 2 === 0) {
        enemy.addMark();
        if (enemy.markStacks >= 3) this._markExplosion(enemy);
      }
    }

    if (this._hasSup('dashPrime') && this.time.now < this.dashPrimeUntil) {
      const s = this._supStr('dashPrime');
      enemy.applyFreeze(Math.round(500 * s));
      enemy.applyKnockback(this.player.x, this.player.y, 200, 200);
      this.dashPrimeUntil = 0;
    }

    if (this._hasSup('closeShock') && dist <= CLOSE_RANGE) {
      enemy.applyFreeze(Math.round(500 * this._supStr('closeShock')));
    }

    if (this._hasSup('farSnare') && dist > CLOSE_RANGE) {
      enemy.applySlow(0.4, Math.round(1500 * this._supStr('farSnare')));
    }

    if (this.build.item === 'heavyBlade') {
      enemy.applyKnockback(this.player.x, this.player.y, 200, 200);
    }

    if (this.build.item === 'hunterCharm' && enemy instanceof Chaser) {
      enemy.applySlow(0.4, 1500);
    }

    if (this.build.keystone === 'fragilePower') {
      this.k6HealCounter++;
      if (this.k6HealCounter >= 4) {
        this.k6HealCounter = 0;
        this.player.hp = Math.min(this.player.hp + 1, this.player.maxHp);
      }
    }

    if (this.build.item === 'bloodOath') {
      this.i1HealCounter++;
      if (this.i1HealCounter >= 4) {
        this.i1HealCounter = 0;
        this.player.hp = Math.min(this.player.hp + 1, this.player.maxHp);
      }
    }
  }

  private _markExplosion(enemy: EnemyBase): void {
    const cx = enemy.x, cy = enemy.y;
    enemy.clearMarks();

    const ring = this.add.circle(cx, cy, 4, 0xff8800, 1).setDepth(5);
    this.tweens.add({
      targets: ring, scaleX: 20, scaleY: 20, alpha: 0,
      duration: 350, onComplete: () => ring.destroy(),
    });

    const nearby = this._getActiveEnemiesInRadius(cx, cy, 80);
    for (const e of nearby) {
      if (e !== enemy) this.damageEnemy(e, 2);
    }
  }

  damageEnemy(enemy: EnemyBase, amount = 1): boolean {
    if (!enemy.active) return false;
    if (enemy.takeDamage(amount)) {
      this._onEnemyKilled(enemy);
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // RHYTHM WINDOW
  // ═══════════════════════════════════════════════════════════════

  private _isRhythmPowerWindow(): boolean {
    const elapsed = this.time.now - this.rhythmCycleStart;
    const cycle = 3700;
    const phase = elapsed % cycle;
    return phase >= 3000;
  }

  // ═══════════════════════════════════════════════════════════════
  // ZONE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  private _createZone(x: number, y: number): void {
    if (this.zoneGraphic) this.zoneGraphic.destroy();
    let duration = 4000;
    if (this.build.item === 'zoneCore') duration *= 1.5;
    this.zone = { x, y, radius: 80, expiresAt: this.time.now + duration };
    this.zoneGraphic = this.add.circle(x, y, 80, 0x4488ff, 0.15).setDepth(2);
  }

  private _isPlayerInZone(): boolean {
    if (!this.zone) return false;
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, this.zone.x, this.zone.y) <= this.zone.radius;
  }

  private _updateZone(): void {
    if (this.zone && this.time.now >= this.zone.expiresAt) {
      if (this.zoneGraphic) this.zoneGraphic.destroy();
      this.zone = null;
      this.zoneGraphic = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CONTRACT & ENCOUNTER
  // ═══════════════════════════════════════════════════════════════

  private _updateContract(): void {
    if (this.contractType && this.time.now >= this.contractUntil) {
      this.contractType = null;
      this.contractChaserSpawnCount = 0;
    }
    if (this.contractType) {
      const remaining = Math.ceil((this.contractUntil - this.time.now) / 1000);
      const labels: Record<string, string> = { vanguard: '선봉 계약', archer: '궁병 계약', cavalry: '기병 계약' };
      this.contractText.setText(`${labels[this.contractType]} ${remaining}s`);
    } else {
      this.contractText.setText('');
    }
  }

  private _updateEncounter(): void {
    if (GameMode.repeat) {
      // MODE_REPEAT: 6 situation cards cycling every 12s
      this.encounterActive = false;
      const elapsed = (this.time.now - this.stageStartTime) / 1000;
      if (elapsed < 6) { this.situationText.setText(''); return; } // grace period
      const cardDuration = 12;
      const cardElapsed = elapsed - 6;
      const newIdx = Math.floor(cardElapsed / cardDuration) % 6;
      if (newIdx !== this.situationCardIdx || this.situationCardStart === 0) {
        this.situationCardIdx = newIdx;
        this.situationCardStart = this.time.now;
      }
      const remaining = Math.ceil(cardDuration - (cardElapsed % cardDuration));
      const CARD_NAMES = ['후열 위협', '요격 테스트', '버퍼 압박', '전열 붕괴', '정지 유도', '이동 유도'];
      this.situationText.setText(`상황: ${CARD_NAMES[this.situationCardIdx]} ${remaining}s`);

      // Apply card effects (integrated into targeting/spawning via situationCardIdx)
      // Card 0: 후열 위협 → encounterActive (chasers target archers)
      if (this.situationCardIdx === 0) this.encounterActive = true;
      return;
    }

    // MODE_CORE: single event 32s-42s "후열 노출"
    const elapsed = (this.time.now - this.stageStartTime) / 1000;
    const wasActive = this.encounterActive;
    this.encounterActive = elapsed >= 32 && elapsed < 42;

    // Buffer killed during encounter → end early
    if (this.encounterActive && wasActive) {
      const bufferAlive = this.enemies.some(e => e.active && e instanceof BufferEnemy);
      if (!bufferAlive && elapsed > 33) {
        this.encounterActive = false;
      }
    }

    if (this.encounterActive) {
      const remaining = Math.ceil(42 - elapsed);
      this.encounterText.setText(`후열 노출 ${remaining}s`);
    } else {
      this.encounterText.setText('');
    }
    this.situationText.setText('');
  }

  // ═══════════════════════════════════════════════════════════════
  // COMMITTED DIRECTION & ANCHOR POS
  // ═══════════════════════════════════════════════════════════════

  private _updateCommittedDir(): void {
    // Freeze committedDir during reform
    if (this.reformActive) {
      this.committedDirX = this.reformFrozenDirX;
      this.committedDirY = this.reformFrozenDirY;
      this.committedPendingSince = 0;
      return;
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
    const now = this.time.now;

    // Speed < 10: maintain current committed
    if (speed < 10) {
      this.committedPendingSince = 0;
      return;
    }

    // Desired direction from velocity
    const dx = body.velocity.x / speed;
    const dy = body.velocity.y / speed;

    // Angle between committed and desired
    const dot = this.committedDirX * dx + this.committedDirY * dy;
    const clampedDot = Math.min(1, Math.max(-1, dot));
    const angleDeg = Math.acos(clampedDot) * (180 / Math.PI);

    // F3: commit angle 25° instead of 35°
    const commitAngle = this._hasNode('F3') ? 25 : 35;
    if (angleDeg < commitAngle) {
      this.committedPendingSince = 0;
      return;
    }

    // In cooldown: don't update
    if (now < this.committedCooldownUntil) {
      this.committedPendingSince = 0;
      return;
    }

    // >= 35° for 0.18s → commit via slerp
    if (this.committedPendingSince === 0) {
      this.committedPendingSince = now;
      return;
    }

    if (now - this.committedPendingSince >= 180) {
      // slerp(committed, desired, 0.6)
      const t = 0.6;
      let nx = this.committedDirX * (1 - t) + dx * t;
      let ny = this.committedDirY * (1 - t) + dy * t;
      const len = Math.sqrt(nx * nx + ny * ny);
      if (len > 0) { nx /= len; ny /= len; }
      this.committedDirX = nx;
      this.committedDirY = ny;
      this.committedPendingSince = 0;
      // F3: cooldown 0.35s instead of 0.25s
      this.committedCooldownUntil = now + (this._hasNode('F3') ? 350 : 250);
    }
  }

  private _updateAnchorPos(): void {
    const dt = this.game.loop.delta / 1000;
    const px = this.player.x, py = this.player.y;

    // V: rate 8, A: rate 6, C: rate 9
    const factorV = 1 - Math.exp(-dt * 8);
    this.anchorPosV.x += (px - this.anchorPosV.x) * factorV;
    this.anchorPosV.y += (py - this.anchorPosV.y) * factorV;

    const factorA = 1 - Math.exp(-dt * 6);
    this.anchorPosA.x += (px - this.anchorPosA.x) * factorA;
    this.anchorPosA.y += (py - this.anchorPosA.y) * factorA;

    const factorC = 1 - Math.exp(-dt * 9);
    this.anchorPosC.x += (px - this.anchorPosC.x) * factorC;
    this.anchorPosC.y += (py - this.anchorPosC.y) * factorC;
  }

  private _updateFlag(): void {
    let penetrating = false;
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (Phaser.Math.Distance.Between(e.x, e.y, this.flagX, this.flagY) <= 40) {
        penetrating = true;
        break;
      }
    }

    if (penetrating) {
      this.flagPenetrationTime += this.game.loop.delta;
      if (this.flagGraphic) this.flagGraphic.setFillStyle(0xff4444, 0.3);
    } else {
      this.flagPenetrationTime = Math.max(0, this.flagPenetrationTime - this.game.loop.delta * 0.5);
      if (this.flagGraphic) this.flagGraphic.setFillStyle(0xffaa00, 0.2);
    }

    // FLAG HUD warning
    if (this.flagPenetrationTime > 0) {
      const pen = Math.min(2, this.flagPenetrationTime / 1000);
      this.flagPenText.setText(`FLAG 침투 ${pen.toFixed(1)}s/2.0s`);
    } else {
      this.flagPenText.setText('');
    }

    // 2s cumulative penetration → one archer takes damage
    if (this.flagPenetrationTime >= 2000) {
      this.flagPenetrationTime = 0;
      this._damageOneUnit('archer');
    }
  }

  private _updateCameraZoom(): void {
    // Tactical zoom when enemies near FLAG
    let enemiesNearFlag = 0;
    for (const e of this.enemies) {
      if (e.active && Phaser.Math.Distance.Between(e.x, e.y, this.flagX, this.flagY) <= 200) {
        enemiesNearFlag++;
      }
    }
    this.cameraTargetZoom = enemiesNearFlag >= 3 ? 0.90 : 1.0;

    // Ease toward target
    const dt = this.game.loop.delta / 1000;
    const easeRate = 4; // ~0.25s
    this.cameraZoom += (this.cameraTargetZoom - this.cameraZoom) * (1 - Math.exp(-dt * easeRate));
    this.cameras.main.setZoom(this.cameraZoom);
  }

  // ═══════════════════════════════════════════════════════════════
  // ARMY SYSTEM
  // ═══════════════════════════════════════════════════════════════

  private _createArmy(): void {
    const ks = this.build.keystone;
    const types: Array<{ type: SquadType; count: number }> = [
      { type: 'vanguard', count: 8 },
      { type: 'archer', count: 8 },
      { type: 'cavalry', count: 4 },
    ];

    for (const { type, count } of types) {
      for (let i = 0; i < count; i++) {
        const u = new ArmyUnit(this, this.player.x, this.player.y, type);
        // fragilePower: reduce squad HP instead (handled at squad level)
        this.armyUnits.push(u);
      }
    }

    if (this.build.item === 'calmMind') {
      for (const u of this.armyUnits) u.atkCD = Math.round(u.atkCD * 0.8);
    }
    if (this.build.item === 'sprintBoots') {
      for (const u of this.armyUnits) u.unitSpeed = Math.round(u.unitSpeed * 1.2);
    }
  }

  private _buildRules(): GameRules {
    const now = this.time.now;
    const ks = this.build.keystone;
    let speedMult = 1;
    if (ks === 'momentumMode') speedMult = this.player.isMoving ? 1.5 : 0.5;
    if (now < this.armySpeedBoostUntil) speedMult *= 1.5;

    return {
      hasNode: (id) => this._hasNode(id),
      hasSup: (id) => this._hasSup(id),
      keystone: ks,
      item: this.build.item,
      now,
      speedMult,
      armyAttackOff: this._isArmyAttackSuppressed(),
      archerFireOff: this._isArcherFireSuppressed(),
      canArcherFire: this._canArcherFire(),
      isVolleyOpen: this._isVolleyWindowOpen(),
      isReforming: this.reformActive,
      reformStartTime: this.reformStartTime,
      player: { x: this.player.x, y: this.player.y, isMoving: this.player.isMoving },
      flag: { x: this.flagX, y: this.flagY },
      dir: this.reformActive
        ? { x: this.reformFrozenDirX, y: this.reformFrozenDirY }
        : { x: this.committedDirX, y: this.committedDirY },
      mark: this.tacticalMarkTarget,
      aura: { active: this.auraActive, cx: this.auraCenterX, cy: this.auraCenterY, r: this.auraRadius },
      anchorV: this.anchorPosV,
      k5Target: (this.k5LastTarget && this.k5LastTarget.active) ? this.k5LastTarget : null,
      d4Active: this._hasNode('D4') && now < this.d4BuffUntil,
      vanguardLowHp: this._isVanguardLowHp(),
      archerFired: this.archerFiredThisWindow,
      getAttackCD: (u) => this._getArmyAttackCD(u),
    };
  }

  private _groupUnitsByType(): Record<SquadType, ArmyUnit[]> {
    const groups: Record<SquadType, ArmyUnit[]> = { vanguard: [], archer: [], cavalry: [] };
    for (const u of this.armyUnits) {
      if (!u.active) continue;
      groups[u.squadType].push(u);
    }
    return groups;
  }

  private _updateArmy(): void {
    const rules = this._buildRules();
    const grouped = this._groupUnitsByType();

    POLICIES.vanguard.computeSlots(grouped.vanguard, this.anchorPosV, rules);
    POLICIES.archer.computeSlots(grouped.archer, this.anchorPosA, rules);
    POLICIES.cavalry.computeSlots(grouped.cavalry, this.anchorPosC, rules);

    let unitIdx = 0;
    for (const u of this.armyUnits) {
      if (!u.active) continue;
      const squad = u.squadType;
      const myIdx = unitIdx++;

      // Squad death-reform (existing 10s timer) check
      if (rules.now < this.squadReformUntil[squad]) {
        moveToSlot(u, rules.speedMult, rules);
        u.state = 'FORMING';
        continue;
      }

      // Cavalry interception override: 420px return radius when dashing dasher nearby
      let effectiveReturn = u.returnRadius;
      // Reduce returnRadius 30% during reform
      if (rules.isReforming) effectiveReturn *= 0.7;
      if (squad === 'cavalry' && !u.isReturning) {
        for (const e of this.enemies) {
          if (e.active && e instanceof Dasher && (e as Dasher).isDashing()) {
            if (Phaser.Math.Distance.Between(u.slotX, u.slotY, e.x, e.y) <= 420) {
              effectiveReturn = 420;
              break;
            }
          }
        }
      }

      const distToSlot = Phaser.Math.Distance.Between(u.x, u.y, u.slotX, u.slotY);

      // STATE_A: FORMING — beyond returnRadius
      if (distToSlot > effectiveReturn || u.isReturning) {
        u.state = 'FORMING';
        moveToSlot(u, rules.speedMult, rules);
        if (distToSlot < 20) u.isReturning = false;
        continue;
      }

      // Army attack suppression
      if (rules.armyAttackOff) {
        u.state = 'HOLD';
        moveToSlot(u, rules.speedMult, rules);
        continue;
      }

      const policy = POLICIES[squad];
      const target = policy.getTarget(u, this.enemies, rules);
      const atkTarget = policy.behave(u, target, distToSlot, rules, myIdx);

      if (atkTarget) {
        this._armyUnitAttack(u, atkTarget);
        u.nextAtk = rules.now + rules.getAttackCD(u);
        if (squad === 'archer') this.archerFiredThisWindow.add(u);
      }
    }

    this._applySeparationForce();
  }

  private _applySeparationForce(): void {
    const SEP_DIST = 20;
    const SEP_FORCE = 25; // weaker than slot spring to preserve line shape
    for (let i = 0; i < this.armyUnits.length; i++) {
      const a = this.armyUnits[i];
      if (!a.active) continue;
      for (let j = i + 1; j < this.armyUnits.length; j++) {
        const b = this.armyUnits[j];
        if (!b.active) continue;
        // Archers only repel same squad (prevent being pushed forward)
        if (a.squadType === 'archer' || b.squadType === 'archer') {
          if (a.squadType !== b.squadType) continue;
        }
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < SEP_DIST && dist > 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          const push = (SEP_DIST - dist) / SEP_DIST * SEP_FORCE;
          a.x += nx * push * 0.016;
          a.y += ny * push * 0.016;
          b.x -= nx * push * 0.016;
          b.y -= ny * push * 0.016;
        }
      }
    }
  }

  private _getArmyAttackCD(u: ArmyUnit): number {
    let cd = u.atkCD;
    // P3 zone-anchor / I8 zone-core: -30% in zone
    if ((this._hasSup('zoneAnchor') || this.build.item === 'zoneCore') && this.zone) {
      if (Phaser.Math.Distance.Between(u.x, u.y, this.zone.x, this.zone.y) <= this.zone.radius) {
        cd *= 0.7;
      }
    }
    return Math.round(cd);
  }

  private _armyUnitAttack(unit: ArmyUnit, target: EnemyBase): void {
    // C6: cavalry can't attack (intercept only)
    if (this._hasNode('C6') && unit.squadType === 'cavalry') return;
    let dmg = unit.dmg;

    // P4 Rhythm Window: +1 during power window
    if (this._hasSup('rhythmWindow') && this._isRhythmPowerWindow()) {
      dmg += Math.round(1 * this._supStr('rhythmWindow'));
    }
    // P5 Finisher Rule: +1 to low HP
    if (this._hasSup('finisherRule') && target.hp <= 1) {
      dmg += Math.round(1 * this._supStr('finisherRule'));
    }
    // P10 Commitment Lock: +1 when commander still
    if (this._hasSup('commitmentLock') && !this.player.isMoving) {
      dmg += Math.round(1 * this._supStr('commitmentLock'));
    }
    // P7 Dash Tax buff: +1 after dash
    if (this._hasSup('dashTax') && this.time.now < this.dashTaxBuffUntil) {
      dmg += Math.round(1 * this._supStr('dashTax'));
    }
    // I6 Hunter Charm: +1 vs Chasers
    if (this.build.item === 'hunterCharm' && target instanceof Chaser) dmg += 1;

    // P2 Mark-Stack: army attacks add mark
    if (this._hasSup('markStack')) {
      target.addMark();
      if (target.markStacks >= 3) this._markExplosion(target);
    }

    // P8 Close Shock: vanguard stun
    if (this._hasSup('closeShock') && unit.squadType === 'vanguard') {
      target.applyFreeze(Math.round(300 * this._supStr('closeShock')));
    }
    // P9 Far Snare: archer slow
    if (this._hasSup('farSnare') && unit.squadType === 'archer') {
      target.applySlow(0.4, Math.round(1000 * this._supStr('farSnare')));
    }
    // I4 Heavy Blade: vanguard knockback
    if (this.build.item === 'heavyBlade' && unit.squadType === 'vanguard') {
      target.applyKnockback(unit.x, unit.y, 150, 150);
    }

    // A5: vanguard first hit = slow instead of damage
    if (this._hasNode('A5') && unit.squadType === 'vanguard') {
      if (!this.a5FirstHitMap.has(target)) {
        this.a5FirstHitMap.set(target, true);
        target.applySlow(0.3, 1000);
        dmg = 0;
      }
    }

    // D3: mark alive = other kills have no effect (suppress damage to non-marked)
    if (this._hasNode('D3') && this.tacticalMarkTarget && this.tacticalMarkTarget.active && target !== this.tacticalMarkTarget) {
      dmg = 0;
    }

    // Apply damage
    if (dmg > 0 && this.damageEnemy(target, dmg)) {
      this.armyKillCount++;
      // I1 Blood Oath: 4 army kills → restore unit
      if (this.build.item === 'bloodOath' && this.armyKillCount >= 4) {
        this.armyKillCount = 0;
        this._restoreArmyUnit();
      }
      // D4: mark target killed → archer priority shift 3s
      if (this._hasNode('D4') && target === this.tacticalMarkTarget) {
        this.d4BuffUntil = this.time.now + 3000;
      }
      // D6: mark target first hit → start 2s forced exit timer
      if (this._hasNode('D6') && target === this.tacticalMarkTarget && !this.d6ExecTargets.has(target)) {
        this.d6ExecTargets.set(target, this.time.now);
      }
    }

    if (unit.squadType === 'vanguard' && target.active) {
      const pop = this.add.circle(target.x, target.y, 8, COLOR.vanguard, 0.7).setDepth(7);
      this.tweens.add({ targets: pop, scaleX: 2, scaleY: 2, alpha: 0, duration: 80, onComplete: () => pop.destroy() });
    }

    if (unit.squadType === 'archer') {
      const flash = this.add.circle(unit.x, unit.y, 5, COLOR.archer, 0.8).setDepth(7);
      this.tweens.add({ targets: flash, alpha: 0, scaleX: 2, scaleY: 2, duration: 100, onComplete: () => flash.destroy() });
      this._spawnArrowVisual(unit.x, unit.y, target.x, target.y);

      // B5: arrow hit = 1s pull toward FLAG
      if (this._hasNode('B5') && target.active) {
        const angle = Phaser.Math.Angle.Between(target.x, target.y, this.flagX, this.flagY);
        target.applyKnockback(target.x - Math.cos(angle) * 100, target.y - Math.sin(angle) * 100, 60, 1000);
      }
    }

    if (unit.squadType === 'cavalry') {
      const pop = this.add.circle(target.x, target.y, 8, COLOR.cavalry, 0.7).setDepth(7);
      this.tweens.add({ targets: pop, scaleX: 2, scaleY: 2, alpha: 0, duration: 80, onComplete: () => pop.destroy() });
    }
  }

  private _restoreArmyUnit(): void {
    // Find the first dead unit across all types and revive it, or heal the most damaged alive unit
    // Priority: revive dead > heal damaged
    const dead = this.armyUnits.find(u => !u.active);
    if (dead) {
      dead.hp = dead.maxHp;
      dead.setActive(true).setVisible(true);
      if (dead.body) (dead.body as Phaser.Physics.Arcade.Body).enable = true;
      dead.setAlpha(1);
      return;
    }
    // All alive: heal most damaged
    let worst: ArmyUnit | null = null;
    let worstRatio = Infinity;
    for (const u of this.armyUnits) {
      if (!u.active) continue;
      const r = u.hp / u.maxHp;
      if (r < worstRatio) { worstRatio = r; worst = u; }
    }
    if (worst) worst.hp = Math.min(worst.maxHp, worst.hp + 1);
  }

  private _spawnArmyUnit(type: SquadType): void {
    const maxCounts = { vanguard: 12, archer: 12, cavalry: 6 };
    const current = this.armyUnits.filter(u => u.active && u.squadType === type).length;
    if (current >= maxCounts[type]) return;
    const u = new ArmyUnit(this, this.player.x, this.player.y, type);
    if (this.build.item === 'calmMind') u.atkCD = Math.round(u.atkCD * 0.8);
    if (this.build.item === 'sprintBoots') u.unitSpeed = Math.round(u.unitSpeed * 1.2);
    this.armyUnits.push(u);
  }

  // ═══════════════════════════════════════════════════════════════
  // CAVALRY INTERCEPTION
  // ═══════════════════════════════════════════════════════════════

  private _checkCavalryInterception(): void {
    for (const u of this.armyUnits) {
      if (!u.active || u.squadType !== 'cavalry') continue;
      for (const e of this.enemies) {
        if (!e.active || !(e instanceof Dasher) || !e.isDashing()) continue;
        const dist = Phaser.Math.Distance.Between(u.x, u.y, e.x, e.y);
        if (dist < 30) {
          (e as Dasher).stopDash();
          if (e.takeDamage(1)) this._onEnemyKilled(e);

          // Intercept visual
          const g = this.add.graphics().setDepth(7);
          g.lineStyle(3, COLOR.cavalry, 0.8);
          g.lineBetween(u.x, u.y, e.x, e.y);
          this.tweens.add({ targets: g, alpha: 0, duration: 150, onComplete: () => g.destroy() });

          // REPEAT cavalry contract bonus: extra stagger + nearby chaser freeze
          if (GameMode.repeat && this.contractType === 'cavalry' && this.time.now < this.contractUntil) {
            e.applyFreeze(200); // +0.2s stagger
            for (const c of this.enemies) {
              if (c.active && c instanceof Chaser && Phaser.Math.Distance.Between(e.x, e.y, c.x, c.y) < 120) {
                c.applyFreeze(600); // 0.6s pause
              }
            }
          }

          // C5: cavalry dies but dasher gets 2s stun
          if (this._hasNode('C5')) {
            this._damageUnit(u, 999); // kill cavalry
            e.applyFreeze(2000);
          } else {
            // Damage the intercepting cavalry unit
            this._damageUnit(u, 1);
          }

          // C4: intercept → 1s squad slot realign
          if (this._hasNode('C4')) {
            for (const au of this.armyUnits) {
              if (au.active) au.isReturning = true;
            }
          }

          // C6: intercept → back channel 2s seal
          if (this._hasNode('C6')) {
            this.c6BackSealUntil = this.time.now + 2000;
          }

          if (u.active) u.isReturning = true;
          break;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ENEMY vs ARMY COLLISION
  // ═══════════════════════════════════════════════════════════════

  private _checkEnemyArmyCollision(): void {
    for (const e of this.enemies) {
      if (!e.active) continue;

      if (e instanceof Dasher && e.isDashing()) {
        for (const u of this.armyUnits) {
          if (!u.active) continue;
          if (Phaser.Math.Distance.Between(e.x, e.y, u.x, u.y) < 24) {
            let dmg = 1;
            if (this.build.item === 'ironSkin' && !this.player.isMoving) dmg = 0;
            if (dmg > 0) {
              this._damageUnit(u, dmg);
              if (u.active) { u.setAlpha(0.4); this.time.delayedCall(100, () => { if (u.active) u.setAlpha(1); }); }
            }
            (e as Dasher).stopDash();
            break;
          }
        }
        continue;
      }

      if (e instanceof Chaser) {
        for (const u of this.armyUnits) {
          if (!u.active) continue;
          if (Phaser.Math.Distance.Between(e.x, e.y, u.x, u.y) < 24) {
            let dmg = 1;
            if (this.build.item === 'ironSkin' && !this.player.isMoving) dmg = 0;
            if (dmg > 0) {
              this._damageUnit(u, dmg);
              if (u.active) { u.setAlpha(0.4); this.time.delayedCall(100, () => { if (u.active) u.setAlpha(1); }); }
            }
            break;
          }
        }
      }
    }
  }

  /** Damage a specific unit. If it dies, deactivate it. If all of that type are dead → reform. */
  private _damageUnit(unit: ArmyUnit, amount: number): void {
    const type = unit.squadType;
    const now = this.time.now;
    if (now < this.squadProtectUntil[type]) return;
    if (now < this.squadReformUntil[type]) return;

    unit.hp = Math.max(0, unit.hp - amount);

    if (unit.hp <= 0) {
      unit.setActive(false).setVisible(false);
      (unit.body as Phaser.Physics.Arcade.Body)?.enable && ((unit.body as Phaser.Physics.Arcade.Body).enable = false);
    }

    // Check if all units of this type are dead → enter reform
    const alive = this.armyUnits.filter(u => u.active && u.squadType === type);
    if (alive.length === 0) {
      this.squadReformUntil[type] = now + 10000;
    }

    // B4: archer damaged → back channel 2s seal
    if (this._hasNode('B4') && type === 'archer') {
      this.b4BackSealUntil = now + 2000;
    }

    // Flash effect
    const flash = this.add.rectangle(unit.x, unit.y, 16, 16, 0xff4444, 0.8).setDepth(7);
    this.tweens.add({ targets: flash, alpha: 0, scaleX: 2, scaleY: 2, duration: 200, onComplete: () => flash.destroy() });
  }

  /** Pick a frontmost alive unit of the given type and damage it. */
  private _damageOneUnit(type: SquadType): void {
    const now = this.time.now;
    if (now < this.squadProtectUntil[type]) return;
    if (now < this.squadReformUntil[type]) return;

    // Pick the closest unit to the front (closest to enemies / furthest along committedDir)
    const alive = this.armyUnits.filter(u => u.active && u.squadType === type);
    if (alive.length === 0) return;

    // Default: pick first alive unit (they're in slot order)
    this._damageUnit(alive[0], 1);
  }

  private _updateSquadReform(): void {
    const now = this.time.now;
    for (const type of ['vanguard', 'archer', 'cavalry'] as SquadType[]) {
      if (this.squadReformUntil[type] > 0 && now >= this.squadReformUntil[type]) {
        this.squadReformUntil[type] = 0;
        this.squadProtectUntil[type] = now + 2000;
        // Revive all dead units of this type with 1 HP
        for (const u of this.armyUnits) {
          if (u.squadType === type && !u.active) {
            u.hp = 1;
            u.setActive(true).setVisible(true);
            if (u.body) (u.body as Phaser.Physics.Arcade.Body).enable = true;
            u.setAlpha(1);
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // REINFORCEMENT
  // ═══════════════════════════════════════════════════════════════

  private _checkReinforcement(): void {
    if (this.reinfIdx >= this.reinfTimes.length) return;
    const elapsed = (this.time.now - this.stageStartTime) / 1000;
    if (elapsed >= this.reinfTimes[this.reinfIdx]) {
      this.reinfIdx++;
      this._showReinforcementUI();
    }
  }

  private _showReinforcementUI(): void {
    this.reinfPaused = true;
    this.physics.pause();

    const W = this.scale.width;
    const H = this.scale.height;

    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setDepth(20000).setScrollFactor(0);
    const title = this.add.text(W / 2, H / 2 - 80, '증원 선택', {
      fontSize: '36px', color: '#ffaa00', fontFamily: 'Courier New',
    }).setOrigin(0.5).setDepth(20001).setScrollFactor(0);

    const vCount = this.armyUnits.filter(u => u.active && u.squadType === 'vanguard').length;
    const aCount = this.armyUnits.filter(u => u.active && u.squadType === 'archer').length;
    const cCount = this.armyUnits.filter(u => u.active && u.squadType === 'cavalry').length;

    const choices: SquadType[] = ['vanguard', 'archer', 'cavalry'];
    const coreDescs: Record<string, string> = {
      vanguard: 'Chaser→선봉 유도',
      archer: '매3Chaser→궁병',
      cavalry: 'Dasher↑ max2',
    };
    const repeatDescs: Record<string, string> = {
      vanguard: 'Chaser→선봉+Dasher텔레15%↓',
      archer: 'Buffer앞당김+매3Chaser→궁병',
      cavalry: 'Dasher↑+요격보너스',
    };
    const descs = GameMode.repeat ? repeatDescs : coreDescs;
    const labels = [
      `선봉 +1 (${vCount}명)\n${descs.vanguard}`,
      `궁병 +1 (${aCount}명)\n${descs.archer}`,
      `기병 +1 (${cCount}명)\n${descs.cavalry}`,
    ];
    const colors = ['#4488ff', '#88ff44', '#ffdd44'];
    const buttons: Phaser.GameObjects.Text[] = [];

    for (let i = 0; i < 3; i++) {
      const btn = this.add.text(W / 2 - 220 + i * 220, H / 2 + 20, labels[i], {
        fontSize: '26px', color: colors[i], fontFamily: 'Courier New',
        backgroundColor: '#1a1a1a', padding: { x: 16, y: 12 },
      }).setOrigin(0.5).setDepth(20001).setScrollFactor(0).setInteractive({ useHandCursor: true });

      btn.on('pointerdown', () => {
        this._spawnArmyUnit(choices[i]);
        // Reinforce: revive up to 2 dead units of this type
        let revived = 0;
        for (const u of this.armyUnits) {
          if (u.squadType === choices[i] && !u.active && revived < 2) {
            u.hp = u.maxHp;
            u.setActive(true).setVisible(true);
            if (u.body) (u.body as Phaser.Physics.Arcade.Body).enable = true;
            u.setAlpha(1);
            revived++;
          }
        }
        // Activate contract
        this.contractType = choices[i];
        this.contractUntil = this.time.now + 18000;
        overlay.destroy();
        title.destroy();
        for (const b of buttons) b.destroy();
        this.physics.resume();
        this.reinfPaused = false;
      });
      btn.on('pointerover', () => btn.setColor('#ffffff'));
      btn.on('pointerout', () => btn.setColor(colors[i]));
      buttons.push(btn);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PASSIVE TREE NODE EFFECTS (per-frame)
  // ═══════════════════════════════════════════════════════════════

  private _updateTreeNodes(): void {
    if (this.activeNodes.size === 0) return;
    const now = this.time.now;
    const dt = this.game.loop.delta;
    const p = this.player;

    // ── E1: 이동 전투 금지 — moving → army attack OFF ──
    // (checked inline in _updateArmy attack logic)

    // ── F1: 정지 전투 금지 — speed <10 → army attack OFF ──
    // (checked inline in _updateArmy attack logic)

    // ── E4: 정지 유도 보상 — 2s still → weaken flank 4s ──
    if (this._hasNode('E4')) {
      if (!p.isMoving) {
        this.e4StillTimer += dt;
        if (this.e4StillTimer >= 2000) {
          this.e4StillTimer = 0;
          this.e4WeakenUntil = now + 4000;
        }
      } else {
        this.e4StillTimer = 0;
      }
    }

    // ── E5: 정지 해제 페널티 — after stop, 1s no archer fire ──
    if (this._hasNode('E5') && p.isMoving && !p.isDashing) {
      // Started moving → lock archers
      this.e5MoveLockUntil = now + 1000;
    }

    // ── F5: 역주행 금지 — moving against committedDir >1s → clamp ──
    if (this._hasNode('F5') && p.isMoving) {
      const body = p.body as Phaser.Physics.Arcade.Body;
      const vx = body.velocity.x, vy = body.velocity.y;
      const len = Math.sqrt(vx * vx + vy * vy);
      if (len > 10) {
        const dot = (vx / len) * this.committedDirX + (vy / len) * this.committedDirY;
        if (dot < -0.5) {
          this.f5BackDirTimer += dt;
          if (this.f5BackDirTimer > 1000) {
            // Clamp: remove backward component
            body.setVelocity(
              vx - (vx / len) * dot * len * 0.8,
              vy - (vy / len) * dot * len * 0.8,
            );
          }
        } else {
          this.f5BackDirTimer = 0;
        }
      }
    } else if (this._hasNode('F5')) {
      this.f5BackDirTimer = 0;
    }

    // ── A6: 철벽 교리 — outside FLAG 260px → commander can't attack ──
    // (checked in attack pipeline)

    // ── F6: 유격 교리 — inside FLAG 260px → commander can't attack ──
    // (checked in attack pipeline)

    // ── E6: 성채 교리 — disable dash + still → back seal ──
    if (this._hasNode('E6')) {
      if (!p.isMoving) {
        this.e6BackSealUntil = now + 500;
      }
    }

    // ── F6: 유격 교리 — outside FLAG 260px → back seal ──
    if (this._hasNode('F6')) {
      const dist = Phaser.Math.Distance.Between(p.x, p.y, this.flagX, this.flagY);
      if (dist > 260) {
        this.f6BackSealUntil = now + 500;
      }
    }

    // ── D6: 집행 교리 — forced exit timer on marked targets ──
    if (this._hasNode('D6')) {
      for (const [enemy, startTime] of this.d6ExecTargets) {
        if (!enemy.active) { this.d6ExecTargets.delete(enemy); continue; }
        if (now - startTime >= 2000) {
          // Force exit: kill the enemy
          if (enemy.active) {
            enemy.takeDamage(999);
            this._onEnemyKilled(enemy);
          }
          this.d6ExecTargets.delete(enemy);
        }
      }
    }
  }

  /** Check if army attacks are globally suppressed by tree nodes. */
  private _isArmyAttackSuppressed(): boolean {
    // E1: moving → army OFF
    if (this._hasNode('E1') && this.player.isMoving) return true;
    // F1: speed <10 → army OFF
    if (this._hasNode('F1')) {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      const spd = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
      if (spd < 10) return true;
    }
    // D6: no mark → army OFF
    if (this._hasNode('D6') && !this.tacticalMarkTarget) return true;
    return false;
  }

  /** Check if commander attack is blocked by tree nodes. */
  private _isCommanderAttackBlocked(): boolean {
    // A6: outside FLAG 260px
    if (this._hasNode('A6')) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.flagX, this.flagY);
      if (dist > 260) return true;
    }
    // F6: inside FLAG 260px
    if (this._hasNode('F6')) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.flagX, this.flagY);
      if (dist <= 260) return true;
    }
    // B6: commander deal 0 (handled as damage 0, not blocked)
    // D1: mark change lockout (checked separately)
    return false;
  }

  /** Check if archer fire is suppressed by tree nodes right now. */
  private _isArcherFireSuppressed(): boolean {
    // E5: 1s after stopping
    if (this._hasNode('E5') && this.time.now < this.e5MoveLockUntil) return true;
    // F2: stationary → archers OFF
    if (this._hasNode('F2') && !this.player.isMoving) return true;
    return false;
  }

  /** Check if a back channel spawn is sealed by any tree node. */
  private _isBackChannelSealed(): boolean {
    const now = this.time.now;
    if (this._hasNode('B4') && now < this.b4BackSealUntil) return true;
    if (this._hasNode('C6') && now < this.c6BackSealUntil) return true;
    if (this._hasNode('E6') && now < this.e6BackSealUntil) return true;
    if (this._hasNode('F6') && now < this.f6BackSealUntil) return true;
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // REFORM
  // ═══════════════════════════════════════════════════════════════

  private _showReformFlash(): void {
    const W = this.scale.width;
    const flash = this.add.text(W / 2, 130, '재정렬!', {
      fontSize: '24px', color: '#00ff88', fontFamily: 'Courier New',
    }).setOrigin(0.5).setDepth(10000).setScrollFactor(0);
    this.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });
  }

  private _checkReformFrontlineBonus(): void {
    // Vanguard 4+ in formation range → frontLineIntact + flank spawn delay
    const vUnits = this.armyUnits.filter(u => u.active && u.squadType === 'vanguard');
    let inFormation = 0;
    for (const u of vUnits) {
      const d = Phaser.Math.Distance.Between(u.x, u.y, u.slotX, u.slotY);
      if (d < 60) inFormation++;
    }
    if (inFormation >= 4) {
      this.frontLineIntact = true;
    }
  }

  private _updateReformIndicator(): void {
    const D = 10000;
    if (this.player.isHoldingShift()) {
      const holdMs = this.player.getShiftHoldMs(this.time.now);
      if (!this.reformIndicator) {
        this.reformIndicator = this.add.text(this.scale.width / 2, 110, '', {
          fontSize: '20px', color: '#888888', fontFamily: 'Courier New',
        }).setOrigin(0.5).setDepth(D).setScrollFactor(0);
      }
      if (holdMs < 220) {
        this.reformIndicator.setText('Reform...').setColor('#888888');
      } else {
        this.reformIndicator.setText('Reform!').setColor('#00ff88');
      }
    } else {
      if (this.reformIndicator) {
        this.reformIndicator.destroy();
        this.reformIndicator = null;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FRONT-LINE STATE
  // ═══════════════════════════════════════════════════════════════

  private _checkFrontLineState(): void {
    const vUnits = this.armyUnits.filter(u => u.active && u.squadType === 'vanguard');
    const now = this.time.now;
    const px = this.anchorPosV.x, py = this.anchorPosV.y;
    const fx = this.committedDirX, fy = this.committedDirY;

    // Count vanguards in f=+160±60 zone (forward distance 100..220)
    let inZone = 0;
    for (const u of vUnits) {
      const dx = u.x - px;
      const dy = u.y - py;
      const fwd = dx * fx + dy * fy;
      if (fwd >= 100 && fwd <= 220) inZone++;
    }

    if (inZone >= 4) {
      // 4+ vanguards in front zone — intact
      if (now >= this.frontLineCollapseUntil) {
        this.frontLineIntact = true;
      }
    } else {
      // Not enough vanguards in zone — collapsed
      if (this.frontLineIntact) {
        this.frontLineIntact = false;
        this.frontLineCollapseUntil = now + 6000;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ENEMY TARGETING (army-aware)
  // ═══════════════════════════════════════════════════════════════

  private _nearestArcherTo(enemy: EnemyBase): { x: number; y: number } | null {
    const archers = this.armyUnits.filter(u => u.active && u.squadType === 'archer');
    if (archers.length === 0) return null;
    let nearest = archers[0];
    let minD = Infinity;
    for (const a of archers) {
      const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, a.x, a.y);
      if (d < minD) { minD = d; nearest = a; }
    }
    return { x: nearest.x, y: nearest.y };
  }

  private _getEnemyTarget(enemy: EnemyBase): { x: number; y: number } {
    // Wingmen don't use this — they follow leader slots (handled in _updateEnemies)

    // C3: Dasher targets FLAG instead of commander
    if (this._hasNode('C3') && enemy instanceof Dasher) {
      return { x: this.flagX, y: this.flagY };
    }

    if (enemy instanceof Chaser) {
      // A2: chaser 1st target = vanguard (instead of commander)
      if (this._hasNode('A2')) {
        const vanguards = this.armyUnits.filter(u => u.active && u.squadType === 'vanguard');
        if (vanguards.length > 0) {
          let nearest = vanguards[0];
          let minD = Infinity;
          for (const v of vanguards) {
            const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, v.x, v.y);
            if (d < minD) { minD = d; nearest = v; }
          }
          return { x: nearest.x, y: nearest.y };
        }
      }

      // D5: mark target draws chaser aggro
      if (this._hasNode('D5') && this.tacticalMarkTarget && this.tacticalMarkTarget.active) {
        return { x: this.tacticalMarkTarget.x, y: this.tacticalMarkTarget.y };
      }

      // Front-line collapse: chasers target archers
      if (!this.frontLineIntact && this.time.now < this.frontLineCollapseUntil) {
        const t = this._nearestArcherTo(enemy);
        if (t) return t;
      }

      // Encounter event: chasers target archers
      if (this.encounterActive) {
        const t = this._nearestArcherTo(enemy);
        if (t) return t;
      }

      // Contract: vanguard contract → chasers prefer vanguard
      if (this.contractType === 'vanguard' && this.time.now < this.contractUntil) {
        const vanguards = this.armyUnits.filter(u => u.active && u.squadType === 'vanguard');
        if (vanguards.length > 0) {
          let nearest = vanguards[0];
          let minD = Infinity;
          for (const v of vanguards) {
            const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, v.x, v.y);
            if (d < minD) { minD = d; nearest = v; }
          }
          return { x: nearest.x, y: nearest.y };
        }
      }

      // Contract: archer contract → every 3rd chaser targets archers
      if (this.contractType === 'archer' && this.time.now < this.contractUntil) {
        if (this.contractChaserSpawnCount % 3 === 0) {
          const t = this._nearestArcherTo(enemy);
          if (t) return t;
        }
      }

      // Buffer aura → chasers target archers
      if (this._isChaserInBufferAura(enemy)) {
        const t = this._nearestArcherTo(enemy);
        if (t) return t;
      }

      // Vanguard engaged: target vanguard if within 100px (front-line intact only)
      if (this.frontLineIntact) {
        const vanguards = this.armyUnits.filter(u => u.active && u.squadType === 'vanguard');
        for (const v of vanguards) {
          if (Phaser.Math.Distance.Between(enemy.x, enemy.y, v.x, v.y) < 100) {
            return { x: v.x, y: v.y };
          }
        }
      }
    }

    // Leaders target FLAG
    return { x: this.flagX, y: this.flagY };
  }

  private _isChaserInBufferAura(chaser: EnemyBase): boolean {
    for (const e of this.enemies) {
      if (e instanceof BufferEnemy && e.active && e !== chaser) {
        if (Phaser.Math.Distance.Between(chaser.x, chaser.y, e.x, e.y) <= 120) return true;
      }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // ENEMY HELPERS
  // ═══════════════════════════════════════════════════════════════

  private _nearestEnemyDist(): number {
    let min = Infinity;
    for (const e of this.enemies) {
      if (!e.active) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (d < min) min = d;
    }
    return min;
  }

  private _nearestEnemyInRange(range: number): EnemyBase | null {
    let nearest: EnemyBase | null = null;
    let min = range;
    for (const e of this.enemies) {
      if (!e.active) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (d < min) { min = d; nearest = e; }
    }
    return nearest;
  }

  private _nearestEnemy(): EnemyBase | null {
    return this._nearestEnemyInRange(Infinity);
  }

  private _getActiveEnemiesInRadius(cx: number, cy: number, radius: number): EnemyBase[] {
    return this.enemies.filter(e => e.active && Phaser.Math.Distance.Between(cx, cy, e.x, e.y) <= radius);
  }

  // ═══════════════════════════════════════════════════════════════
  // SPAWNING — Channel-line platoon system
  // ═══════════════════════════════════════════════════════════════

  private _getSpawnChannel(): SpawnChannel {
    const elapsed = (this.time.now - this.stageStartTime) / 1000;
    const idx = this.spawnIndex % 20;

    // Front-line collapse: heavy flank pressure
    if (!this.frontLineIntact && this.time.now < this.frontLineCollapseUntil) {
      if (idx < 10) return 'front';
      if (idx < 15) return 'flankL';
      if (idx < 19) return 'flankR';
      return 'back';
    }

    // MODE_REPEAT card 3: 전열 붕괴 → more flanks
    if (GameMode.repeat && this.situationCardIdx === 3) {
      if (idx < 10) return 'front';
      if (idx < 14) return 'flankL';
      if (idx < 18) return 'flankR';
      return 'back';
    }

    if (!GameMode.repeat) {
      // CORE_EARLY (0-30s): F85% FL/FR15%
      if (elapsed < 30) {
        if (idx < 17) return 'front';
        return idx % 2 === 0 ? 'flankL' : 'flankR';
      }
      // CORE_LATE (30+): F70% FL/FR25% B5%
      if (idx < 14) return 'front';
      if (idx < 17) return 'flankL';
      if (idx < 19) return 'flankR';
      return 'back';
    } else {
      // REPEAT_EARLY (0-30s): F80% FL/FR20%
      if (elapsed < 30) {
        if (idx < 16) return 'front';
        return idx % 2 === 0 ? 'flankL' : 'flankR';
      }
      // REPEAT_MID (30-60s): F65% FL/FR30% B5%
      if (elapsed < 60) {
        if (idx < 13) return 'front';
        if (idx < 16) return 'flankL';
        if (idx < 19) return 'flankR';
        return 'back';
      }
      // REPEAT_LATE (60+): F55% FL/FR35% B10%
      if (idx < 11) return 'front';
      if (idx < 15) return 'flankL';
      if (idx < 18) return 'flankR';
      return 'back';
    }
  }

  private _getPlatoonType(channel: SpawnChannel): PlatoonType {
    const elapsed = (this.time.now - this.stageStartTime) / 1000;
    const isFlank = channel === 'flankL' || channel === 'flankR';

    // MODE_REPEAT situation card overrides
    if (GameMode.repeat) {
      if (this.situationCardIdx === 1 && channel === 'front') return 'dasher';
      if (this.situationCardIdx === 2) {
        if (channel === 'front') return (this.spawnIndex % 3 < 1) ? 'buffer' : 'chaser';
        if (channel === 'back') return 'buffer';
      }
      if (this.situationCardIdx === 3 && isFlank) return 'chaser';
    }

    if (channel === 'back') return 'buffer';
    if (isFlank) return (this.spawnIndex % 5 < 4) ? 'chaser' : 'dasher';

    // Front channel: time-based mix
    const roll = this.spawnIndex % 10;
    if (elapsed < 20) return roll < 8 ? 'chaser' : 'dasher';
    if (elapsed < 45) {
      if (roll < 5) return 'chaser';
      if (roll < 8) return 'dasher';
      return 'buffer';
    }
    if (roll < 4) return 'chaser';
    if (roll < 7) return 'dasher';
    return 'buffer';
  }

  /** Compute spawn position on channel line at spawnDist from anchorPos using committedDir */
  private _getSpawnLinePos(channel: SpawnChannel, lateralOffset: number): { x: number; y: number } {
    // Use vanguard anchor as reference point (front-line anchor)
    const px = this.anchorPosV.x, py = this.anchorPosV.y;
    const fx = this.committedDirX, fy = this.committedDirY;
    const rx = -fy, ry = fx;

    let dx: number, dy: number;
    switch (channel) {
      case 'front':  dx = fx;  dy = fy;  break;
      case 'flankL': dx = -rx; dy = -ry; break;
      case 'flankR': dx = rx;  dy = ry;  break;
      case 'back':   dx = -fx; dy = -fy; break;
    }

    // Channel perpendicular (for lateral spread along the line)
    const cpx = -dy, cpy = dx;

    const x = px + dx * SPAWN_DIST + cpx * lateralOffset;
    const y = py + dy * SPAWN_DIST + cpy * lateralOffset;
    return {
      x: Phaser.Math.Clamp(x, -60, 1980),
      y: Phaser.Math.Clamp(y, -60, 1140),
    };
  }

  private _spawnSingleEnemy(type: PlatoonType, x: number, y: number): EnemyBase {
    switch (type) {
      case 'dasher': {
        const d = new Dasher(this, x, y);
        if (this.build.keystone === 'momentumMode') d.windupMultiplier = 1.2;
        if (GameMode.repeat && this.contractType === 'vanguard' && this.time.now < this.contractUntil) {
          d.windupMultiplier = Math.min(d.windupMultiplier, 0.85);
        }
        return d;
      }
      case 'buffer': {
        const b = new BufferEnemy(this, x, y);
        const speed = 40 + this.rng() * 15;
        b.baseSpeed = speed;
        b.speed = speed;
        return b;
      }
      default: {
        const c = new Chaser(this, x, y);
        const speed = 65 + this.rng() * 20;
        c.baseSpeed = speed;
        c.speed = speed;
        if (this.contractType === 'archer' && this.time.now < this.contractUntil) {
          this.contractChaserSpawnCount++;
        }
        return c;
      }
    }
  }

  private _spawnPlatoon(): void {
    if (this.gameOver) return;
    const channel = this._getSpawnChannel();
    this._spawnPlatoonForChannel(channel);

    // Double platoon: Front channel always spawns 2 platoons, 0.8s apart
    if (channel === 'front' && !this.doublePlatoonPending) {
      this.doublePlatoonPending = { channel: 'front', time: this.time.now + 800 };
    }
  }

  private _spawnPlatoonForChannel(channel: SpawnChannel): void {
    if (this.gameOver) return;

    // Tree: back channel seal
    if (channel === 'back' && this._isBackChannelSealed()) {
      channel = 'front'; // redirect to front
    }

    // E4: flank weaken window → redirect flank to front
    if (this._hasNode('E4') && this.time.now < this.e4WeakenUntil && (channel === 'flankL' || channel === 'flankR')) {
      channel = 'front';
    }

    // F4: 외곽 유도 — moving → more front, still → more flank
    // (handled by channel reassignment only if node active)
    if (this._hasNode('F4') && this.player.isMoving && (channel === 'flankL' || channel === 'flankR')) {
      if (this.rng() < 0.4) channel = 'front';
    }

    let type = this._getPlatoonType(channel);

    // C2: no dasher if no alive cavalry
    if (this._hasNode('C2') && type === 'dasher') {
      const aliveCavalry = this.armyUnits.filter(u => u.active && u.squadType === 'cavalry').length;
      if (aliveCavalry === 0) type = 'chaser';
    }
    const formIdx = this.platoonFormCycle % 3;
    this.platoonFormCycle++;

    const size = PLATOON_SIZES[type];
    const tIdx = this.spawnIndex % T_SEQ.length;
    const lateralOffset = T_SEQ[tIdx];
    this.spawnIndex++;

    // Spawn leader at channel line position
    const leaderPos = this._getSpawnLinePos(channel, lateralOffset);
    const leader = this._spawnSingleEnemy(type, leaderPos.x, leaderPos.y);
    const platoonEnemies: EnemyBase[] = [leader];
    const wingmenList: EnemyBase[] = [];
    this.enemies.push(leader);

    // Approach direction (towards FLAG)
    const approachAngle = Phaser.Math.Angle.Between(leaderPos.x, leaderPos.y, this.flagX, this.flagY);
    const cosA = Math.cos(approachAngle);
    const sinA = Math.sin(approachAngle);

    // Spawn wingmen in formation
    const wingCount = size - 1;
    const offsets = WING_OFFSETS[formIdx];
    for (let i = 0; i < wingCount && i < offsets.length; i++) {
      const [lat, behind] = offsets[i];
      const wx = leaderPos.x + (-sinA * lat) + (-cosA * behind);
      const wy = leaderPos.y + (cosA * lat) + (-sinA * behind);
      const wingman = this._spawnSingleEnemy(type, wx, wy);
      platoonEnemies.push(wingman);
      wingmenList.push(wingman);
      this.enemies.push(wingman);

      // Register wingman data for slot-following
      this.wingmanData.set(wingman, { leader, latOffset: lat, behindOffset: behind });
    }

    this.platoons.push({ type, leader, wingmen: wingmenList, enemies: platoonEnemies, spawnTime: this.time.now });
  }

  private _cleanupPlatoons(): void {
    // Clean dead wingman data
    for (const [wingman] of this.wingmanData) {
      if (!wingman.active) this.wingmanData.delete(wingman);
    }
    // Also clean wingman refs to dead leaders
    for (const [wingman, data] of this.wingmanData) {
      if (!data.leader.active) this.wingmanData.delete(wingman);
    }
    this.platoons = this.platoons.filter(p => p.enemies.some(e => e.active));
  }

  // ═══════════════════════════════════════════════════════════════
  // ENEMY UPDATE (army-aware targeting)
  // ═══════════════════════════════════════════════════════════════

  private _updateEnemies(): void {
    const now = this.time.now;
    for (const e of this.enemies) {
      if (e.active) e.computeSpeed(now);
    }
    for (const e of this.enemies) {
      if (e instanceof BufferEnemy && e.active) {
        // D2: marked enemy can't receive buffer buff
        if (this._hasNode('D2') && this.tacticalMarkTarget) {
          const filtered = this.enemies.filter(en => en !== this.tacticalMarkTarget);
          e.applyAura(filtered);
        } else {
          e.applyAura(this.enemies);
        }
      }
    }
    for (const e of this.enemies) {
      if (e.active) e.computeSpeed(now);
    }
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (e.isFrozen()) { e.setVelocity(0, 0); continue; }

      // Wingman slot-following: follow leader formation slot
      const wData = this.wingmanData.get(e);
      if (wData && wData.leader.active) {
        const leader = wData.leader;
        // Compute slot from leader position + leader's movement direction
        const ldx = leader.body ? (leader.body as Phaser.Physics.Arcade.Body).velocity.x : 0;
        const ldy = leader.body ? (leader.body as Phaser.Physics.Arcade.Body).velocity.y : 0;
        const lSpeed = Math.sqrt(ldx * ldx + ldy * ldy);
        // Use leader→FLAG direction if leader not moving fast enough
        let lfx: number, lfy: number;
        if (lSpeed > 10) {
          lfx = ldx / lSpeed;
          lfy = ldy / lSpeed;
        } else {
          const toFlagAngle = Phaser.Math.Angle.Between(leader.x, leader.y, this.flagX, this.flagY);
          lfx = Math.cos(toFlagAngle);
          lfy = Math.sin(toFlagAngle);
        }
        const lrx = -lfy, lry = lfx;
        // Slot = leader + forward*(-behind) + right*(lat)
        const slotX = leader.x + lfx * (-wData.behindOffset) + lrx * wData.latOffset;
        const slotY = leader.y + lfy * (-wData.behindOffset) + lry * wData.latOffset;

        const dist = Phaser.Math.Distance.Between(e.x, e.y, slotX, slotY);
        if (dist > 5) {
          const angle = Phaser.Math.Angle.Between(e.x, e.y, slotX, slotY);
          const spd = Math.min(e.speed * 1.2, dist * 3);
          e.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
        } else {
          e.setVelocity(0, 0);
        }
        continue;
      }

      // Leader or solo enemy: normal targeting
      const target = this._getEnemyTarget(e);
      e.update(target.x, target.y);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PLAYER COLLISION
  // ═══════════════════════════════════════════════════════════════

  private _checkPlayerCollision(): void {
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y) > 24) continue;

      let hurts = false;
      let dmg = 1;
      if (e instanceof Chaser) {
        hurts = true;
        if (this.build.item === 'hunterCharm') dmg = 2;
      } else if (e instanceof Dasher) {
        hurts = e.isDashing();
      }

      if (!hurts) continue;

      // Commander hit → one vanguard takes damage (frontline failure)
      this._damageOneUnit('vanguard');

      let iframes = this.player.iframesDuration;
      if (this.build.keystone === 'stillnessStance' && !this.player.isMoving) iframes += 800;
      if (this.build.item === 'ironSkin' && !this.player.isMoving) iframes += 500;

      const savedIframes = this.player.iframesDuration;
      this.player.iframesDuration = iframes;
      const died = this.player.takeDamage(dmg);
      this.player.iframesDuration = savedIframes;

      if (died) {
        this._triggerDeath();
        return;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // KILL
  // ═══════════════════════════════════════════════════════════════

  private _onEnemyKilled(enemy: EnemyBase): void {
    if (!this.enemies.includes(enemy)) return;
    this.killCount++;
    this.killText.setText(`처치  ${this.killCount}`);
    this.enemies = this.enemies.filter(e => e !== enemy);

    const flash = this.add.rectangle(enemy.x, enemy.y, 28, 28, 0xff5555, 0.9).setDepth(7);
    this.tweens.add({ targets: flash, alpha: 0, scaleX: 2.5, scaleY: 2.5, duration: 200, onComplete: () => flash.destroy() });
  }

  // ═══════════════════════════════════════════════════════════════
  // TIMER
  // ═══════════════════════════════════════════════════════════════

  private _tickTimer(): void {
    if (this.gameOver) return;
    this.timeLeft--;
    this.timerText.setText(`${this.timeLeft}s`);
    if (this.timeLeft <= 10) this.timerText.setColor('#ff5555');
    if (this.timeLeft <= 0) {
      this.gameOver = true;
      const W = this.scale.width, H = this.scale.height;
      const msg = this.add.text(W / 2, H / 2, '스테이지 클리어!', {
        fontSize: '56px', color: '#00ff88', fontFamily: 'Courier New',
      }).setOrigin(0.5).setDepth(15000).setScrollFactor(0);
      this.tweens.add({ targets: msg, alpha: 0, y: msg.y - 50, duration: 1500 });
      this.time.delayedCall(1600, () => {
        this.scene.start('ResultScene', { survived: true, kills: this.killCount, build: this.build, elapsed: this.stageDuration });
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // VOLLEY SYSTEM
  // ═══════════════════════════════════════════════════════════════

  private _isVolleyWindowOpen(): boolean {
    const elapsed = this.time.now - this.volleyCycleStart;
    const phase = elapsed % VOLLEY_CYCLE;
    return phase < VOLLEY_WINDOW;
  }

  private _updateVolley(): void {
    const elapsed = this.time.now - this.volleyCycleStart;
    const phase = elapsed % VOLLEY_CYCLE;
    // Reset fired set at start of each window
    if (phase < VOLLEY_WINDOW && this.archerFiredThisWindow.size > 0) {
      // Check if we just entered a new cycle
      const prevPhase = (elapsed - 16) % VOLLEY_CYCLE; // rough dt
      if (prevPhase >= VOLLEY_WINDOW || prevPhase < 0) {
        this.archerFiredThisWindow.clear();
      }
    }
    if (phase >= VOLLEY_WINDOW) {
      this.archerFiredThisWindow.clear();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // GHOST UNITS (visual army scale)
  // ═══════════════════════════════════════════════════════════════

  // Ghost slots removed (default OFF — clean battle presentation)

  // ═══════════════════════════════════════════════════════════════
  // TEXTURES
  // ═══════════════════════════════════════════════════════════════

  private _createTextures(): void {
    const make = (key: string, color: number, w: number, h: number) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ add: false });
      g.fillStyle(color);
      g.fillRect(1, 1, w - 2, h - 2);
      g.generateTexture(key, w, h);
      g.destroy();
    };
    make('player',         0xffffff, 26, 26);
    make('enemy_chaser',   0xffffff, 24, 24);
    make('enemy_dasher',   0xffffff, 24, 24);
    make('enemy_buffer',   0xffffff, 24, 24);
    make('unit_vanguard',  0xffffff, 16, 16);
    make('unit_archer',    0xffffff, 16, 16);
    make('unit_cavalry',   0xffffff, 16, 16);

    if (!this.textures.exists('arrow')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xffffff);
      g.fillRect(0, 1, 12, 3);
      g.generateTexture('arrow', 12, 5);
      g.destroy();
    }
  }

  private _drawGrid(W: number, H: number): void {
    const g = this.add.graphics();
    g.lineStyle(1, 0x111111);
    for (let x = 0; x <= W; x += 90) g.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += 90) g.lineBetween(0, y, W, y);
  }

  // ═══════════════════════════════════════════════════════════════
  // UI
  // ═══════════════════════════════════════════════════════════════

  private _setupUI(W: number, H: number): void {
    const D = 10000; // UI depth (above all world objects)

    this.timerText = this.add.text(W / 2, 16, `${this.stageDuration}s`, {
      fontSize: '30px', color: '#bbbbbb', fontFamily: 'Courier New',
    }).setOrigin(0.5, 0).setDepth(D).setScrollFactor(0);

    this.killText = this.add.text(W - 20, 16, '처치  0', {
      fontSize: '22px', color: '#999999', fontFamily: 'Courier New',
    }).setOrigin(1, 0).setDepth(D).setScrollFactor(0);

    this.hpDisplay = this.add.graphics().setDepth(D).setScrollFactor(0);

    // Build label
    const ks = getKeystone(this.build.keystone);
    const sk = getSkill(this.build.skill);
    const s0 = getSupport(this.build.supports[0]);
    const s1 = getSupport(this.build.supports[1]);
    const it = getItem(this.build.item);
    const label = `${ks.label} · ${sk.label} · ${s0.label}${this.supActive[0]?'':'(약)'} · ${s1.label}${this.supActive[1]?'':'(약)'} · ${it.label}`;
    this.add.text(20, H - 18, label, {
      fontSize: '16px', color: '#666666', fontFamily: 'Courier New',
    }).setOrigin(0, 1).setDepth(D).setScrollFactor(0);

    // Squad display
    this.squadText = this.add.text(20, 50, '', {
      fontSize: '20px', color: '#888888', fontFamily: 'Courier New',
    }).setDepth(D).setScrollFactor(0);

    this.contractText = this.add.text(20, 80, '', {
      fontSize: '20px', color: '#ffaa00', fontFamily: 'Courier New',
    }).setDepth(D).setScrollFactor(0);

    this.encounterText = this.add.text(W / 2, 52, '', {
      fontSize: '22px', color: '#ff4444', fontFamily: 'Courier New',
    }).setOrigin(0.5).setDepth(D).setScrollFactor(0);

    this.situationText = this.add.text(W / 2, 76, '', {
      fontSize: '20px', color: '#ff8800', fontFamily: 'Courier New',
    }).setOrigin(0.5).setDepth(D).setScrollFactor(0);

    // FLAG penetration warning
    this.flagPenText = this.add.text(W / 2, 100, '', {
      fontSize: '20px', color: '#ff4444', fontFamily: 'Courier New',
    }).setOrigin(0.5).setDepth(D).setScrollFactor(0);

    // Tree node HUD
    const nodeLabels = this.build.nodes?.map(n => getNode(n).label).join(' · ') || '';
    this.nodeHudText = this.add.text(W - 20, 50, nodeLabels, {
      fontSize: '16px', color: '#555555', fontFamily: 'Courier New',
      wordWrap: { width: 400 },
    }).setOrigin(1, 0).setDepth(D).setScrollFactor(0);

    // Cooldown labels
    const barNames = ['공격', '대시'];
    if (this._hasSup('dashPrime')) barNames.push('프라임');
    if (this._hasSup('rhythmWindow')) barNames.push('리듬');
    if (this._hasSup('dashTax')) barNames.push('대시택스');

    const barStartX = W / 2 - (barNames.length * 130) / 2;
    const barY = H - 55;
    for (let i = 0; i < barNames.length; i++) {
      this.add.text(barStartX + i * 130, barY - 18, barNames[i], {
        fontSize: '16px', color: '#888888', fontFamily: 'Courier New',
      }).setDepth(D).setScrollFactor(0);
    }

    // Hint
    this.add.text(W / 2, H - 25, 'WASD 이동 · 좌클릭 공격 · Shift 대시/홀드 재정렬 · R 재시작 · B 빌드', {
      fontSize: '16px', color: '#444444', fontFamily: 'Courier New',
    }).setOrigin(0.5).setDepth(D).setScrollFactor(0);
  }

  private _refreshSquadDisplay(): void {
    const now = this.time.now;
    const vAll = this.armyUnits.filter(u => u.squadType === 'vanguard').length;
    const aAll = this.armyUnits.filter(u => u.squadType === 'archer').length;
    const cAll = this.armyUnits.filter(u => u.squadType === 'cavalry').length;
    const vAlive = this.armyUnits.filter(u => u.active && u.squadType === 'vanguard').length;
    const aAlive = this.armyUnits.filter(u => u.active && u.squadType === 'archer').length;
    const cAlive = this.armyUnits.filter(u => u.active && u.squadType === 'cavalry').length;
    const vR = now < this.squadReformUntil.vanguard ? '재정비' : '';
    const aR = now < this.squadReformUntil.archer ? '재정비' : '';
    const cR = now < this.squadReformUntil.cavalry ? '재정비' : '';
    this.squadText.setText(
      `선봉 ${vAlive}/${vAll} ${vR}  ` +
      `궁병 ${aAlive}/${aAll} ${aR}  ` +
      `기병 ${cAlive}/${cAll} ${cR}`
    );
  }

  private _drawCooldowns(): void {
    const g = this.cooldownGraphics;
    g.clear();
    const W = this.scale.width, H = this.scale.height;

    const bars: { ratio: number; color: number }[] = [
      { ratio: this.player.getAttackCooldownRatio(), color: COLOR.commander },
      { ratio: this.player.getDashCooldownRatio(), color: 0x88ddff },
    ];

    if (this._hasSup('dashPrime')) {
      const now = this.time.now;
      const r = now < this.dashPrimeUntil ? (this.dashPrimeUntil - now) / 1000 : 0;
      bars.push({ ratio: r, color: 0xffaa00 });
    }

    if (this._hasSup('rhythmWindow')) {
      const elapsed = this.time.now - this.rhythmCycleStart;
      const phase = elapsed % 3700;
      if (phase < 3000) {
        bars.push({ ratio: 1 - phase / 3000, color: 0x555555 });
      } else {
        bars.push({ ratio: 1 - (phase - 3000) / 700, color: 0xff44ff });
      }
    }

    if (this._hasSup('dashTax')) {
      const now = this.time.now;
      const r = now < this.dashTaxBuffUntil ? (this.dashTaxBuffUntil - now) / 1500 : 0;
      bars.push({ ratio: r, color: 0xff4444 });
    }

    const barW = 100, barH = 8;
    const barStartX = W / 2 - (bars.length * 130) / 2;
    const barY = H - 52;

    for (let i = 0; i < bars.length; i++) {
      const x = barStartX + i * 130;
      g.fillStyle(0x1a1a1a);
      g.fillRect(x, barY, barW, barH);
      const fill = bars[i].ratio;
      if (fill > 0) {
        g.fillStyle(bars[i].color, fill >= 1 ? 1 : 0.7);
        g.fillRect(x, barY, barW * fill, barH);
      }
      g.lineStyle(1, 0x333333);
      g.strokeRect(x, barY, barW, barH);
    }
  }

  private _refreshHpDisplay(): void {
    this.hpDisplay.clear();
    for (let i = 0; i < this.player.maxHp; i++) {
      this.hpDisplay.fillStyle(i < this.player.hp ? COLOR.commander : 0x1e1e1e);
      this.hpDisplay.fillRect(16 + i * 28, 18, 20, 20);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ARROW VISUALS & RANGE
  // ═══════════════════════════════════════════════════════════════

  private _spawnArrowVisual(fromX: number, fromY: number, toX: number, toY: number): void {
    const arrow = this.add.image(fromX, fromY, 'arrow').setDepth(6).setTint(COLOR.archer);
    const angle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY);
    arrow.setRotation(angle);
    const dist = Phaser.Math.Distance.Between(fromX, fromY, toX, toY);
    const speed = 1000;
    const duration = (dist / speed) * 1000;

    this.tweens.add({
      targets: arrow,
      x: toX,
      y: toY,
      duration: Math.max(50, duration),
      onComplete: () => {
        const spark = this.add.circle(toX, toY, 6, COLOR.archer, 0.8).setDepth(7);
        this.tweens.add({ targets: spark, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 100, onComplete: () => spark.destroy() });
        arrow.destroy();
      },
    });
  }

  private _updateArrows(): void {
    // Arrows are tween-based, no manual update needed
  }

  // Debug visuals removed — clean battle presentation only

  // ═══════════════════════════════════════════════════════════════
  // VISUALS
  // ═══════════════════════════════════════════════════════════════

  private _drawAimLine(): void {
    this.aimGraphics.clear();
    const { worldX, worldY } = this.input.activePointer;
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, worldX, worldY);

    // Aim direction line (world space)
    this.aimGraphics.lineStyle(2, COLOR.commander, 0.45);
    this.aimGraphics.lineBetween(
      this.player.x, this.player.y,
      this.player.x + Math.cos(angle) * 85,
      this.player.y + Math.sin(angle) * 85,
    );

    // Command Aura circle (gameplay mechanic — world space)
    const auraAlpha = this.auraActive ? 0.25 : 0.08;
    this.aimGraphics.lineStyle(1, 0xffaa00, auraAlpha);
    this.aimGraphics.strokeCircle(this.auraCenterX, this.auraCenterY, this.auraRadius);

    // Tactical Mark ring (world space)
    if (this.tacticalMarkTarget && this.tacticalMarkTarget.active) {
      this.aimGraphics.lineStyle(2, 0xff4444, 0.6);
      this.aimGraphics.strokeCircle(this.tacticalMarkTarget.x, this.tacticalMarkTarget.y, 18);
    }
  }

  private _drawArcFlash(aimAngle: number, range: number, angleDeg: number, hit: boolean): void {
    const g = this.add.graphics().setDepth(8);
    g.lineStyle(2, hit ? 0xffffff : 0x446644, hit ? 0.85 : 0.4);
    if (angleDeg >= 360) {
      g.strokeCircle(this.player.x, this.player.y, range);
    } else {
      const half = Phaser.Math.DegToRad(angleDeg / 2);
      g.beginPath();
      g.moveTo(this.player.x, this.player.y);
      g.arc(this.player.x, this.player.y, range, aimAngle - half, aimAngle + half);
      g.closePath();
      g.strokePath();
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  // ═══════════════════════════════════════════════════════════════
  // DEBUG OVERLAY (world layer, scrollFactor=1)
  // ═══════════════════════════════════════════════════════════════

  private _drawDebugOverlay(): void {
    const g = this.debugGraphics;
    g.clear();

    // Commander Aura circle
    if (this.auraActive) {
      g.lineStyle(1, 0x00ff88, 0.25);
      g.strokeCircle(this.auraCenterX, this.auraCenterY, this.auraRadius);
    }

    // Archer range circle (centered on anchor)
    g.lineStyle(1, 0x88aaff, 0.2);
    g.strokeCircle(this.anchorPosA.x, this.anchorPosA.y, 420);

    // Target lines per unit (no slot dots)
    for (const u of this.armyUnits) {
      if (!u.active) continue;
      if (u.lockedTarget && (u.lockedTarget as EnemyBase).active) {
        const t = u.lockedTarget as EnemyBase;
        if (u.squadType === 'archer') {
          g.lineStyle(1, 0x4444ff, 0.15);
          g.lineBetween(u.x, u.y, t.x, t.y);
        } else if (u.squadType === 'cavalry' && u.isIntercepting) {
          g.lineStyle(1, 0xff4444, 0.2);
          g.lineBetween(u.x, u.y, t.x, t.y);
        }
      }
    }

    // faceDir debug line during reform
    if (this.reformActive) {
      g.lineStyle(2, 0x00ffaa, 0.4);
      g.lineBetween(
        this.player.x, this.player.y,
        this.player.x + this.reformFrozenDirX * 200,
        this.player.y + this.reformFrozenDirY * 200,
      );
    }
  }
}
