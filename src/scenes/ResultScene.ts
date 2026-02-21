import Phaser from 'phaser';

export class ResultScene extends Phaser.Scene {
  private _data = { survived: false, kills: 0, build: null as any, elapsed: 0 };

  constructor() { super({ key: 'ResultScene' }); }

  init(data: any): void { this._data = data; }

  create(): void {
    const W  = this.scale.width;
    const H  = this.scale.height;
    const cx = W / 2;
    const { survived, kills } = this._data;

    this.add.text(cx, H / 2 - 130, survived ? '스테이지 클리어' : '사망', {
      fontSize: '64px',
      color: survived ? '#00ff88' : '#ff4444',
      fontFamily: 'Courier New',
      align: 'center',
      wordWrap: { width: W - 80 },
      padding: { top: 16, bottom: 4 },
    }).setOrigin(0.5);

    this.add.text(cx, H / 2 - 30, `처치 ${kills}`, {
      fontSize: '28px', color: '#aaaaaa', fontFamily: 'Courier New',
      wordWrap: { width: W - 80 },
      padding: { top: 8, bottom: 2 },
    }).setOrigin(0.5);

    // Doctrine Fit (3-line feedback)
    const elapsed = this._data.elapsed || 0;
    const killRate = elapsed > 0 ? kills / elapsed : 0;
    const line1 = survived ? '빌드 적합: 스테이지 생존 성공' : '빌드 부적합: 생존 실패';
    const line2 = killRate > 0.5 ? '전투 효율: 높음' : killRate > 0.3 ? '전투 효율: 보통' : '전투 효율: 낮음';
    this.add.text(cx, H / 2 + 20, `${line1}\n${line2}`, {
      fontSize: '22px', color: '#888888', fontFamily: 'Courier New',
      align: 'center',
      wordWrap: { width: W - 80 },
      padding: { top: 6, bottom: 2 },
    }).setOrigin(0.5);

    // Retry button
    const retryBtn = this.add.text(cx - 180, H / 2 + 130, '재시작', {
      fontSize: '28px', color: '#ffaa00', fontFamily: 'Courier New',
      backgroundColor: '#1a1a1a', padding: { x: 24, y: 16 },
      wordWrap: { width: 360 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    retryBtn.on('pointerdown', () => {
      if (this._data.build) this.scene.start('GameScene', { build: this._data.build });
      else this.scene.start('BuildScene');
    });
    retryBtn.on('pointerover', () => retryBtn.setColor('#ffffff'));
    retryBtn.on('pointerout',  () => retryBtn.setColor('#ffaa00'));

    // Build button
    const buildBtn = this.add.text(cx + 180, H / 2 + 130, '빌드 변경', {
      fontSize: '28px', color: '#00ff88', fontFamily: 'Courier New',
      backgroundColor: '#1a1a1a', padding: { x: 24, y: 16 },
      wordWrap: { width: 360 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    buildBtn.on('pointerdown', () => this.scene.start('BuildScene'));
    buildBtn.on('pointerover', () => buildBtn.setColor('#ffffff'));
    buildBtn.on('pointerout',  () => buildBtn.setColor('#00ff88'));

    // Keyboard shortcuts
    this.input.keyboard!.on('keydown-R', () => {
      if (this._data.build) this.scene.start('GameScene', { build: this._data.build });
      else this.scene.start('BuildScene');
    });
    this.input.keyboard!.on('keydown-B', () => {
      this.scene.start('BuildScene');
    });
  }
}
