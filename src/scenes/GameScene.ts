import Phaser from 'phaser';
import { GameMode, type BuildConfig, type SupportId, type Tag, type Zone, type SquadType, type NodeId } from '../types';
import { getKeystone, getSkill, getSupport, getItem } from '../data/buildData';
import { getNode } from '../data/treeData';
import { Player }      from '../entities/Player';
import { EnemyBase, type EnemyUpdateContext } from '../entities/EnemyBase';
import { Chaser }      from '../entities/Chaser';
import { Dasher }      from '../entities/Dasher';
import { BufferEnemy } from '../entities/BufferEnemy';
import { ArmyUnit }    from '../entities/ArmyUnit';
import type { GameRules } from '../army/GameRules';
import { POLICIES, moveToSlot } from '../army/SquadPolicy';
import { COLOR } from '../colors';
import type { BalanceData } from '../../shared/balance/schema';
import { loadBalance } from '../../shared/balance/storage';
import { DEFAULT_BALANCE } from '../../shared/balance/defaults';
import { createWorldRuleTokens, type WorldRuleTokens, type TokenState } from '../ui/WorldRuleTokens';

const DEF = DEFAULT_BALANCE;

const CLOSE_RANGE = 120;
const SEED = 1337;
const SPAWN_DIST = Math.ceil(Math.sqrt(1920 * 1920 + 1080 * 1080) / 2) + 120;
const T_SEQ = [-360, -240, -120, 0, 120, 240, 360];
const MAX_PLATOONS = { core: 3, repeat: 5 };

type SpawnChannel = 'front' | 'flankL' | 'flankR' | 'back';
type PlatoonType = 'chaser' | 'dasher' | 'buffer';

