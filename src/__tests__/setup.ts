/**
 * Phaser mock for unit tests.
 * Provides minimal stubs so entity/policy code can be tested without a browser.
 */
import { vi } from 'vitest';

// Minimal Physics.Arcade.Body mock
class MockBody {
  velocity = { x: 0, y: 0 };
}

// Minimal Image mock (base for entities)
class MockImage {
  scene: any;
  x: number;
  y: number;
  active = true;
  depth = 0;
  alpha = 1;
  body = new MockBody();

  constructor(scene: any, x: number, y: number, _texture?: string) {
    this.scene = scene;
    this.x = x;
    this.y = y;
  }

  setVelocity(vx: number, vy: number) {
    this.body.velocity.x = vx;
    this.body.velocity.y = vy;
    return this;
  }
  setDepth(d: number) { this.depth = d; return this; }
  setAlpha(a: number) { this.alpha = a; return this; }
  setTint(_c: number) { return this; }
  setCollideWorldBounds(_b: boolean) { return this; }
  setOrigin(..._args: number[]) { return this; }
  destroy(_fromScene?: boolean) { this.active = false; }
}

// Minimal Scene mock
export function createMockScene(now = 0) {
  return {
    time: { now, delayedCall: vi.fn() },
    game: { loop: { delta: 16 } },
    add: {
      existing: vi.fn(),
      graphics: vi.fn(() => ({
        clear: vi.fn().mockReturnThis(),
        lineStyle: vi.fn().mockReturnThis(),
        lineBetween: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      })),
    },
    physics: {
      add: {
        existing: vi.fn(),
      },
    },
    input: {
      keyboard: {
        createCursorKeys: vi.fn(() => ({
          left: { isDown: false },
          right: { isDown: false },
          up: { isDown: false },
          down: { isDown: false },
        })),
        addKeys: vi.fn(() => ({
          up: { isDown: false },
          down: { isDown: false },
          left: { isDown: false },
          right: { isDown: false },
        })),
        addKey: vi.fn(() => ({ isDown: false })),
      },
    },
    scale: { width: 1920, height: 1080 },
  };
}

// Stub Phaser global
const PhaserMock = {
  Physics: {
    Arcade: {
      Image: MockImage,
      Body: MockBody,
    },
  },
  Math: {
    Distance: {
      Between: (x1: number, y1: number, x2: number, y2: number) =>
        Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2),
    },
    Angle: {
      Between: (x1: number, y1: number, x2: number, y2: number) =>
        Math.atan2(y2 - y1, x2 - x1),
    },
    Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
    FloatBetween: (min: number, max: number) => (min + max) / 2,
  },
  Input: {
    Keyboard: {
      KeyCodes: { W: 87, A: 65, S: 83, D: 68, SHIFT: 16 },
    },
  },
  Scene: class { constructor(_config: any) {} },
  GameObjects: { GameObject: class {} },
};

// Install mock before Phaser is imported by modules
vi.mock('phaser', () => ({ default: PhaserMock, ...PhaserMock }));

export { PhaserMock, MockImage, MockBody };