interface Platoon {
  type: PlatoonType;
  leader: EnemyBase;
  wingmen: EnemyBase[];
  enemies: EnemyBase[];
  spawnTime: number;
}


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
  // Balance (loaded from shared/balance localStorage)
  private balanceData!: BalanceData;

  // Build
  private build!: BuildConfig;
  private supActive!: [boolean, boolean];
  private baseAttackCD = 400;
  private baseDashCD = 1400;
  private baseSpeed = 220;

  // Tree node runtime state
  private activeNodes = new Set<NodeId>();
  private markLockUntil = 0;      // D1 mark change lockout
  private markKillRewardBuffUntil = 0;      // D4 execution → archer priority shift
  private executionDoctrineTargets = new Map<EnemyBase, number>(); // D6 2s forced exit
  private stillRewardTimer = 0;     // E4 still duration tracker
  private stillRewardWeakenUntil = 0;    // E4 flank weaken window
  private moveStartPenaltyUntil = 0;  // E5 archer fire lock after moving
  private f5BackDirTimer = 0;   // F5 reverse movement tracker
  private archerGuardBackSealUntil = 0;  // B4 back channel seal
  private cavalryDoctrineBackSealUntil = 0;  // C6 back channel seal
  private fortressBackSealUntil = 0;  // E6 back channel seal
  private skirmishBackSealUntil = 0;  // F6 back channel seal
  private a5FirstHitMap = new Map<EnemyBase, boolean>(); // A5 first hit tracker
  private nodeHudText!: Phaser.GameObjects.Text;
  private ruleTokens!: WorldRuleTokens;

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

  // aimDir — direction commander is looking (cursor-based, updated every frame)
  private aimDirX = 0;
  private aimDirY = 1;

  // committedDir — slowly-updating formation direction (rate-limited toward aimDir)
  private committedDirX = 0;
  private committedDirY = 1;
  private committedPendingSince = 0;
  private committedCooldownUntil = 0;

  // lineAnchor — persistent front-line position (lerped in auto, snapped in reform)
  private lineAnchorX = 960;
  private lineAnchorY = 540;

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

  // Dasher disrupt immunity
  private disruptImmunity: Map<ArmyUnit, number> = new Map();

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
  private contractText!: Phaser.GameObjects.Text;
  private encounterText!: Phaser.GameObjects.Text;
  private flagPenText!: Phaser.GameObjects.Text;
  private situationText!: Phaser.GameObjects.Text;
  private squadText!: Phaser.GameObjects.Text;

  // Debug overlay
  private debugOn = false;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private debugHudGfx!: Phaser.GameObjects.Graphics;
  private debugText!: Phaser.GameObjects.Text;

  // Formation line visualization
  private formationGfx!: Phaser.GameObjects.Graphics;

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
    this.auraRadius = this.balanceData?.game?.commandAuraRadius ?? 260;
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
    this.aimDirX = 0;
    this.aimDirY = 1;
    this.committedDirX = 0;
    this.committedDirY = 1;
    this.committedPendingSince = 0;
    this.committedCooldownUntil = 0;
    this.lineAnchorX = 960;
    this.lineAnchorY = 540;
    this.anchorPosV = { x: 960, y: 540 };
    this.anchorPosA = { x: 960, y: 540 };
    this.anchorPosC = { x: 960, y: 540 };
    this.flagX = 960;
    this.flagY = 540;
    this.flagPenetrationTime = 0;
    this.flagGraphic = null;
    this.wingmanData = new Map();
    this.disruptImmunity = new Map();
    this.doublePlatoonPending = null;
    this.cameraZoom = 1.0;
    this.cameraTargetZoom = 1.0;
    // Tree nodes
    this.activeNodes = new Set(this.build.nodes || []);
    this.markLockUntil = 0;
    this.markKillRewardBuffUntil = 0;
    this.executionDoctrineTargets = new Map();
    this.stillRewardTimer = 0;
    this.stillRewardWeakenUntil = 0;
    this.moveStartPenaltyUntil = 0;
    this.f5BackDirTimer = 0;
    this.archerGuardBackSealUntil = 0;
    this.cavalryDoctrineBackSealUntil = 0;
    this.fortressBackSealUntil = 0;
    this.skirmishBackSealUntil = 0;
    this.a5FirstHitMap = new Map();
    if (this.ruleTokens) {
      this.ruleTokens.destroy();
      this.ruleTokens = createWorldRuleTokens(this);
    }
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this._createTextures();
    this._resolveBuild();
    this.balanceData = loadBalance();

    this.player = new Player(this, W / 2, H / 2);
    this._applyBalanceToCommander();
    this._applyStaticBuildEffects();

    // Init anchorPos to player spawn
    this.anchorPosV = { x: this.player.x, y: this.player.y };
    this.anchorPosA = { x: this.player.x, y: this.player.y };
    this.anchorPosC = { x: this.player.x, y: this.player.y };

    this._createArmy();
    this._applyBalanceToArmy();

    this.stageStartTime = this.time.now;
    this.rhythmCycleStart = this.time.now;
    this.volleyCycleStart = this.time.now;
    this.nextSpawnTime = this.time.now + this.balanceData.game.platoonSpawnInterval;

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
    // Screen-space graphics (camera-independent)
    this.cooldownGraphics = this.add.graphics().setDepth(10000).setScrollFactor(0);
    this._setupUI(W, H);

    // Formation line visualization (always visible)
    this.formationGfx = this.add.graphics().setDepth(3);

    // Debug overlay objects
    this.debugGfx = this.add.graphics().setDepth(100).setVisible(false);
    this.debugHudGfx = this.add.graphics().setDepth(10001).setScrollFactor(0).setVisible(false);
    this.debugText = this.add.text(10, 10, '', {
      fontSize: '13px', fontFamily: 'Courier New', color: '#cccccc',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { left: 8, right: 8, top: 6, bottom: 6 },
    }).setDepth(10001).setScrollFactor(0).setVisible(false);

    this.input.keyboard!.on('keydown-F', () => {
      this.debugOn = !this.debugOn;
      this.debugGfx.setVisible(this.debugOn);
      this.debugHudGfx.setVisible(this.debugOn);
      this.debugText.setVisible(this.debugOn);
      if (!this.debugOn) {
        this.debugGfx.clear();
        this.debugHudGfx.clear();
        this.debugText.setText('');
      }
    });

    this.ruleTokens = createWorldRuleTokens(this);
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
      this.reformUntil = this.time.now + (this.balanceData.commander.reformDuration ?? 550);
      // faceDir: mouse direction from commander position
      const ptr = this.input.activePointer;
      const fdx = ptr.worldX - this.player.x;
      const fdy = ptr.worldY - this.player.y;
      const fdLen = Math.sqrt(fdx * fdx + fdy * fdy);
      if (fdLen > (this.balanceData.game.aimDeadZone ?? DEF.game.aimDeadZone!)) {
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
          padding: { top: 6, bottom: 2 },
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

    // aimDir: direction from commander to cursor (direction only, NOT position)
    const ptr = this.input.activePointer;
    const adx = ptr.worldX - this.player.x;
    const ady = ptr.worldY - this.player.y;
    const adLen = Math.sqrt(adx * adx + ady * ady);
    const aimDZ = this.balanceData.game.aimDeadZone ?? DEF.game.aimDeadZone!;
    if (adLen > aimDZ) {
      this.aimDirX = adx / adLen;
      this.aimDirY = ady / adLen;
    }

    // committedDir + anchorPos + lineAnchor
    this._updateCommittedDir();
    this._updateAnchorPos();
    this._updateLineAnchor();

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
      this.nextSpawnTime = this.time.now + this.balanceData.game.platoonSpawnInterval;
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
    this._updateRuleTokens();
    this._refreshHpDisplay();
    this._drawCooldowns();
    this._refreshSquadDisplay();
    if (this.debugOn) this._drawSquadDebug();
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
    const bal = this.balanceData;
    const mi = bal.modifiers.items;
    const mk = bal.modifiers.keystones;
    const ms = bal.modifiers.supports;

    this.baseAttackCD = bal.commander.atkCD;
    this.baseDashCD = bal.commander.dashCD;
    this.baseSpeed = bal.commander.speed;

    if (item === 'heavyBlade') this.baseAttackCD += mi.heavyBlade?.atkCdBonus ?? 200;
    if (item === 'calmMind') {
      this.baseAttackCD -= mi.calmMind?.atkCdReduction ?? 100;
      this.baseDashCD += mi.calmMind?.dashCdBonus ?? 300;
    }
    if (item === 'sprintBoots') {
      const mult = mi.sprintBoots?.speedMult ?? 1.2;
      this.baseSpeed = Math.round(this.baseSpeed * mult);
      this.baseDashCD -= mi.sprintBoots?.dashCdReduction ?? 200;
      p.maxHp -= mi.sprintBoots?.hpPenalty ?? 1;
    }
    if (item === 'ironSkin') {
      const mult = mi.ironSkin?.speedMult ?? 0.8;
      this.baseSpeed = Math.round(this.baseSpeed * mult);
    }
    if (item === 'antiDashPlate') {
      p.dashGrantsInvincibility = false;
      p.iframesDuration = mi.antiDashPlate?.iframes ?? 2000;
    }

    if (this._hasSup('closeShock')) this.baseAttackCD += ms.closeShock?.atkCdBonus ?? 150;

    if (ks === 'fragilePower') {
      p.maxHp -= mi.fragilePower?.hpPenalty ?? 2;
      p.extraDashIframes = mi.fragilePower?.extraDashIframes ?? 100;
      const unitPenalty = mi.fragilePower?.unitHpPenalty ?? 1;
      for (const u of this.armyUnits) {
        u.maxHp = Math.max(1, u.maxHp - unitPenalty);
        u.hp = Math.min(u.hp, u.maxHp);
      }
    }

    // Set aura radius by keystone
    const baseAura = bal.game.commandAuraRadius;
    if (ks === 'closePact') this.auraRadius = Math.round(baseAura * (mk.closePact?.auraRadiusMult ?? 0.77));
    else this.auraRadius = baseAura;

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
    const bal = this.balanceData;
    const mk = bal.modifiers.keystones;
    const ms = bal.modifiers.supports;
    const mi = bal.modifiers.items;

    if (ks === 'kitingVow') {
      const nearest = this._nearestEnemyDist();
      if (nearest <= CLOSE_RANGE) atkCD *= mk.kitingVow?.closeAtkCdMult ?? 2;
      else dashCD *= mk.kitingVow?.farDashCdMult ?? 0.7;
    }

    if (this._hasSup('zoneAnchor') && this.zone) {
      const str = this._supStr('zoneAnchor');
      const reduction = ms.zoneAnchor?.atkReduction ?? 0.3;
      const increase = ms.zoneAnchor?.atkIncrease ?? 0.2;
      if (this._isPlayerInZone()) atkCD *= (1 - reduction * str);
      else atkCD *= (1 + increase * str);
    }

    if (this.build.item === 'zoneCore') {
      if (!this.zone || !this._isPlayerInZone()) atkCD += mi.zoneCore?.atkCdBonusOut ?? 200;
      if (this.zone && this._isPlayerInZone()) dashCD -= mi.zoneCore?.dashCdReductionIn ?? 400;
    }

    this.player.attackCooldown = Math.max(bal.game.minAttackCD ?? 100, Math.round(atkCD));
    this.player.dashCooldown = Math.max(bal.game.minDashCD ?? 400, Math.round(dashCD));
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
    return true;
  }

  private _updateCharge(): void {
    this.chargeGraphics.clear();
    if (!this.isCharging) return;

    const cmd = this.balanceData.commander;
    const chargeDur = cmd.chargeDuration ?? 600;
    const ringStart = cmd.chargeRingStart ?? 20;
    const ringMax = cmd.chargeRingMax ?? 60;
    const elapsed = this.time.now - this.chargeStartTime;
    const progress = Math.min(1, elapsed / chargeDur);

    this.chargeGraphics.lineStyle(3, 0xffaa00, 0.6);
    this.chargeGraphics.strokeCircle(this.player.x, this.player.y, ringStart + progress * (ringMax - ringStart));

    if (elapsed >= chargeDur) {
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
        const linger = this.balanceData.modifiers.keystones.stillnessStance?.anchorLinger ?? 2000;
        this.ssAnchorUntil = now + linger;
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
    // No keystone hard locks — all keystones allow fire.
    // Speed bonuses are applied in _getArmyAttackCD().
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
      this.dashTaxBuffUntil = this.time.now + (this.balanceData.modifiers.supports.dashTax?.buffDur ?? 1500);

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
    // P1 Dash-Prime: window for stun/knockback
    if (this._hasSup('dashPrime')) {
      const dp = this.balanceData.modifiers.supports.dashPrime;
      this.dashPrimeUntil = this.time.now + (dp?.window ?? 1000);
      // Army effect: speed boost
      this.armySpeedBoostUntil = this.time.now + (dp?.armyBoostDur ?? 1000);
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
    if (this._hasNode('D1') && this.time.now < this.markLockUntil) return;

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
        this.markLockUntil = this.time.now + (this.balanceData.modifiers.nodes.markLock?.lockDur ?? DEF.modifiers.nodes.markLock!.lockDur);
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

    if (charged) mult *= this.balanceData.commander.chargeDamageMult ?? 3;

    // Keystone efficiency gradients (no hard locks)
    const mk = this.balanceData.modifiers.keystones;
    if (ks === 'closePact') {
      if (dist > CLOSE_RANGE) mult *= mk.closePact?.farDmgMult ?? 0.2;
      else mult *= mk.closePact?.closeDmgMult ?? 1.4;
    }
    if (ks === 'stillnessStance') {
      if (this.player.isMoving) mult *= mk.stillnessStance?.dmgWhileMoving ?? 0.35;
      else mult *= mk.stillnessStance?.dmgWhileStill ?? 1.5;
    }
    if (ks === 'momentumMode') {
      if (!this.player.isMoving) mult *= mk.momentumMode?.dmgWhileStill ?? 0.3;
      else mult *= mk.momentumMode?.dmgWhileMoving ?? 1.3;
    }

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
      const dp = this.balanceData.modifiers.supports.dashPrime;
      enemy.applyFreeze(Math.round((dp?.knockDur ?? 200) * s));
      enemy.applyKnockback(this.player.x, this.player.y, dp?.knockForce ?? 200, dp?.knockDur ?? 200);
      this.dashPrimeUntil = 0;
    }

    if (this._hasSup('closeShock') && dist <= CLOSE_RANGE) {
      const cs = this.balanceData.modifiers.supports.closeShock;
      enemy.applyFreeze(Math.round((cs?.freezeDur ?? 500) * this._supStr('closeShock')));
    }

    if (this._hasSup('farSnare') && dist > CLOSE_RANGE) {
      const fs = this.balanceData.modifiers.supports.farSnare;
      enemy.applySlow(fs?.slowFactor ?? 0.4, Math.round((fs?.slowDur ?? 1500) * this._supStr('farSnare')));
    }

    if (this.build.item === 'heavyBlade') {
      const hb = this.balanceData.modifiers.items.heavyBlade;
      enemy.applyKnockback(this.player.x, this.player.y, hb?.knockForce ?? 150, hb?.knockDur ?? 150);
    }

    if (this.build.item === 'hunterCharm' && enemy instanceof Chaser) {
      const hc = this.balanceData.modifiers.items.hunterCharm;
      enemy.applySlow(hc?.slowFactor ?? 0.4, hc?.slowDur ?? 1500);
    }

    if (this.build.keystone === 'fragilePower') {
      this.k6HealCounter++;
      const restoreKills = this.balanceData.modifiers.items.bloodOath?.restoreKills ?? 4;
      if (this.k6HealCounter >= restoreKills) {
        this.k6HealCounter = 0;
        this.player.hp = Math.min(this.player.hp + 1, this.player.maxHp);
      }
    }

    if (this.build.item === 'bloodOath') {
      this.i1HealCounter++;
      const restoreKills = this.balanceData.modifiers.items.bloodOath?.restoreKills ?? 4;
      if (this.i1HealCounter >= restoreKills) {
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

    const explosionRadius = this.balanceData.game.markExplosionRadius ?? 80;
    const nearby = this._getActiveEnemiesInRadius(cx, cy, explosionRadius);
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
    const rw = this.balanceData.modifiers.supports.rhythmWindow;
    const elapsed = this.time.now - this.rhythmCycleStart;
    const cycle = rw?.cycleDur ?? 3700;
    const phase = elapsed % cycle;
    return phase >= (rw?.powerStart ?? 3000);
  }

  // ═══════════════════════════════════════════════════════════════
  // ZONE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  private _createZone(x: number, y: number): void {
    if (this.zoneGraphic) this.zoneGraphic.destroy();
    const zr = this.balanceData.game.zoneRadius ?? 80;
    let duration = this.balanceData.modifiers.supports.zoneAnchor?.duration ?? 4000;
    if (this.build.item === 'zoneCore') duration *= this.balanceData.modifiers.items.zoneCore?.durationMult ?? 1.5;
    this.zone = { x, y, radius: zr, expiresAt: this.time.now + duration };
    this.zoneGraphic = this.add.circle(x, y, zr, COLOR.vanguard, 0.15).setDepth(2);
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

    // MODE_CORE: single event "후열 노출"
    const g = this.balanceData.game;
    const encStart = g.encounterStartSec ?? 32;
    const encEnd = g.encounterEndSec ?? 42;
    const encEarlyExit = g.encounterEarlyExitSec ?? 33;
    const elapsed = (this.time.now - this.stageStartTime) / 1000;
    const wasActive = this.encounterActive;
    this.encounterActive = elapsed >= encStart && elapsed < encEnd;

    // Buffer killed during encounter → end early
    if (this.encounterActive && wasActive) {
      const bufferAlive = this.enemies.some(e => e.active && e instanceof BufferEnemy);
      if (!bufferAlive && elapsed > encEarlyExit) {
        this.encounterActive = false;
      }
    }

    if (this.encounterActive) {
      const remaining = Math.ceil(encEnd - elapsed);
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
    // Freeze committedDir during reform (snapshot direction)
    if (this.reformActive) {
      this.committedDirX = this.reformFrozenDirX;
      this.committedDirY = this.reformFrozenDirY;
      return;
    }

    // Auto mode: rate-limited rotation toward aimDir (cursor direction, NOT position)
    const dtSec = this.game.loop.delta / 1000;
    const maxTurn = (this.balanceData.game.dirTurnRate ?? DEF.game.dirTurnRate!) * dtSec;

    const curAngle = Math.atan2(this.committedDirY, this.committedDirX);
    const tgtAngle = Math.atan2(this.aimDirY, this.aimDirX);
    let diff = tgtAngle - curAngle;
    // Normalize to [-PI, PI]
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;

    if (Math.abs(diff) < 0.001) return; // already aligned

    const clamped = Math.max(-maxTurn, Math.min(maxTurn, diff));
    const newAngle = curAngle + clamped;
    this.committedDirX = Math.cos(newAngle);
    this.committedDirY = Math.sin(newAngle);
  }

  private _updateAnchorPos(): void {
    const dt = this.game.loop.delta / 1000;
    const px = this.player.x, py = this.player.y;
    const g = this.balanceData.game;

    const factorV = 1 - Math.exp(-dt * (g.anchorDecayVanguard ?? 8));
    this.anchorPosV.x += (px - this.anchorPosV.x) * factorV;
    this.anchorPosV.y += (py - this.anchorPosV.y) * factorV;

    const factorA = 1 - Math.exp(-dt * (g.anchorDecayArcher ?? 6));
    this.anchorPosA.x += (px - this.anchorPosA.x) * factorA;
    this.anchorPosA.y += (py - this.anchorPosA.y) * factorA;

    const factorC = 1 - Math.exp(-dt * (g.anchorDecayCavalry ?? 9));
    this.anchorPosC.x += (px - this.anchorPosC.x) * factorC;
    this.anchorPosC.y += (py - this.anchorPosC.y) * factorC;
  }

  private _updateLineAnchor(): void {
    // lineAnchor = playerPos + formationDir * lineDepth (always commander-based)
    const vLineDepth = this.balanceData.units.vanguard.lineDepth ?? 160;
    const dirX = this.reformActive ? this.reformFrozenDirX : this.committedDirX;
    const dirY = this.reformActive ? this.reformFrozenDirY : this.committedDirY;
    this.lineAnchorX = this.player.x + dirX * vLineDepth;
    this.lineAnchorY = this.player.y + dirY * vLineDepth;
  }

  private _updateFlag(): void {
    const penRadius = this.balanceData.game.flagPenetrationRadius ?? 40;
    let penetrating = false;
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (Phaser.Math.Distance.Between(e.x, e.y, this.flagX, this.flagY) <= penRadius) {
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
    const penThreshold = (this.balanceData.game.flagPenetrationThreshold ?? 2) * 1000;
    if (this.flagPenetrationTime > 0) {
      const pen = Math.min(penThreshold / 1000, this.flagPenetrationTime / 1000);
      this.flagPenText.setText(`FLAG 침투 ${pen.toFixed(1)}s/${(penThreshold / 1000).toFixed(1)}s`);
    } else {
      this.flagPenText.setText('');
    }

    // Cumulative penetration → one archer takes damage
    if (this.flagPenetrationTime >= penThreshold) {
      this.flagPenetrationTime = 0;
      this._damageOneUnit('archer');
    }
  }

  private _updateCameraZoom(): void {
    const g = this.balanceData.game;
    const proximity = g.cameraZoomProximity ?? 200;
    const threshold = g.cameraZoomEnemyCount ?? 3;
    const zoomIn = g.cameraZoomIn ?? 0.90;
    const zoomNormal = g.cameraZoomNormal ?? 1.0;
    const ease = g.cameraZoomEase ?? 4;

    let enemiesNearFlag = 0;
    for (const e of this.enemies) {
      if (e.active && Phaser.Math.Distance.Between(e.x, e.y, this.flagX, this.flagY) <= proximity) {
        enemiesNearFlag++;
      }
    }
    this.cameraTargetZoom = enemiesNearFlag >= threshold ? zoomIn : zoomNormal;

    const dt = this.game.loop.delta / 1000;
    this.cameraZoom += (this.cameraTargetZoom - this.cameraZoom) * (1 - Math.exp(-dt * ease));
    this.cameras.main.setZoom(this.cameraZoom);
  }

  // ═══════════════════════════════════════════════════════════════
  // ARMY SYSTEM
  // ═══════════════════════════════════════════════════════════════

  private _createArmy(): void {
    const ks = this.build.keystone;
    const g = this.balanceData.game;
    const types: Array<{ type: SquadType; count: number }> = [
      { type: 'vanguard', count: g.squadSizeVanguard ?? 8 },
      { type: 'archer', count: g.squadSizeArcher ?? 8 },
      { type: 'cavalry', count: g.squadSizeCavalry ?? 4 },
    ];

    for (const { type, count } of types) {
      for (let i = 0; i < count; i++) {
        const u = new ArmyUnit(this, this.player.x, this.player.y, type);
        u.stableId = `${type}#${String(i).padStart(4, '0')}`;
        // fragilePower: reduce squad HP instead (handled at squad level)
        this.armyUnits.push(u);
      }
    }

    if (this.build.item === 'calmMind') {
      const mult = this.balanceData.modifiers.items.calmMind?.atkCdMult ?? 0.8;
      for (const u of this.armyUnits) u.atkCD = Math.round(u.atkCD * mult);
    }
    if (this.build.item === 'sprintBoots') {
      const mult = this.balanceData.modifiers.items.sprintBoots?.speedMult ?? 1.2;
      for (const u of this.armyUnits) u.unitSpeed = Math.round(u.unitSpeed * mult);
    }
  }

  private _applyBalanceToCommander(): void {
    const c = this.balanceData.commander;
    this.player.maxHp = c.maxHp;
    this.player.hp = c.maxHp;
    this.player.speed = c.speed;
    this.player.attackCooldown = c.atkCD;
    this.player.dashCooldown = c.dashCD;
    this.player.dashDuration = c.dashDuration;
    this.player.dashSpeed = c.dashSpeed;
    this.player.iframesDuration = c.iframes;
    this.player.reformCD = c.reformCD;
    this.player.reformThreshold = c.reformThreshold;
    this.baseAttackCD = c.atkCD;
    this.baseDashCD = c.dashCD;
    this.baseSpeed = c.speed;
  }

  /** Apply balance data from shared/balance to all army units (after _createArmy, before item modifiers) */
  private _applyBalanceToArmy(): void {
    const b = this.balanceData;
    for (const u of this.armyUnits) {
      const stats = b.units[u.squadType];
      if (!stats) continue;
      u.maxHp = stats.maxHp;
      u.hp = stats.maxHp;
      u.dmg = stats.dmg;
      u.atkCD = stats.atkCD;
      u.unitSpeed = stats.unitSpeed;
      if (stats.range !== undefined) u.atkRange = stats.range;
      u.engageRadius = Math.min(stats.engageRadius, stats.returnRadius);
      u.returnRadius = Math.max(stats.engageRadius, stats.returnRadius);
    }
    // Re-apply item modifiers on top of balance data
    if (this.build.item === 'calmMind') {
      const mult = this.balanceData.modifiers.items.calmMind?.atkCdMult ?? 0.8;
      for (const u of this.armyUnits) u.atkCD = Math.round(u.atkCD * mult);
    }
    if (this.build.item === 'sprintBoots') {
      const mult = this.balanceData.modifiers.items.sprintBoots?.speedMult ?? 1.2;
      for (const u of this.armyUnits) u.unitSpeed = Math.round(u.unitSpeed * mult);
    }
  }

  private _buildRules(): GameRules {
    const now = this.time.now;
    const ks = this.build.keystone;
    const mk = this.balanceData.modifiers.keystones;
    let speedMult = 1;
    if (ks === 'momentumMode') speedMult = this.player.isMoving
      ? (mk.momentumMode?.movingMult ?? 1.5)
      : (mk.momentumMode?.stillMult ?? 0.5);
    if (now < this.armySpeedBoostUntil) speedMult *= this.balanceData.game.armySpeedBoostMult ?? 1.5;

    const dir = this.reformActive
      ? { x: this.reformFrozenDirX, y: this.reformFrozenDirY }
      : { x: this.committedDirX, y: this.committedDirY };

    // lineAnchor: updated each frame by _updateLineAnchor() (FLAG-based auto / commander-based reform)
    const lineAnchor = { x: this.lineAnchorX, y: this.lineAnchorY };

    const vanguardPositions = this.armyUnits
      .filter(u => u.active && u.squadType === 'vanguard')
      .map(u => ({ x: u.x, y: u.y }));

    const cavalryInterceptCount = this.armyUnits
      .filter(u => u.active && u.squadType === 'cavalry'
        && (u.cavPhase === 'intercept' || u.cavPhase === 'disrupt'))
      .length;

    const cmd = this.balanceData.commander;
    return {
      hasNode: (id) => this._hasNode(id),
      hasSup: (id) => this._hasSup(id),
      keystone: ks,
      item: this.build.item,
      now,
      dtMs: this.game.loop.delta,
      speedMult,
      armyAttackOff: this._isArmyAttackSuppressed(),
      archerFireOff: this._isArcherFireSuppressed(),
      canArcherFire: this._canArcherFire(),
      isVolleyOpen: this._isVolleyWindowOpen(),
      isReforming: this.reformActive,
      reformStartTime: this.reformStartTime,
      reformSpeedMult: cmd.reformSpeedMult ?? 2.8,
      reformArriveRadius: cmd.reformArriveRadius ?? 18,
      reformBrakeRadius: cmd.reformBrakeRadius ?? 70,
      reformStaggerInterval: cmd.reformStaggerInterval ?? 20,
      player: { x: this.player.x, y: this.player.y, isMoving: this.player.isMoving },
      flag: { x: this.flagX, y: this.flagY },
      dir,
      mark: this.tacticalMarkTarget,
      aura: { active: this.auraActive, cx: this.auraCenterX, cy: this.auraCenterY, r: this.auraRadius },
      lineAnchor,
      vanguardPositions,
      cavalryInterceptCount,
      enemies: this.enemies,
      anchorV: this.anchorPosV,
      archerLeader: this._getArcherLeader(),
      k5Target: (this.k5LastTarget && this.k5LastTarget.active) ? this.k5LastTarget : null,
      d4Active: this._hasNode('D4') && now < this.markKillRewardBuffUntil,
      vanguardLowHp: this._isVanguardLowHp(),
      vanguardBalance: this.balanceData.units.vanguard,
      archerBalance: this.balanceData.units.archer,
      cavalryBalance: this.balanceData.units.cavalry,
      gameBalance: this.balanceData.game,
      modifierNodes: this.balanceData.modifiers.nodes,
      modifierKeystones: this.balanceData.modifiers.keystones,
      archerFired: this.archerFiredThisWindow,
      getAttackCD: (u) => this._getArmyAttackCD(u),
    };
  }

  private _getArcherLeader(): { x: number; y: number } {
    const v = this.armyUnits.find(u => u.active && u.squadType === 'vanguard');
    return v ? { x: v.x, y: v.y } : { x: this.player.x, y: this.player.y };
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

      let effectiveReturn = u.returnRadius;
      // Reduce returnRadius 30% during reform
      if (rules.isReforming) effectiveReturn *= 0.7;

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
    this._drawFormationLines(rules);
  }

  private _drawFormationLines(rules: GameRules): void {
    const g = this.formationGfx;
    g.clear();

    const la = rules.lineAnchor;
    const rx = -rules.dir.y, ry = rules.dir.x;

    // Front line (vanguard color, thin)
    g.lineStyle(2, COLOR.vanguard, 0.3);
    g.beginPath();
    g.moveTo(la.x + rx * 300, la.y + ry * 300);
    g.lineTo(la.x - rx * 300, la.y - ry * 300);
    g.strokePath();

    // Cavalry phase lines
    for (const u of this.armyUnits) {
      if (!u.active || u.squadType !== 'cavalry') continue;

      if (u.cavPhase === 'seek_gap') {
        // Dotted line to gap point
        const GAP_SAMPLES = [-240, -120, 0, 120, 240];
        const gpx = la.x + rx * GAP_SAMPLES[u.cavGapIdx];
        const gpy = la.y + ry * GAP_SAMPLES[u.cavGapIdx];
        g.lineStyle(1, COLOR.cavalry, 0.4);
        const dx = gpx - u.x, dy = gpy - u.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 5) {
          const nx = dx / len, ny = dy / len;
          const dashLen = 8, gapLen = 6;
          let traveled = 0;
          g.beginPath();
          while (traveled < len) {
            const sx = u.x + nx * traveled;
            const sy = u.y + ny * traveled;
            const ex = Math.min(traveled + dashLen, len);
            g.moveTo(sx, sy);
            g.lineTo(u.x + nx * ex, u.y + ny * ex);
            traveled = ex + gapLen;
          }
          g.strokePath();
        }
      } else if (u.cavPhase === 'intercept') {
        // Bold line to intercept target
        g.lineStyle(2, COLOR.cavalry, 0.6);
        g.beginPath();
        g.moveTo(u.x, u.y);
        g.lineTo(u.cavTargetX, u.cavTargetY);
        g.strokePath();
      }
    }
  }

  private _applySeparationForce(): void {
    const g = this.balanceData.game;
    const SEP_DIST = g.separationDist ?? 20;
    const SEP_FORCE = g.separationForce ?? 25;
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

    // Keystone archer CD bonuses
    if (u.squadType === 'archer') {
      const ks = this.build.keystone;
      const mk = this.balanceData.modifiers.keystones;
      if (ks === 'closePact' && this._nearestEnemyDist() <= CLOSE_RANGE) {
        cd *= mk.closePact?.archerCdMult ?? 0.6;
      }
      if (ks === 'momentumMode' && this.player.isMoving) {
        cd *= mk.momentumMode?.archerCdMult ?? 0.7;
      }
      if (ks === 'stillnessStance' && this.auraActive && this.tacticalMarkTarget?.active) {
        const d = Phaser.Math.Distance.Between(this.auraCenterX, this.auraCenterY, this.tacticalMarkTarget.x, this.tacticalMarkTarget.y);
        if (d <= this.auraRadius) cd *= mk.stillnessStance?.archerCdMult ?? 0.6;
      }
      if (ks === 'kitingVow' && this.tacticalMarkTarget?.active) {
        const minDist = mk.kitingVow?.minDistToMark ?? 160;
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.tacticalMarkTarget.x, this.tacticalMarkTarget.y);
        if (d >= minDist) cd *= mk.kitingVow?.archerCdMult ?? 0.65;
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
      const cs = this.balanceData.modifiers.supports.closeShock;
      target.applyFreeze(Math.round((cs?.unitFreezeDur ?? 300) * this._supStr('closeShock')));
    }
    // P9 Far Snare: archer slow
    if (this._hasSup('farSnare') && unit.squadType === 'archer') {
      const fs = this.balanceData.modifiers.supports.farSnare;
      target.applySlow(fs?.unitSlowFactor ?? 0.3, Math.round((fs?.unitSlowDur ?? 1000) * this._supStr('farSnare')));
    }
    // I4 Heavy Blade: vanguard knockback
    if (this.build.item === 'heavyBlade' && unit.squadType === 'vanguard') {
      const hb = this.balanceData.modifiers.items.heavyBlade;
      target.applyKnockback(unit.x, unit.y, hb?.knockForce ?? 150, hb?.knockDur ?? 150);
    }

    // A5: vanguard first hit = slow instead of damage
    if (this._hasNode('A5') && unit.squadType === 'vanguard') {
      if (!this.a5FirstHitMap.has(target)) {
        this.a5FirstHitMap.set(target, true);
        const a5 = this.balanceData.modifiers.nodes.vanguardSlowOnHit;
        target.applySlow(a5?.slowFactor ?? 0.3, a5?.slowDur ?? 1000);
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
      // I1 Blood Oath: army kills → restore unit
      const restoreKills = this.balanceData.modifiers.items.bloodOath?.restoreKills ?? 4;
      if (this.build.item === 'bloodOath' && this.armyKillCount >= restoreKills) {
        this.armyKillCount = 0;
        this._restoreArmyUnit();
      }
      // D4: mark target killed → archer priority shift
      if (this._hasNode('D4') && target === this.tacticalMarkTarget) {
        this.markKillRewardBuffUntil = this.time.now + (this.balanceData.modifiers.nodes.markKillReward?.buffDur ?? 3000);
      }
      // D6: mark target first hit → start 2s forced exit timer
      if (this._hasNode('D6') && target === this.tacticalMarkTarget && !this.executionDoctrineTargets.has(target)) {
        this.executionDoctrineTargets.set(target, this.time.now);
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

      // B5: arrow hit = pull toward FLAG
      if (this._hasNode('B5') && target.active) {
        const b5 = this.balanceData.modifiers.nodes.arrowPull;
        const angle = Phaser.Math.Angle.Between(target.x, target.y, this.flagX, this.flagY);
        target.applyKnockback(
          target.x - Math.cos(angle) * (b5?.pullDist ?? 100),
          target.y - Math.sin(angle) * (b5?.pullDist ?? 100),
          b5?.pullForce ?? 60,
          b5?.pullDur ?? 1000,
        );
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
    if (this.build.item === 'calmMind') u.atkCD = Math.round(u.atkCD * (this.balanceData.modifiers.items.calmMind?.atkCdMult ?? 0.8));
    if (this.build.item === 'sprintBoots') u.unitSpeed = Math.round(u.unitSpeed * (this.balanceData.modifiers.items.sprintBoots?.speedMult ?? 1.2));
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
            e.applyFreeze(this.balanceData.modifiers.nodes.cavalryDoctrine?.chaserFreezeDur ?? DEF.modifiers.nodes.cavalryDoctrine!.chaserFreezeDur);
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
            this.cavalryDoctrineBackSealUntil = this.time.now + (this.balanceData.modifiers.nodes.cavalryDoctrine?.backSealDur ?? DEF.modifiers.nodes.cavalryDoctrine!.backSealDur);
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
        const now = this.time.now;
        if (now < e.nextAtk) continue;
        for (const u of this.armyUnits) {
          if (!u.active) continue;
          if (Phaser.Math.Distance.Between(e.x, e.y, u.x, u.y) < 24) {
            let dmg = 1;
            if (this.build.item === 'ironSkin' && !this.player.isMoving) dmg = 0;
            if (dmg > 0) {
              this._damageUnit(u, dmg);
              e.nextAtk = now + e.atkCD;
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
      this.squadReformUntil[type] = now + (this.balanceData.game.squadReformDur ?? DEF.game.squadReformDur!);
    }

    // B4: archer damaged → back channel 2s seal
    if (this._hasNode('B4') && type === 'archer') {
      this.archerGuardBackSealUntil = now + (this.balanceData.modifiers.nodes.archerGuard?.backSealDur ?? DEF.modifiers.nodes.archerGuard!.backSealDur);
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

  private _handleDasherDisrupt(dasher: Dasher): void {
    const now = this.time.now;
    // Find nearest ArmyUnit within radius 60
    let nearest: ArmyUnit | null = null;
    let minDist = 60;
    for (const u of this.armyUnits) {
      if (!u.active) continue;
      const d = Phaser.Math.Distance.Between(dasher.x, dasher.y, u.x, u.y);
      if (d < minDist) { minDist = d; nearest = u; }
    }
    if (!nearest) return;

    // Immunity check: 1.2s re-application cooldown
    const lastHit = this.disruptImmunity.get(nearest);
    if (lastHit !== undefined && now - lastHit < 1200) return;
    this.disruptImmunity.set(nearest, now);

    // Knockback direction: dasher → unit
    const kbAngle = Phaser.Math.Angle.Between(dasher.x, dasher.y, nearest.x, nearest.y);
    const isFirstHit = dasher.disruptHitCount <= 1;

    if (isFirstHit) {
      // Strong hit: knockback 80px + damage
      const kbDist = 80;
      nearest.x += Math.cos(kbAngle) * kbDist;
      nearest.y += Math.sin(kbAngle) * kbDist;
      if (nearest.squadType === 'archer') {
        // Archer: no damage, but 80px push + nextAtk delay
        nearest.nextAtk = Math.max(nearest.nextAtk, now + 500);
      } else {
        this._damageUnit(nearest, 1);
      }
    } else {
      // Weak hit: knockback 35px only
      const kbDist = 35;
      nearest.x += Math.cos(kbAngle) * kbDist;
      nearest.y += Math.sin(kbAngle) * kbDist;
    }

    // Visual: knockback arrow, fade after 0.2s
    const arrowLen = 20;
    const arrow = this.add.graphics().setDepth(7);
    arrow.lineStyle(2, 0xff6600, 0.9);
    arrow.lineBetween(
      nearest.x - Math.cos(kbAngle) * arrowLen,
      nearest.y - Math.sin(kbAngle) * arrowLen,
      nearest.x, nearest.y,
    );
    this.tweens.add({ targets: arrow, alpha: 0, duration: 200, onComplete: () => arrow.destroy() });
  }

  private _updateSquadReform(): void {
    const now = this.time.now;
    for (const type of ['vanguard', 'archer', 'cavalry'] as SquadType[]) {
      if (this.squadReformUntil[type] > 0 && now >= this.squadReformUntil[type]) {
        this.squadReformUntil[type] = 0;
        this.squadProtectUntil[type] = now + (this.balanceData.game.squadProtectDur ?? DEF.game.squadProtectDur!);
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
      padding: { top: 10, bottom: 2 },
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
    const colors = [`#${COLOR.vanguard.toString(16).padStart(6, '0')}`, `#${COLOR.archer.toString(16).padStart(6, '0')}`, `#${COLOR.cavalry.toString(16).padStart(6, '0')}`];
    const buttons: Phaser.GameObjects.Text[] = [];

    for (let i = 0; i < 3; i++) {
      const btn = this.add.text(W / 2 - 280 + i * 280, H / 2 + 20, labels[i], {
        fontSize: '22px', color: colors[i], fontFamily: 'Courier New',
        backgroundColor: '#1a1a1a', padding: { left: 16, right: 16, top: 10, bottom: 6 },
        wordWrap: { width: 220 },
        align: 'center',
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
        this.stillRewardTimer += dt;
        const e4n = this.balanceData.modifiers.nodes.stillReward;
        if (this.stillRewardTimer >= (e4n?.stillDur ?? DEF.modifiers.nodes.stillReward!.stillDur)) {
          this.stillRewardTimer = 0;
          this.stillRewardWeakenUntil = now + (e4n?.weakenDur ?? DEF.modifiers.nodes.stillReward!.weakenDur);
        }
      } else {
        this.stillRewardTimer = 0;
      }
    }

    // ── E5: 정지 해제 페널티 — after stop, 1s no archer fire ──
    if (this._hasNode('E5') && p.isMoving && !p.isDashing) {
      // Started moving → lock archers
      this.moveStartPenaltyUntil = now + (this.balanceData.modifiers.nodes.moveStartPenalty?.archerLockDur ?? DEF.modifiers.nodes.moveStartPenalty!.archerLockDur);
    }

    // ── F5: 역주행 금지 — moving against committedDir >1s → clamp ──
    if (this._hasNode('F5') && p.isMoving) {
      const body = p.body as Phaser.Physics.Arcade.Body;
      const vx = body.velocity.x, vy = body.velocity.y;
      const len = Math.sqrt(vx * vx + vy * vy);
      const f5n = this.balanceData.modifiers.nodes.noBackwalk;
      const f5d = DEF.modifiers.nodes.noBackwalk!;
      if (len > (f5n?.velThreshold ?? f5d.velThreshold)) {
        const dot = (vx / len) * this.committedDirX + (vy / len) * this.committedDirY;
        if (dot < -(f5n?.backDot ?? f5d.backDot)) {
          this.f5BackDirTimer += dt;
          if (this.f5BackDirTimer > (f5n?.backDirDur ?? f5d.backDirDur)) {
            // Clamp: remove backward component
            const cMult = f5n?.clampMult ?? f5d.clampMult;
            body.setVelocity(
              vx - (vx / len) * dot * len * cMult,
              vy - (vy / len) * dot * len * cMult,
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
        this.fortressBackSealUntil = now + (this.balanceData.modifiers.nodes.fortressDoctrine?.backSealDur ?? DEF.modifiers.nodes.fortressDoctrine!.backSealDur);
      }
    }

    // ── F6: 유격 교리 — outside FLAG 260px → back seal ──
    if (this._hasNode('F6')) {
      const f6n = this.balanceData.modifiers.nodes.skirmishDoctrine;
      const f6d = DEF.modifiers.nodes.skirmishDoctrine!;
      const dist = Phaser.Math.Distance.Between(p.x, p.y, this.flagX, this.flagY);
      if (dist > (f6n?.flagDist ?? f6d.flagDist)) {
        this.skirmishBackSealUntil = now + (f6n?.backSealDur ?? f6d.backSealDur);
      }
    }

    // ── D6: 집행 교리 — forced exit timer on marked targets ──
    if (this._hasNode('D6')) {
      for (const [enemy, startTime] of this.executionDoctrineTargets) {
        if (!enemy.active) { this.executionDoctrineTargets.delete(enemy); continue; }
        if (now - startTime >= (this.balanceData.modifiers.nodes.executionDoctrine?.exitDur ?? DEF.modifiers.nodes.executionDoctrine!.exitDur)) {
          // Force exit: kill the enemy
          if (enemy.active) {
            enemy.takeDamage(999);
            this._onEnemyKilled(enemy);
          }
          this.executionDoctrineTargets.delete(enemy);
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
      if (spd < (this.balanceData.modifiers.nodes.stillCombatBan?.speedThreshold ?? DEF.modifiers.nodes.stillCombatBan!.speedThreshold)) return true;
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
      if (dist > (this.balanceData.modifiers.nodes.ironWall?.flagDist ?? DEF.modifiers.nodes.ironWall!.flagDist)) return true;
    }
    // F6: inside FLAG 260px
    if (this._hasNode('F6')) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.flagX, this.flagY);
      if (dist <= (this.balanceData.modifiers.nodes.skirmishDoctrine?.flagDist ?? DEF.modifiers.nodes.skirmishDoctrine!.flagDist)) return true;
    }
    // B6: commander deal 0 (handled as damage 0, not blocked)
    // D1: mark change lockout (checked separately)
    return false;
  }

  /** Check if archer fire is suppressed by tree nodes right now. */
  private _isArcherFireSuppressed(): boolean {
    // E5: 1s after stopping
    if (this._hasNode('E5') && this.time.now < this.moveStartPenaltyUntil) return true;
    // F2: stationary → archers OFF
    if (this._hasNode('F2') && !this.player.isMoving) return true;
    return false;
  }

  /** Check if a back channel spawn is sealed by any tree node. */
  private _isBackChannelSealed(): boolean {
    const now = this.time.now;
    if (this._hasNode('B4') && now < this.archerGuardBackSealUntil) return true;
    if (this._hasNode('C6') && now < this.cavalryDoctrineBackSealUntil) return true;
    if (this._hasNode('E6') && now < this.fortressBackSealUntil) return true;
    if (this._hasNode('F6') && now < this.skirmishBackSealUntil) return true;
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // REFORM
  // ═══════════════════════════════════════════════════════════════

  private _showReformFlash(): void {
    const W = this.scale.width;
    const flash = this.add.text(W / 2, 130, '재정렬!', {
      fontSize: '24px', color: '#00ff88', fontFamily: 'Courier New',
      padding: { top: 4, bottom: 2 },
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
    if (this.reformActive) {
      if (!this.reformIndicator) {
        this.reformIndicator = this.add.text(this.scale.width / 2, 110, '', {
          fontSize: '20px', color: '#00ff88', fontFamily: 'Courier New',
          padding: { top: 6, bottom: 2 },
        }).setOrigin(0.5).setDepth(D).setScrollFactor(0);
      }
      this.reformIndicator.setText('Reform!').setColor('#00ff88');
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

    const gfl = this.balanceData.game;
    const flFwdMin = gfl.frontLineFwdMin ?? DEF.game.frontLineFwdMin!;
    const flFwdMax = gfl.frontLineFwdMax ?? DEF.game.frontLineFwdMax!;
    const flMinCount = gfl.frontLineMinCount ?? DEF.game.frontLineMinCount!;
    let inZone = 0;
    for (const u of vUnits) {
      const dx = u.x - px;
      const dy = u.y - py;
      const fwd = dx * fx + dy * fy;
      if (fwd >= flFwdMin && fwd <= flFwdMax) inZone++;
    }

    if (inZone >= flMinCount) {
      // 4+ vanguards in front zone — intact
      if (now >= this.frontLineCollapseUntil) {
        this.frontLineIntact = true;
      }
    } else {
      // Not enough vanguards in zone — collapsed
      if (this.frontLineIntact) {
        this.frontLineIntact = false;
        this.frontLineCollapseUntil = now + (this.balanceData.game.frontLineCollapseDur ?? DEF.game.frontLineCollapseDur!);
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
          if (Phaser.Math.Distance.Between(enemy.x, enemy.y, v.x, v.y) < (this.balanceData.game.frontLineEngageDist ?? DEF.game.frontLineEngageDist!)) {
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
    const bal = this.balanceData;
    switch (type) {
      case 'dasher': {
        const d = new Dasher(this, x, y);
        const es = bal.enemies.dasher;
        d.hp = es.maxHp;
        d.atkCD = es.atkCD ?? 1000;
        d.baseSpeed = es.speed;
        d.speed = es.speed;
        if (es.dashWindup !== undefined) d.dashWindup = es.dashWindup;
        if (es.dashSpeed !== undefined) d.dashSpd = es.dashSpeed;
        if (es.dashDuration !== undefined) d.dashDur = es.dashDuration;
        if (es.patrolDuration !== undefined) d.patrolDur = es.patrolDuration;
        if (es.flashInterval !== undefined) d.flashInterval = es.flashInterval;
        if (es.telegraphLength !== undefined) d.telegraphLen = es.telegraphLength;
        if (es.cooldownDuration !== undefined) d.cooldownDur = es.cooldownDuration;
        if (es.disruptDuration !== undefined) d.disruptDuration = es.disruptDuration;
        if (es.egressDuration !== undefined) d.egressDuration = es.egressDuration;
        if (es.egressSpeed !== undefined) d.egressSpd = es.egressSpeed;
        if (es.penetrationDist !== undefined) d.penetrationDist = es.penetrationDist;
        if (this.build.keystone === 'momentumMode') d.windupMultiplier = this.balanceData.modifiers.keystones.momentumMode?.dasherWindupMult ?? 1.2;
        if (GameMode.repeat && this.contractType === 'vanguard' && this.time.now < this.contractUntil) {
          d.windupMultiplier = Math.min(d.windupMultiplier, 0.85);
        }
        d.onDisruptHit = (dasher) => this._handleDasherDisrupt(dasher);
        return d;
      }
      case 'buffer': {
        const b = new BufferEnemy(this, x, y);
        const es = bal.enemies.buffer;
        b.hp = es.maxHp;
        b.atkCD = es.atkCD ?? 1000;
        const speed = es.speed + this.rng() * (es.speedRange ?? 15);
        b.baseSpeed = speed;
        b.speed = speed;
        if (es.auraRadius !== undefined) b.auraRadius = es.auraRadius;
        if (es.auraSpeedBoost !== undefined) b.auraSpeedBoost = es.auraSpeedBoost;
        return b;
      }
      default: {
        const c = new Chaser(this, x, y);
        const es = bal.enemies.chaser;
        c.hp = es.maxHp;
        c.atkCD = es.atkCD ?? 1000;
        const speed = es.speed + this.rng() * (es.speedRange ?? 20);
        c.baseSpeed = speed;
        c.speed = speed;
        c.spawnId = this.spawnIndex;
        if (es.lineHoldDist !== undefined) c.lineHoldDist = es.lineHoldDist;
        if (es.cohesionRadius !== undefined) c.cohesionRadius = es.cohesionRadius;
        if (es.slotSpacing !== undefined) c.slotSpacing = es.slotSpacing;
        if (es.lineHoldSpeedMult !== undefined) c.lineHoldSpeedMult = es.lineHoldSpeedMult;
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
    if (this._hasNode('E4') && this.time.now < this.stillRewardWeakenUntil && (channel === 'flankL' || channel === 'flankR')) {
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

    // Max 2 active dasher leaders
    if (type === 'dasher') {
      const activeDasherLeaders = this.platoons.filter(p => p.type === 'dasher' && p.leader.active).length;
      if (activeDasherLeaders >= 2) type = 'chaser';
    }
    const formIdx = this.platoonFormCycle % 3;
    this.platoonFormCycle++;

    const g = this.balanceData.game;
    const balSizes: Record<PlatoonType, number> = {
      chaser: g.platoonSizeChaser,
      dasher: g.platoonSizeDasher,
      buffer: g.platoonSizeBuffer,
    };
    const size = balSizes[type];
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
    // Clean dead units from disrupt immunity map
    for (const [unit] of this.disruptImmunity) {
      if (!unit.active) this.disruptImmunity.delete(unit);
    }
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

    // Build EnemyUpdateContext once per frame
    const vanguardPositions: Array<{ x: number; y: number }> = [];
    for (const u of this.armyUnits) {
      if (u.active && u.squadType === 'vanguard') {
        vanguardPositions.push({ x: u.x, y: u.y });
      }
    }
    const ctx: EnemyUpdateContext = {
      flagX: this.flagX, flagY: this.flagY,
      frontDirX: this.committedDirX, frontDirY: this.committedDirY,
      rightDirX: -this.committedDirY, rightDirY: this.committedDirX,
      now, dt: this.game.loop.delta,
      vanguardPositions,
      enemies: this.enemies,
    };

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
      e.update(target.x, target.y, ctx);
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
        wordWrap: { width: W - 80 },
        align: 'center',
        padding: { top: 14, bottom: 4 },
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
    const vc = this.balanceData.game.volleyCycle;
    const vw = this.balanceData.game.volleyWindow;
    const phase = elapsed % vc;
    return phase < vw;
  }

  private _updateVolley(): void {
    const elapsed = this.time.now - this.volleyCycleStart;
    const vc = this.balanceData.game.volleyCycle;
    const vw = this.balanceData.game.volleyWindow;
    const phase = elapsed % vc;
    // Reset fired set at start of each window
    if (phase < vw && this.archerFiredThisWindow.size > 0) {
      // Check if we just entered a new cycle
      const prevPhase = (elapsed - 16) % vc; // rough dt
      if (prevPhase >= vw || prevPhase < 0) {
        this.archerFiredThisWindow.clear();
      }
    }
    if (phase >= vw) {
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
      const g = this.make.graphics({ add: false } as any);
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
      const g = this.make.graphics({ add: false } as any);
      g.fillStyle(0xffffff);
      g.fillRect(0, 1, 12, 3);
      g.generateTexture('arrow', 12, 5);
      g.destroy();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // UI
  // ═══════════════════════════════════════════════════════════════

  private _setupUI(W: number, H: number): void {
    const D = 10000; // UI depth (above all world objects)

    this.timerText = this.add.text(W / 2, 16, `${this.stageDuration}s`, {
      fontSize: '30px', color: '#bbbbbb', fontFamily: 'Courier New',
      padding: { top: 8, bottom: 2 },
    }).setOrigin(0.5, 0).setDepth(D).setScrollFactor(0);

    this.killText = this.add.text(W - 20, 16, '처치  0', {
      fontSize: '22px', color: '#999999', fontFamily: 'Courier New',
      padding: { top: 6, bottom: 2 },
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
      wordWrap: { width: W - 40 },
      padding: { top: 6, bottom: 2 },
    }).setOrigin(0, 1).setDepth(D).setScrollFactor(0);

    // Squad display
    this.squadText = this.add.text(20, 50, '', {
      fontSize: '20px', color: '#888888', fontFamily: 'Courier New',
      wordWrap: { width: W / 2 - 40 },
      padding: { top: 6, bottom: 2 },
    }).setDepth(D).setScrollFactor(0);

    this.contractText = this.add.text(20, 80, '', {
      fontSize: '20px', color: '#ffaa00', fontFamily: 'Courier New',
      wordWrap: { width: W / 2 - 40 },
      padding: { top: 6, bottom: 2 },
    }).setDepth(D).setScrollFactor(0);

    this.encounterText = this.add.text(W / 2, 52, '', {
      fontSize: '22px', color: '#ff4444', fontFamily: 'Courier New',
      wordWrap: { width: W - 200 },
      padding: { top: 6, bottom: 2 },
    }).setOrigin(0.5).setDepth(D).setScrollFactor(0);

    this.situationText = this.add.text(W / 2, 76, '', {
      fontSize: '20px', color: '#ff8800', fontFamily: 'Courier New',
      wordWrap: { width: W - 200 },
      padding: { top: 6, bottom: 2 },
    }).setOrigin(0.5).setDepth(D).setScrollFactor(0);

    // FLAG penetration warning
    this.flagPenText = this.add.text(W / 2, 100, '', {
      fontSize: '20px', color: '#ff4444', fontFamily: 'Courier New',
      wordWrap: { width: W - 200 },
      padding: { top: 6, bottom: 2 },
    }).setOrigin(0.5).setDepth(D).setScrollFactor(0);

    // Tree node HUD
    const nodeLabels = this.build.nodes?.map(n => getNode(n).label).join(' · ') || '';
    this.nodeHudText = this.add.text(W - 20, 50, nodeLabels, {
      fontSize: '16px', color: '#555555', fontFamily: 'Courier New',
      wordWrap: { width: 400 },
      padding: { top: 6, bottom: 2 },
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
        padding: { top: 6, bottom: 2 },
      }).setDepth(D).setScrollFactor(0);
    }

    // Hint
    this.add.text(W / 2, H - 25, 'WASD 이동 · 좌클릭 공격 · Shift 대시/홀드 재정렬 · R 재시작 · B 빌드', {
      fontSize: '16px', color: '#444444', fontFamily: 'Courier New',
      wordWrap: { width: W - 80 },
      align: 'center',
      padding: { top: 6, bottom: 2 },
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
      { ratio: this.player.getReformCooldownRatio(), color: 0x00ff88 },
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
    const dist = Phaser.Math.Distance.Between(fromX, fromY, toX, toY);
    const arcHeight = Math.sin(Math.PI * 0.5) * Phaser.Math.Clamp(dist * 0.12, 24, 86);
    const duration = Math.max(100, (dist / 800) * 1000);
    const startTime = this.time.now;

    const trail: Phaser.GameObjects.Arc[] = [];

    const onUpdate = () => {
      if (!arrow.active) return;
      const elapsed = this.time.now - startTime;
      const rawT = Phaser.Math.Clamp(elapsed / duration, 0, 1);
      // easeInQuad: terminal acceleration (accelerates toward target)
      const t = rawT * rawT;

      const cx = fromX + (toX - fromX) * t;
      const cy = fromY + (toY - fromY) * t;
      const yOff = Math.sin(Math.PI * t) * arcHeight;
      arrow.x = cx;
      arrow.y = cy - yOff;

      // Rotation: tangent of arc
      const dt = 0.01;
      const t2 = Math.min(1, rawT + dt);
      const t2e = t2 * t2;
      const nx = fromX + (toX - fromX) * t2e;
      const ny = (fromY + (toY - fromY) * t2e) - Math.sin(Math.PI * t2e) * arcHeight;
      arrow.setRotation(Math.atan2(ny - arrow.y, nx - arrow.x));

      // Scale up slightly at apex, shrink toward impact
      arrow.setScale(0.8 + 0.4 * Math.sin(Math.PI * t));

      // Trail at t > 0.75
      if (t > 0.75) {
        const dot = this.add.circle(arrow.x, arrow.y, 2, COLOR.archer, 0.5).setDepth(5);
        trail.push(dot);
        this.tweens.add({ targets: dot, alpha: 0, duration: 150, onComplete: () => dot.destroy() });
      }

      if (rawT >= 1) {
        // Impact
        const spark = this.add.circle(toX, toY, 6, COLOR.archer, 0.8).setDepth(7);
        this.tweens.add({ targets: spark, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 100, onComplete: () => spark.destroy() });
        arrow.destroy();
        for (const d of trail) if (d.active) d.destroy();
      }
    };

    // Use scene update event for frame-by-frame arc
    const updateHandler = () => {
      if (!arrow.active) {
        this.events.off('update', updateHandler);
        return;
      }
      onUpdate();
    };
    this.events.on('update', updateHandler);
  }

  private _updateArrows(): void {
    // Arrows are event-driven, no manual update needed
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

  private _updateRuleTokens(): void {
    const now = this.time.now;
    const bal = this.balanceData;
    const ks = this.build.keystone;
    const tokens: Record<string, TokenState> = {};
    const c01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;

    // ─── A. Seals / Suppressions ───

    // A-1 Back Seal
    const bsActive = this._isBackChannelSealed();
    let bsUntil = 0;
    if (bsActive) {
      if (this._hasNode('B4') && now < this.archerGuardBackSealUntil) bsUntil = Math.max(bsUntil, this.archerGuardBackSealUntil);
      if (this._hasNode('C6') && now < this.cavalryDoctrineBackSealUntil) bsUntil = Math.max(bsUntil, this.cavalryDoctrineBackSealUntil);
      if (this._hasNode('E6') && now < this.fortressBackSealUntil) bsUntil = Math.max(bsUntil, this.fortressBackSealUntil);
      if (this._hasNode('F6') && now < this.skirmishBackSealUntil) bsUntil = Math.max(bsUntil, this.skirmishBackSealUntil);
    }
    tokens.backSeal = { active: bsActive, gauge: bsActive ? c01((bsUntil - now) / 4000) : 0 };

    // A-2 Iron Wall (A6)
    const iwDist = bal.modifiers.nodes.ironWall?.flagDist ?? DEF.modifiers.nodes.ironWall!.flagDist;
    const pFlagDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.flagX, this.flagY);
    tokens.cmdBlockIronWall = { active: this._hasNode('A6') && pFlagDist > iwDist };

    // A-3 Skirmish (F6) — blocked inside flag
    const skDist = bal.modifiers.nodes.skirmishDoctrine?.flagDist ?? DEF.modifiers.nodes.skirmishDoctrine!.flagDist;
    tokens.cmdBlockSkirmish = { active: this._hasNode('F6') && pFlagDist <= skDist };

    // A-4 Mark Lock (D1)
    tokens.markLock = { active: this._hasNode('D1') && now < this.markLockUntil, gauge: c01((this.markLockUntil - now) / 2000) };

    // A-5 Commander damage zero (B6)
    tokens.cmdDmgZeroB6 = { active: this._hasNode('B6') };

    // A-6 Army suppressed — moving (E1)
    tokens.armySuppMoving = { active: this._hasNode('E1') && this.player.isMoving };

    // A-7 Army suppressed — still (F1)
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
    tokens.armySuppStill = { active: this._hasNode('F1') && speed < 10 };

    // A-8 Army suppressed — no mark (D6)
    tokens.armySuppNoMark = { active: this._hasNode('D6') && !this.tacticalMarkTarget };

    // A-9 Archer suppressed — move start (E5)
    tokens.archerSuppMove = { active: this._hasNode('E5') && now < this.moveStartPenaltyUntil, gauge: c01((this.moveStartPenaltyUntil - now) / 1000) };

    // A-10 Archer suppressed — stationary (F2)
    tokens.archerSuppStill = { active: this._hasNode('F2') && !this.player.isMoving };

    // A-11 Dash disabled (E6)
    tokens.dashDisabled = { active: this._hasNode('E6') };

    // A-12 Cavalry intercept-only (C6)
    tokens.cavalryIntercept = { active: this._hasNode('C6') };

    // A-13 Scatter forbidden (D3)
    tokens.scatterForbidden = { active: this._hasNode('D3') && !!(this.tacticalMarkTarget && this.tacticalMarkTarget.active) };

    // A-14 Backward restricted (F5)
    const f5Dur = bal.modifiers.nodes.noBackwalk?.backDirDur ?? DEF.modifiers.nodes.noBackwalk!.backDirDur;
    tokens.backwardRestricted = { active: this._hasNode('F5') && this.f5BackDirTimer > 0, gauge: c01(this.f5BackDirTimer / f5Dur) };

    // ─── B. Windows / Timing ───

    // B-1 Volley
    const vElapsed = now - this.volleyCycleStart;
    const vc = bal.game.volleyCycle;
    const vw = bal.game.volleyWindow;
    const vPhase = vElapsed % vc;
    tokens.volley = { active: this._isVolleyWindowOpen(), gauge: c01(1 - vPhase / vw) };

    // B-2 Rhythm window (P4)
    const hasRhythm = this._hasSup('rhythmWindow');
    if (hasRhythm) {
      const rw = bal.modifiers.supports.rhythmWindow;
      const re = now - this.rhythmCycleStart;
      const rCycle = rw?.cycleDur ?? 3700;
      const rStart = rw?.powerStart ?? 3000;
      const rPhase = re % rCycle;
      const rOpen = rPhase >= rStart;
      tokens.rhythmWindow = { active: rOpen, gauge: rOpen ? c01(1 - (rPhase - rStart) / (rCycle - rStart)) : 0 };
    } else {
      tokens.rhythmWindow = { active: false };
    }

    // B-3 Dash Prime window (P1)
    tokens.dashPrimeWindow = { active: now < this.dashPrimeUntil, gauge: c01((this.dashPrimeUntil - now) / 1000) };

    // B-4 Dash Tax window (P7)
    tokens.dashTaxWindow = { active: now < this.dashTaxBuffUntil, gauge: c01((this.dashTaxBuffUntil - now) / 1500) };

    // B-5 Flank weaken (E4)
    tokens.flankWeaken = { active: this._hasNode('E4') && now < this.stillRewardWeakenUntil, gauge: c01((this.stillRewardWeakenUntil - now) / 4000) };

    // B-6 Mark kill reward (D4)
    tokens.markKillReward = { active: this._hasNode('D4') && now < this.markKillRewardBuffUntil, gauge: c01((this.markKillRewardBuffUntil - now) / 3000) };

    // B-7 Execution exit (D6)
    let exActive = false;
    let exX = 0, exY = 0, exGauge = 0;
    if (this._hasNode('D6') && this.tacticalMarkTarget && this.tacticalMarkTarget.active) {
      const exUntil = this.executionDoctrineTargets.get(this.tacticalMarkTarget);
      if (exUntil && now < exUntil) {
        exActive = true;
        exX = this.tacticalMarkTarget.x;
        exY = this.tacticalMarkTarget.y;
        exGauge = c01((exUntil - now) / 2000);
      }
    }
    tokens.executionExit = { active: exActive, gauge: exGauge, x: exX, y: exY };

    // B-8 Charge
    if (this.isCharging) {
      const chargeDur = bal.commander.chargeDuration ?? 600;
      const chargeProgress = c01((now - this.chargeStartTime) / chargeDur);
      tokens.charge = { active: true, gauge: chargeProgress };
    } else {
      tokens.charge = { active: false };
    }

    // ─── C. Buffs ───

    // C-1 Army speed boost (P1)
    tokens.armySpeedBoost = { active: now < this.armySpeedBoostUntil, gauge: c01((this.armySpeedBoostUntil - now) / 1000) };

    // C-2 Commitment Lock still damage bonus (P10)
    tokens.stillDmgBonus = { active: this._hasSup('commitmentLock') && !this.player.isMoving };

    // C-3 K5 consecutive stacks
    tokens.k5Stack = { active: ks === 'singleTargetOath' && this.k5ConsecutiveHits > 0, stacks: this.k5ConsecutiveHits % 3 || (this.k5ConsecutiveHits > 0 ? 3 : 0) };

    // C-4 Stillness iframes (K2 + optional ironSkin)
    tokens.stillIframes = { active: ks === 'stillnessStance' && !this.player.isMoving };

    // C-5 Momentum speed boost (K3)
    tokens.momentumSpeed = { active: ks === 'momentumMode' && this.player.isMoving };

    // C-6 Heal counter (K6 fragilePower or I1 bloodOath)
    const healCount = ks === 'fragilePower' ? this.k6HealCounter : (this.build.item === 'bloodOath' ? this.i1HealCounter : 0);
    tokens.healCounter = { active: healCount > 0, stacks: healCount };

    // C-7 Squad protect
    tokens.squadProtectV = { active: now < this.squadProtectUntil.vanguard, gauge: c01((this.squadProtectUntil.vanguard - now) / 1500) };
    tokens.squadProtectA = { active: now < this.squadProtectUntil.archer, gauge: c01((this.squadProtectUntil.archer - now) / 1500) };
    tokens.squadProtectC = { active: now < this.squadProtectUntil.cavalry, gauge: c01((this.squadProtectUntil.cavalry - now) / 1500) };

    // ─── D. Debuffs / Penalties ───

    // D-1 K5 switch penalty — no persistent state, skip (applied inline during damage calc)
    tokens.k5SwitchPenalty = { active: false };

    // D-2 Commitment Lock move penalty (P10)
    tokens.commitMovePenalty = { active: this._hasSup('commitmentLock') && this.player.isMoving };

    // D-3 Front line collapse
    tokens.frontLineCollapse = { active: !this.frontLineIntact, gauge: c01((this.frontLineCollapseUntil - now) / 3000) };

    // D-4 Momentum still penalty (K3)
    tokens.momentumStillPen = { active: ks === 'momentumMode' && !this.player.isMoving };

    // D-5 Stillness move penalty (K2)
    tokens.stillnessMovePen = { active: ks === 'stillnessStance' && this.player.isMoving };

    // ─── E. Focus / Target ───

    // E-1 Mark
    const markActive = !!(this.tacticalMarkTarget && this.tacticalMarkTarget.active && now < this.tacticalMarkUntil);
    tokens.mark = {
      active: markActive,
      gauge: markActive ? c01((this.tacticalMarkUntil - now) / 3000) : 0,
      x: markActive ? this.tacticalMarkTarget!.x : 0,
      y: markActive ? this.tacticalMarkTarget!.y : 0,
    };

    // E-3 Aura anchor (K2 stillness stance)
    tokens.auraAnchor = {
      active: ks === 'stillnessStance' && now < this.ssAnchorUntil,
      gauge: c01((this.ssAnchorUntil - now) / 2000),
      x: this.ssAnchorX,
      y: this.ssAnchorY,
    };

    // E-6 Reform
    const reformDur = bal.commander.reformDuration ?? 550;
    tokens.reform = { active: this.reformActive, gauge: this.reformActive ? c01((this.reformUntil - now) / reformDur) : 0 };

    // E-7 Contract
    tokens.contract = { active: this.contractType !== null && now < this.contractUntil, gauge: c01((this.contractUntil - now) / 18000) };

    // E4-bonus Still progress
    const stillDur = bal.modifiers.nodes.stillReward?.stillDur ?? DEF.modifiers.nodes.stillReward!.stillDur;
    tokens.stillProgress = { active: this._hasNode('E4') && !this.player.isMoving && this.stillRewardTimer > 0, gauge: c01(this.stillRewardTimer / stillDur) };

    // ─── Build snapshot ───
    const bsAnchorX = this.flagX - this.committedDirX * 120;
    const bsAnchorY = this.flagY - this.committedDirY * 120;

    this.ruleTokens.update({
      now,
      playerX: this.player.x, playerY: this.player.y,
      vanguardX: this.anchorPosV.x, vanguardY: this.anchorPosV.y,
      archerX: this.anchorPosA.x, archerY: this.anchorPosA.y,
      cavalryX: this.anchorPosC.x, cavalryY: this.anchorPosC.y,
      flagX: this.flagX, flagY: this.flagY,
      backSealX: bsAnchorX, backSealY: bsAnchorY,
      tokens,
    });
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
  // DEBUG OVERLAY
  // ═══════════════════════════════════════════════════════════════

  private _drawSquadDebug(): void {
    const g = this.debugGfx;
    const hud = this.debugHudGfx;
    g.clear();
    hud.clear();

    const squadColor: Record<string, number> = {
      vanguard: COLOR.vanguard,
      archer: COLOR.archer,
      cavalry: COLOR.cavalry,
    };

    const counts = { vanguard: { total: 0, FORMING: 0, HOLD: 0, ENGAGE: 0 },
                     archer:   { total: 0, FORMING: 0, HOLD: 0, ENGAGE: 0 },
                     cavalry:  { total: 0, FORMING: 0, HOLD: 0, ENGAGE: 0 } };

    const drawnEngageRadius = { vanguard: false, archer: false, cavalry: false };

    for (const u of this.armyUnits) {
      if (!u.active) continue;
      const sq = u.squadType;
      const col = squadColor[sq];
      counts[sq].total++;
      counts[sq][u.state]++;

      // 1. Slot marker (small X)
      const sx = u.slotX, sy = u.slotY;
      g.lineStyle(1, col, 0.4);
      g.beginPath(); g.moveTo(sx - 4, sy - 4); g.lineTo(sx + 4, sy + 4); g.strokePath();
      g.beginPath(); g.moveTo(sx + 4, sy - 4); g.lineTo(sx - 4, sy + 4); g.strokePath();

      // 2. Unit → slot line
      g.lineStyle(1, col, 0.15);
      g.beginPath(); g.moveTo(u.x, u.y); g.lineTo(sx, sy); g.strokePath();

      // 3. Target line
      if (u.lockedTarget && (u.lockedTarget as Phaser.GameObjects.Components.Transform).x !== undefined) {
        const t = u.lockedTarget as Phaser.GameObjects.Components.Transform;
        g.lineStyle(2, col, 0.5);
        g.beginPath(); g.moveTo(u.x, u.y); g.lineTo(t.x, t.y); g.strokePath();
      }

      // 4. State indicator below unit
      const iy = u.y + 14;
      if (u.state === 'FORMING') {
        g.lineStyle(1, col, 0.6);
        g.strokeCircle(u.x, iy, 4);
      } else if (u.state === 'HOLD') {
        g.lineStyle(1, col, 0.6);
        g.strokeRect(u.x - 4, iy - 4, 8, 8);
      } else if (u.state === 'ENGAGE') {
        g.fillStyle(0xff4444, 0.7);
        g.fillCircle(u.x, iy, 4);
      }

      // 5. Engage/return radius (one per squad)
      if (!drawnEngageRadius[sq]) {
        drawnEngageRadius[sq] = true;
        // Engage radius — dotted via segmented arcs
        g.lineStyle(1, col, 0.08);
        const segs = 24;
        for (let i = 0; i < segs; i += 2) {
          const a0 = (i / segs) * Math.PI * 2;
          const a1 = ((i + 1) / segs) * Math.PI * 2;
          g.beginPath();
          g.arc(u.slotX, u.slotY, u.engageRadius, a0, a1, false);
          g.strokePath();
        }
        // Return radius — solid
        g.lineStyle(1, col, 0.05);
        g.strokeCircle(u.slotX, u.slotY, u.returnRadius);
      }
    }

    // 6. Anchor crosses
    const crosses: Array<{ pos: { x: number; y: number }; col: number }> = [
      { pos: this.anchorPosV, col: COLOR.vanguard },
      { pos: this.anchorPosA, col: COLOR.archer },
      { pos: this.anchorPosC, col: COLOR.cavalry },
    ];
    for (const { pos, col } of crosses) {
      g.lineStyle(2, col, 0.6);
      g.beginPath(); g.moveTo(pos.x - 12, pos.y); g.lineTo(pos.x + 12, pos.y); g.strokePath();
      g.beginPath(); g.moveTo(pos.x, pos.y - 12); g.lineTo(pos.x, pos.y + 12); g.strokePath();
    }

    // 7. Aura circle
    if (this.auraActive) {
      g.lineStyle(1, 0x00ff88, 0.2);
      g.strokeCircle(this.auraCenterX, this.auraCenterY, this.auraRadius);
    }

    // 8. Archer range (420px)
    const aLeader = this._getArcherLeader();
    g.lineStyle(1, COLOR.archer, 0.12);
    g.strokeCircle(aLeader.x, aLeader.y, 420);

    // 9. Archer dead zone (120px)
    g.lineStyle(1, 0xff4444, 0.12);
    g.strokeCircle(aLeader.x, aLeader.y, CLOSE_RANGE);

    // 10. Formation direction line
    const dirLen = 180;
    g.lineStyle(2, 0xffffff, 0.4);
    g.beginPath();
    g.moveTo(this.player.x, this.player.y);
    g.lineTo(this.player.x + this.committedDirX * dirLen, this.player.y + this.committedDirY * dirLen);
    g.strokePath();

    // 11. Reform direction
    if (this.reformActive) {
      g.lineStyle(2, 0xffff00, 0.5);
      g.beginPath();
      g.moveTo(this.player.x, this.player.y);
      g.lineTo(this.player.x + this.reformFrozenDirX * dirLen, this.player.y + this.reformFrozenDirY * dirLen);
      g.strokePath();
    }

    // 12. Tactical mark pulsing ring
    if (this.tacticalMarkTarget && this.tacticalMarkTarget.active) {
      const t = this.tacticalMarkTarget;
      const pulse = 18 + Math.sin(this.time.now * 0.006) * 6;
      g.lineStyle(2, 0xff00ff, 0.5);
      g.strokeCircle(t.x, t.y, pulse);
    }

    // 13. Cavalry cover centers (diamond marker) + intercept lines
    for (const u of this.armyUnits) {
      if (!u.active || u.squadType !== 'cavalry') continue;
      // Cover center diamond
      const ccx = u.coverX, ccy = u.coverY;
      g.lineStyle(1, COLOR.cavalry, 0.5);
      g.beginPath();
      g.moveTo(ccx, ccy - 6); g.lineTo(ccx + 6, ccy);
      g.lineTo(ccx, ccy + 6); g.lineTo(ccx - 6, ccy);
      g.closePath(); g.strokePath();
      // Intercept/egress target line
      if ((u.cavPhase === 'intercept' || u.cavPhase === 'disrupt' || u.cavPhase === 'egress') && (u.cavTargetX !== 0 || u.cavTargetY !== 0)) {
        g.lineStyle(1, 0xff8800, 0.4);
        g.beginPath(); g.moveTo(u.x, u.y); g.lineTo(u.cavTargetX, u.cavTargetY); g.strokePath();
        // Target dot
        g.fillStyle(0xff8800, 0.6);
        g.fillCircle(u.cavTargetX, u.cavTargetY, 3);
      }
      // Phase label
      const lbl = u.cavPhase.charAt(0).toUpperCase();
      g.fillStyle(COLOR.cavalry, 0.5);
      g.fillCircle(u.x + 10, u.y - 10, 5);
      // Use tiny text-like indicator: S=seek, I=intercept, D=disrupt, E=egress
    }

    // 14. Vanguard protect radii + intercept markers
    const vb = this.balanceData.units.vanguard;
    const protR = vb.protectR ?? 220;
    const protR2 = vb.protectR2 ?? 240;
    // Commander protect radius
    g.lineStyle(1, COLOR.vanguard, 0.15);
    g.strokeCircle(this.player.x, this.player.y, protR);
    // Archer leader protect radius
    const aLdr = this._getArcherLeader();
    g.lineStyle(1, COLOR.vanguard, 0.10);
    g.strokeCircle(aLdr.x, aLdr.y, protR2);
    // Intercept indicator on vanguards
    for (const u of this.armyUnits) {
      if (!u.active || u.squadType !== 'vanguard') continue;
      if (u.guardThreatSince > 0 && (this.time.now - u.guardThreatSince >= (vb.guardThreatMs ?? 120))) {
        g.fillStyle(0xff8800, 0.6);
        g.fillTriangle(u.x, u.y - 16, u.x - 5, u.y - 10, u.x + 5, u.y - 10);
      }
    }

    // ── Screen-space text panel ──
    const rules = this._buildRules();
    const v = counts.vanguard, a = counts.archer, cv = counts.cavalry;
    const markStr = this.tacticalMarkTarget && this.tacticalMarkTarget.active
      ? `(${Math.round(this.tacticalMarkTarget.x)},${Math.round(this.tacticalMarkTarget.y)})`
      : 'none';
    const k5Str = (this.k5LastTarget && this.k5LastTarget.active)
      ? `(${Math.round(this.k5LastTarget.x)},${Math.round(this.k5LastTarget.y)})`
      : 'none';

    const lines = [
      '[F] Squad Debug',
      '\u2500'.repeat(24),
      `\uC120\uBD09  ${v.total}  FORM:${v.FORMING}  HOLD:${v.HOLD}  ENG:${v.ENGAGE}`,
      `\uAD81\uBCD1  ${a.total}  FORM:${a.FORMING}  HOLD:${a.HOLD}  ENG:${a.ENGAGE}`,
      `\uAE30\uBCD1  ${cv.total}  FORM:${cv.FORMING}  HOLD:${cv.HOLD}  ENG:${cv.ENGAGE}`,
      '\u2500'.repeat(24),
      `Reform: ${this.reformActive ? 'ON' : 'OFF'} | AtkOff: ${rules.armyAttackOff ? 'YES' : 'NO'} | ArchFire: ${rules.archerFireOff ? 'YES' : 'NO'}`,
      `Volley: ${rules.isVolleyOpen ? 'OPEN' : 'LOCKED'} | SpeedMult: ${rules.speedMult.toFixed(2)}`,
      `Mark: ${markStr} | K5: ${k5Str}`,
      `Aura: ${this.auraActive ? 'ON' : 'OFF'} r=${this.auraRadius}`,
      `Dir: (${this.committedDirX.toFixed(2)}, ${this.committedDirY.toFixed(2)})`,
      // Cavalry phase breakdown
      ...(() => {
        const cavUnits = this.armyUnits.filter(u => u.active && u.squadType === 'cavalry');
        if (cavUnits.length === 0) return [];
        const phases = { seek_gap: 0, intercept: 0, disrupt: 0, egress: 0 };
        for (const u of cavUnits) phases[u.cavPhase]++;
        return [`CavPhase: S:${phases.seek_gap} I:${phases.intercept} D:${phases.disrupt} E:${phases.egress}`];
      })(),
    ];
    this.debugText.setText(lines.join('\n'));
  }

}
