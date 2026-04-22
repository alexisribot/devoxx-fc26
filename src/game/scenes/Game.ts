import * as Phaser from "phaser";
import { Scene } from "phaser";
import { EventBus } from "../EventBus";

// ── Field geometry ────────────────────────────────────────────────────────────
const W = 1024;
const H = 768;
const FIELD_L = 60;
const FIELD_R = 964;
const FIELD_T = 60;
const FIELD_B = 708;
const CX = W / 2;
const CY = H / 2;
const GOAL_HALF = 80;
const WALL_THICK = 20;

// ── Base physics ──────────────────────────────────────────────────────────────
const PLAYER_R = 22;
const BALL_R = 12;
const PLAYER_SPEED = 230; // px / s
const BASE_BALL_MAX = 600; // px / s  (normal mode)
const BALL_FRICTION = 0.72; // speed fraction remaining after 1 s
const TOUCH_PUSH = 180; // px / s – passive contact push
const SHOOT_SPEED = 680; // px / s – shoot impulse
const SHOOT_COOLDOWN_MS = 500;
const WIN_SCORE = 5;

// ── Dash & charged shot ─────────────────────────────────────────────────────────
const DASH_SPEED = 700;
const DASH_DURATION_MS = 180;
const DASH_COOLDOWN_MS = 1400;
const CHARGE_MAX_MS = 700;
const SHOOT_SPEED_CHARGED = 1100;

// ── Medieval crier phrases ──────────────────────────────────────────────
const GOAL_PHRASES = [
    "✝ Huzzah ! Splendide frappe !",
    "✝ Pour la Couronne !",
    "✝ Victoire pour les braves !",
    "✝ Par les dieux !",
    "✝ Traître ! Tu paieras cela !",
    "✝ Vive le Roi !",
    "✝ Magnifique, noble chevalier !",
    "✝ L’honneur est sauf !"
];

// ── Power-up system ───────────────────────────────────────────────────────────
const POWERUP_SPAWN_INTERVAL = 8000; // ms between spawns
const POWERUP_DURATION = 10000; // ms bonus lasts
const POWERUP_MAX = 3; // max simultaneous on field

type BonusType =
    | "speed_boost"
    | "power_shot"
    | "magnet"
    | "shield"
    | "confusion"
    | "big_size"
    | "shrink_opp"
    | "auto_goal"
    | "curse_ball"
    | "fog_of_war"
    | "second_ball";

const BONUS_ICONS: Record<BonusType, string> = {
    speed_boost: "⚡",
    power_shot: "💥",
    magnet: "🧲",
    shield: "🛡",
    confusion: "🌀",
    big_size: "👾",
    shrink_opp: "🐭",
    auto_goal: "🎯",
    curse_ball: "🧗",
    fog_of_war: "🌫️",
    second_ball: "⚽"
};

const BONUS_COLORS: Record<BonusType, number> = {
    speed_boost: 0xffff00,
    power_shot: 0xff4400,
    magnet: 0x00ffff,
    shield: 0x4488ff,
    confusion: 0xff00ff,
    big_size: 0x00ff88,
    shrink_opp: 0xff8844,
    auto_goal: 0xffffff,
    curse_ball: 0x9900ff,
    fog_of_war: 0x336688,
    second_ball: 0xddaa00
};

const BONUS_LABELS: Record<BonusType, string> = {
    speed_boost: "TURBO !",
    power_shot: "SUPER FRAPPE !",
    magnet: "BALLON AIMANTÉ !",
    shield: "BOUCLIER !",
    confusion: "CONFUSION !",
    big_size: "GÉANT !",
    shrink_opp: "MINIATURE !",
    auto_goal: "AUTO-BUT !",
    curse_ball: "MALÉDICTION !",
    fog_of_war: "BROUILLARD DE GUERRE !",
    second_ball: "DEUXIÈME BALLON !"
};

// ── Types ─────────────────────────────────────────────────────────────────────
type KeySet = {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    shoot: Phaser.Input.Keyboard.Key;
    dash: Phaser.Input.Keyboard.Key;
};

interface PlayerState {
    x: number;
    y: number;
    facingAngle: number;
    container: Phaser.GameObjects.Container;
    shootCooldown: number;
    activeBonus: { type: BonusType; expiresAt: number } | null;
    sizeMultiplier: number;
    confused: boolean;
    confusedUntil: number;
    shrunkUntil: number;
    // dash
    dashCooldown: number;
    dashActive: number;
    dashVx: number;
    dashVy: number;
    // charged shot
    shootHeldSince: number; // 0 = not held
    chargeBar: Phaser.GameObjects.Rectangle;
    // stats
    shots: number;
    goals: number;
}

interface ObstacleState {
    x: number;
    y: number;
    r: number;
    vx: number;
    vy: number;
    shape: Phaser.GameObjects.Arc;
    label: Phaser.GameObjects.Text;
    teleportIn: number; // ms until next teleport
}

interface PowerUpItem {
    id: number;
    x: number;
    y: number;
    type: BonusType;
    container: Phaser.GameObjects.Container;
}

interface BallState {
    x: number;
    y: number;
    vx: number;
    vy: number;
    shape: Phaser.GameObjects.Arc;
    cursed: boolean;
    cursedUntil: number;
    curseTimer: number;
}

// ─────────────────────────────────────────────────────────────────────────────
export class Game extends Scene {
    private p1!: PlayerState;
    private p2!: PlayerState;
    private ball!: BallState;
    private score!: [number, number];
    private startTime!: number;
    private scoreText!: Phaser.GameObjects.Text;
    private timerText!: Phaser.GameObjects.Text;
    private goalText!: Phaser.GameObjects.Text;
    private keys1!: KeySet;
    private keys2!: KeySet;
    private resetting = false;

    // ── Chaos state ───────────────────────────────────────────────────────────
    private chaosMode = false;
    private annText!: Phaser.GameObjects.Text;
    private fogOverlay!: Phaser.GameObjects.Rectangle;
    private fogActive = false;
    private fogUntil = 0;

    // ── Obstacles ─────────────────────────────────────────────────────────────
    private obstacles: ObstacleState[] = [];

    // ── Second ball (chaos bonus) ────────────────────────────────────────
    private secondBall: BallState | null = null;
    private secondBallUntil = 0;

    // ── Tournament ────────────────────────────────────────────────────────────
    private tournament = false;
    private roundWins: [number, number] = [0, 0];
    private matchStats!: { shots: [number, number]; goals: [number, number] };
    private tourneyText!: Phaser.GameObjects.Text;

    // ── Power-up system ───────────────────────────────────────────────────────
    private powerUps: PowerUpItem[] = [];
    private powerUpIdCounter = 0;
    private bonusIndicator1!: Phaser.GameObjects.Text;
    private bonusIndicator2!: Phaser.GameObjects.Text;

    constructor() {
        super("Game");
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    init(data: Record<string, unknown>) {
        this.chaosMode = !!data?.chaosMode;
        this.tournament = !!data?.tournament;
        this.roundWins = (data?.roundWins as [number, number]) ?? [0, 0];
        this.powerUps = [];
        this.powerUpIdCounter = 0;
        this.secondBall = null;
        this.secondBallUntil = 0;
        this.fogActive = false;
        this.fogUntil = 0;
        this.obstacles = [];
    }

    create() {
        this.score = [0, 0];
        this.matchStats = { shots: [0, 0], goals: [0, 0] };
        this.startTime = this.time.now;
        this.resetting = false;

        this.drawField();
        this.createObstacles();
        this.createPlayers();
        this.createBall();
        this.setupKeys();
        this.createUI();

        if (this.chaosMode) {
            this.time.delayedCall(3000, () => this.spawnPowerUp());
            this.time.delayedCall(5500, () => this.spawnPowerUp());
            this.time.addEvent({
                delay: POWERUP_SPAWN_INTERVAL,
                callback: this.spawnPowerUp,
                callbackScope: this,
                loop: true
            });
        }

        EventBus.emit("current-scene-ready", this);
    }

    update(_time: number, delta: number) {
        if (this.resetting) return;

        const dt = delta / 1000;
        const now = this.time.now;

        if (this.chaosMode) {
            this.updateSizeAndConfusion();
            this.checkPowerUpCollisions();
            this.updateFog(now);
        }

        // Curse ball
        this.updateCurseBall(delta, this.ball);
        if (this.secondBall) this.updateCurseBall(delta, this.secondBall);

        // Second ball expiry
        if (this.secondBall && now > this.secondBallUntil) {
            this.secondBall.shape.destroy();
            this.secondBall = null;
        }

        // Dash
        this.handleDash(this.p1, this.keys1, delta);
        this.handleDash(this.p2, this.keys2, delta);

        this.movePlayer(this.p1, this.keys1, dt);
        this.movePlayer(this.p2, this.keys2, dt);

        this.p1.shootCooldown = Math.max(0, this.p1.shootCooldown - delta);
        this.p2.shootCooldown = Math.max(0, this.p2.shootCooldown - delta);

        // Charged shoot
        this.handleChargeShoot(this.p1, this.keys1, now);
        this.handleChargeShoot(this.p2, this.keys2, now);
        this.updateChargeBar(this.p1, now);
        this.updateChargeBar(this.p2, now);

        // Friction
        const friction = Math.pow(BALL_FRICTION, dt);
        this.ball.vx *= friction;
        this.ball.vy *= friction;
        if (this.secondBall) {
            this.secondBall.vx *= friction;
            this.secondBall.vy *= friction;
        }

        // Magnet
        for (const player of [this.p1, this.p2]) {
            if (player.activeBonus?.type === "magnet") {
                this.applyMagnet(player, this.ball, dt);
                if (this.secondBall) this.applyMagnet(player, this.secondBall, dt);
            }
        }

        // Auto-goal
        if (this.p1.activeBonus?.type === "auto_goal") this.ball.vx += 220 * dt;
        if (this.p2.activeBonus?.type === "auto_goal") this.ball.vx -= 220 * dt;

        // Speed cap
        this.capBallSpeed(this.ball);
        if (this.secondBall) this.capBallSpeed(this.secondBall);

        this.ball.x += this.ball.vx * dt;
        this.ball.y += this.ball.vy * dt;
        if (this.secondBall) {
            this.secondBall.x += this.secondBall.vx * dt;
            this.secondBall.y += this.secondBall.vy * dt;
        }

        this.wallBounce(this.ball);
        if (this.secondBall) this.wallBounce(this.secondBall);

        // Obstacle collisions
        this.updateObstacles(dt);
        for (const obs of this.obstacles) {
            this.obstacleBallCollision(obs, this.ball);
            if (this.secondBall) this.obstacleBallCollision(obs, this.secondBall);
        }

        this.playerBallCollision(this.p1, this.ball);
        this.playerBallCollision(this.p2, this.ball);
        if (this.secondBall) {
            this.playerBallCollision(this.p1, this.secondBall);
            this.playerBallCollision(this.p2, this.secondBall);
        }

        this.checkGoal(this.ball);
        if (this.secondBall) this.checkGoal(this.secondBall);

        // Sync visuals
        this.p1.container.setPosition(this.p1.x, this.p1.y);
        this.p2.container.setPosition(this.p2.x, this.p2.y);
        this.ball.shape.setPosition(this.ball.x, this.ball.y);
        if (this.secondBall) this.secondBall.shape.setPosition(this.secondBall.x, this.secondBall.y);

        if (this.chaosMode) {
            this.updateBonusIndicator(this.bonusIndicator1, this.p1);
            this.updateBonusIndicator(this.bonusIndicator2, this.p2);
        }

        this.updateTimer();
    }

    // ── Setup helpers ─────────────────────────────────────────────────────────

    private drawField() {
        const g = this.add.graphics();

        // ── Outer surround – dark stone ground ───────────────────────────────
        g.fillStyle(0x2a1f10);
        g.fillRect(0, 0, W, H);

        // ── Dirt field – terra cotta / packed earth ───────────────────────────
        g.fillStyle(0x7a5c2e);
        g.fillRect(FIELD_L, FIELD_T, FIELD_R - FIELD_L, FIELD_B - FIELD_T);

        // Alternating dirt stripes (lighter band every 2)
        const sw = (FIELD_R - FIELD_L) / 8;
        g.fillStyle(0x896633, 0.5);
        for (let i = 0; i < 8; i += 2) g.fillRect(FIELD_L + i * sw, FIELD_T, sw, FIELD_B - FIELD_T);

        // ── Field markings – chalky stone lines ───────────────────────────────
        g.lineStyle(2, 0xd4b87a, 0.8);
        g.beginPath();
        g.moveTo(CX, FIELD_T);
        g.lineTo(CX, FIELD_B);
        g.strokePath();
        g.strokeCircle(CX, CY, 80);
        g.fillStyle(0xd4b87a, 0.8);
        g.fillCircle(CX, CY, 5);

        // ── Stone walls ───────────────────────────────────────────────────────
        g.fillStyle(0x888070);
        g.fillRect(FIELD_L, FIELD_T - WALL_THICK, FIELD_R - FIELD_L, WALL_THICK);
        g.fillRect(FIELD_L, FIELD_B, FIELD_R - FIELD_L, WALL_THICK);
        g.fillRect(FIELD_L - WALL_THICK, FIELD_T - WALL_THICK, WALL_THICK, CY - GOAL_HALF - FIELD_T + WALL_THICK);
        g.fillRect(FIELD_L - WALL_THICK, CY + GOAL_HALF, WALL_THICK, FIELD_B - (CY + GOAL_HALF) + WALL_THICK);
        g.fillRect(FIELD_R, FIELD_T - WALL_THICK, WALL_THICK, CY - GOAL_HALF - FIELD_T + WALL_THICK);
        g.fillRect(FIELD_R, CY + GOAL_HALF, WALL_THICK, FIELD_B - (CY + GOAL_HALF) + WALL_THICK);

        // Stone block texture lines on walls
        g.lineStyle(1, 0x55504a, 0.5);
        for (let y = FIELD_T - WALL_THICK; y < FIELD_B + WALL_THICK; y += 12) {
            g.beginPath();
            g.moveTo(FIELD_L, y);
            g.lineTo(FIELD_R, y);
            g.strokePath();
        }

        // ── Goals – wooden banners (P1 = blue banner, P2 = red banner) ────────
        g.fillStyle(0x2244aa, 0.75);
        g.fillRect(FIELD_L - WALL_THICK - 50, CY - GOAL_HALF, 50, GOAL_HALF * 2);
        g.fillStyle(0xaa2222, 0.75);
        g.fillRect(FIELD_R + WALL_THICK, CY - GOAL_HALF, 50, GOAL_HALF * 2);

        // Goal post dots (iron bolts)
        g.fillStyle(0xddddcc);
        g.fillCircle(FIELD_L - WALL_THICK, CY - GOAL_HALF, 5);
        g.fillCircle(FIELD_L - WALL_THICK, CY + GOAL_HALF, 5);
        g.fillCircle(FIELD_R + WALL_THICK, CY - GOAL_HALF, 5);
        g.fillCircle(FIELD_R + WALL_THICK, CY + GOAL_HALF, 5);

        g.lineStyle(2, 0xddddcc, 0.5);
        g.beginPath();
        g.moveTo(FIELD_L - WALL_THICK - 50, CY - GOAL_HALF);
        g.lineTo(FIELD_L - WALL_THICK - 50, CY + GOAL_HALF);
        g.strokePath();
        g.beginPath();
        g.moveTo(FIELD_R + WALL_THICK + 50, CY - GOAL_HALF);
        g.lineTo(FIELD_R + WALL_THICK + 50, CY + GOAL_HALF);
        g.strokePath();

        // ── Corner torches (emoji) ────────────────────────────────────────────
        const torchStyle = { fontFamily: "Arial", fontSize: 20 };
        this.add
            .text(FIELD_L - 2, FIELD_T - 2, "🔦", torchStyle)
            .setOrigin(1, 1)
            .setDepth(2);
        this.add
            .text(FIELD_R + 2, FIELD_T - 2, "🔦", torchStyle)
            .setOrigin(0, 1)
            .setDepth(2);
        this.add
            .text(FIELD_L - 2, FIELD_B + 2, "🔦", torchStyle)
            .setOrigin(1, 0)
            .setDepth(2);
        this.add
            .text(FIELD_R + 2, FIELD_B + 2, "🔦", torchStyle)
            .setOrigin(0, 0)
            .setDepth(2);
    }

    private makePlayerContainer(x: number, y: number, bodyColor: number, strokeColor: number, label: string): Phaser.GameObjects.Container {
        // Shadow
        const shadow = this.add.circle(3, 4, PLAYER_R, 0x000000);
        shadow.setAlpha(0.4);

        // Armor body
        const body = this.add.circle(0, 0, PLAYER_R, bodyColor);
        body.setStrokeStyle(3, strokeColor);

        // Cross / shield motif on chest
        const crossV = this.add.rectangle(0, 0, 4, PLAYER_R * 1.1, strokeColor);
        crossV.setAlpha(0.6);
        const crossH = this.add.rectangle(0, -2, PLAYER_R * 0.9, 4, strokeColor);
        crossH.setAlpha(0.6);

        // Helmet visor dot (direction indicator)
        const visor = this.add.circle(0, -Math.round(PLAYER_R * 0.62), Math.round(PLAYER_R * 0.28), 0xddddcc);
        visor.setAlpha(0.9);

        // Number
        const num = this.add
            .text(0, 0, label, {
                fontFamily: "Arial Black",
                fontSize: 13,
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 3
            })
            .setOrigin(0.5);

        const container = this.add.container(x, y, [shadow, body, crossV, crossH, visor, num]);
        container.setDepth(5);
        return container;
    }

    private createPlayers() {
        const skinP1 = parseInt(localStorage.getItem("skin_p1") ?? "0x3366cc") || 0x3366cc;
        const skinP2 = parseInt(localStorage.getItem("skin_p2") ?? "0xcc2222") || 0xcc2222;

        const makeBar = () => this.add.rectangle(0, 0, 0, 4, 0x88ff44).setOrigin(0, 0.5).setDepth(12).setVisible(false);

        const c1 = this.makePlayerContainer(CX / 2, CY, skinP1, 0x1133aa, "1");
        this.p1 = {
            x: CX / 2,
            y: CY,
            facingAngle: 0,
            container: c1,
            shootCooldown: 0,
            activeBonus: null,
            sizeMultiplier: 1,
            confused: false,
            confusedUntil: 0,
            shrunkUntil: 0,
            dashCooldown: 0,
            dashActive: 0,
            dashVx: 0,
            dashVy: 0,
            shootHeldSince: 0,
            chargeBar: makeBar(),
            shots: 0,
            goals: 0
        };

        const c2 = this.makePlayerContainer(CX + CX / 2, CY, skinP2, 0x880000, "2");
        this.p2 = {
            x: CX + CX / 2,
            y: CY,
            facingAngle: Math.PI,
            container: c2,
            shootCooldown: 0,
            activeBonus: null,
            sizeMultiplier: 1,
            confused: false,
            confusedUntil: 0,
            shrunkUntil: 0,
            dashCooldown: 0,
            dashActive: 0,
            dashVx: 0,
            dashVy: 0,
            shootHeldSince: 0,
            chargeBar: makeBar(),
            shots: 0,
            goals: 0
        };
    }

    private createBall() {
        // Leather ball – brown with dark seams
        const c = this.add.circle(CX, CY, BALL_R, 0x8b5e2a);
        c.setStrokeStyle(2, 0x3a2000);
        c.setDepth(6);
        this.ball = { x: CX, y: CY, vx: 0, vy: 0, shape: c, cursed: false, cursedUntil: 0, curseTimer: 0 };
    }

    private setupKeys() {
        const kb = this.input.keyboard!;
        this.keys1 = {
            up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
            down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
            right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
            shoot: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
            dash: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
        };
        this.keys2 = {
            up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
            down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
            left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
            right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
            shoot: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
            dash: kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_0)
        };
    }

    private createUI() {
        this.scoreText = this.add
            .text(CX, 42, "0  –  0", {
                fontFamily: "Arial Black",
                fontSize: 30,
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 5
            })
            .setOrigin(0.5)
            .setDepth(10);

        this.timerText = this.add
            .text(W - 8, 28, "00:00", {
                fontFamily: "Arial",
                fontSize: 17,
                color: "#eeeeee",
                stroke: "#000000",
                strokeThickness: 3
            })
            .setOrigin(1, 0)
            .setDepth(10);

        this.add
            .text(8, H - 8, "P1 : ZQSD + Espace  ⚔️", {
                fontFamily: "Arial",
                fontSize: 12,
                color: "#aaffaa",
                stroke: "#000000",
                strokeThickness: 2
            })
            .setOrigin(0, 1)
            .setDepth(10);

        this.add
            .text(W - 8, H - 8, "⚔️  P2 : Flèches + Entrée", {
                fontFamily: "Arial",
                fontSize: 12,
                color: "#ffaaaa",
                stroke: "#000000",
                strokeThickness: 2
            })
            .setOrigin(1, 1)
            .setDepth(10);

        // Goal flash
        this.goalText = this.add
            .text(CX, CY, "BUT !", {
                fontFamily: "Arial Black",
                fontSize: 80,
                color: "#ffff00",
                stroke: "#000000",
                strokeThickness: 10
            })
            .setOrigin(0.5)
            .setDepth(20)
            .setVisible(false);

        // Announcement banner (chaos events)
        this.annText = this.add
            .text(CX, CY - 80, "", {
                fontFamily: "Arial Black",
                fontSize: 38,
                color: "#ff8800",
                stroke: "#000000",
                strokeThickness: 7,
                align: "center"
            })
            .setOrigin(0.5)
            .setDepth(25)
            .setAlpha(0);

        // Chaos mode badge
        if (this.chaosMode) {
            this.add
                .text(8, 8, "🌀 GUERRE", {
                    fontFamily: "Arial Black",
                    fontSize: 14,
                    color: "#ff8800",
                    stroke: "#000000",
                    strokeThickness: 3
                })
                .setOrigin(0, 0)
                .setDepth(10);
        }

        // Tournament wins display
        this.tourneyText = this.add
            .text(8, 28, "", { fontFamily: "Arial Black", fontSize: 13, color: "#ffdd44", stroke: "#000000", strokeThickness: 3 })
            .setOrigin(0, 0)
            .setDepth(10);
        if (this.tournament) {
            this.tourneyText.setText(`Manches : ⚔️${this.roundWins[0]}  –  ${this.roundWins[1]}⚔️`);
        }

        // Fog overlay (hidden by default)
        this.fogOverlay = this.add.rectangle(CX, CY, FIELD_R - FIELD_L, FIELD_B - FIELD_T, 0x000022, 0).setDepth(7);

        // Bonus indicators (follow players)
        this.bonusIndicator1 = this.add
            .text(0, 0, "", { fontFamily: "Arial", fontSize: 15, color: "#ffffff", stroke: "#000000", strokeThickness: 3 })
            .setOrigin(0.5, 1)
            .setDepth(9);
        this.bonusIndicator2 = this.add
            .text(0, 0, "", { fontFamily: "Arial", fontSize: 15, color: "#ffffff", stroke: "#000000", strokeThickness: 3 })
            .setOrigin(0.5, 1)
            .setDepth(9);
    }

    // ── Per-frame logic ───────────────────────────────────────────────────────

    private movePlayer(player: PlayerState, keys: KeySet, dt: number) {
        let dx = 0,
            dy = 0;
        if (keys.up.isDown) dy -= 1;
        if (keys.down.isDown) dy += 1;
        if (keys.left.isDown) dx -= 1;
        if (keys.right.isDown) dx += 1;

        if (player.confused) {
            dx = -dx;
            dy = -dy;
        }
        if (dx !== 0 && dy !== 0) {
            dx *= 0.7071;
            dy *= 0.7071;
        }

        let speed = PLAYER_SPEED;
        if (player.activeBonus?.type === "speed_boost") speed *= 1.7;
        if (player.sizeMultiplier < 1) speed *= 0.45;

        // Dash overrides normal movement
        if (player.dashActive > 0) {
            dx = player.dashVx / DASH_SPEED;
            dy = player.dashVy / DASH_SPEED;
            speed = DASH_SPEED;
        }

        const r = PLAYER_R * player.sizeMultiplier;
        const newX = Phaser.Math.Clamp(player.x + dx * speed * dt, FIELD_L + r, FIELD_R - r);
        const newY = Phaser.Math.Clamp(player.y + dy * speed * dt, FIELD_T + r, FIELD_B - r);

        // Dust while moving fast
        if (Math.abs(newX - player.x) + Math.abs(newY - player.y) > 2.5 && Math.random() < 0.15) {
            this.emitDust(player.x, player.y, 2);
        }

        player.x = newX;
        player.y = newY;

        if (dx !== 0 || dy !== 0) {
            player.facingAngle = Math.atan2(dy, dx) + Math.PI / 2;
            player.container.setRotation(player.facingAngle);
        }
    }

    private wallBounce(b: BallState) {
        const inGoalY = b.y >= CY - GOAL_HALF && b.y <= CY + GOAL_HALF;

        if (b.y - BALL_R < FIELD_T) {
            b.y = FIELD_T + BALL_R;
            if (b.vy < 0) b.vy = -b.vy;
        }
        if (b.y + BALL_R > FIELD_B) {
            b.y = FIELD_B - BALL_R;
            if (b.vy > 0) b.vy = -b.vy;
        }

        if (!inGoalY) {
            if (b.x - BALL_R < FIELD_L) {
                b.x = FIELD_L + BALL_R;
                if (b.vx < 0) b.vx = -b.vx;
            }
            if (b.x + BALL_R > FIELD_R) {
                b.x = FIELD_R - BALL_R;
                if (b.vx > 0) b.vx = -b.vx;
            }
        }
    }

    private playerBallCollision(player: PlayerState, ball: BallState) {
        const r = PLAYER_R * player.sizeMultiplier;
        const minDist = r + BALL_R;
        const dx = ball.x - player.x;
        const dy = ball.y - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= minDist || dist === 0) return;

        const nx = dx / dist;
        const ny = dy / dist;

        ball.x = player.x + nx * (minDist + 1);
        ball.y = player.y + ny * (minDist + 1);

        if (player.activeBonus?.type === "shield") {
            ball.vx = nx * SHOOT_SPEED * 0.85;
            ball.vy = ny * SHOOT_SPEED * 0.85;
            player.activeBonus = null;
            this.cameras.main.shake(180, 0.01);
        } else {
            const relVel = ball.vx * nx + ball.vy * ny;
            if (relVel < TOUCH_PUSH) {
                ball.vx += nx * (TOUCH_PUSH - relVel);
                ball.vy += ny * (TOUCH_PUSH - relVel);
            }
        }
    }

    private checkGoal(b: BallState) {
        const inGoalY = b.y >= CY - GOAL_HALF && b.y <= CY + GOAL_HALF;
        if (!inGoalY) return;

        if (b.x < FIELD_L - WALL_THICK) this.onGoal(1, b);
        else if (b.x > FIELD_R + WALL_THICK) this.onGoal(0, b);
    }

    private onGoal(scorer: number, _scoringBall: BallState) {
        if (this.resetting) return;
        this.resetting = true;
        this.score[scorer]++;
        this.matchStats.goals[scorer]++;

        // Track who scored for skins unlock
        const totalGoals = parseInt(localStorage.getItem("total_goals_p" + (scorer + 1)) ?? "0") + 1;
        localStorage.setItem("total_goals_p" + (scorer + 1), String(totalGoals));
        if (totalGoals >= 10) localStorage.setItem("skin_p" + (scorer + 1), scorer === 0 ? "0xffd700" : "0xff8c00");

        this.scoreText.setText(`${this.score[0]}  \u2013  ${this.score[1]}`);

        // Medieval crier
        const phrase = GOAL_PHRASES[Math.floor(Math.random() * GOAL_PHRASES.length)];
        const scorerName = scorer === 0 ? "Chevalier Bleu" : "Chevalier Rouge";
        this.goalText.setText(`BUT !\n${scorerName}\n${phrase}`);
        this.goalText.setVisible(true);
        this.cameras.main.shake(500, 0.015);

        if (this.chaosMode) this.clearAllPowerUps();

        this.time.delayedCall(2200, () => {
            this.goalText.setVisible(false);
            if (this.score[scorer] >= WIN_SCORE) {
                // Tournament logic
                if (this.tournament) {
                    const newRoundWins: [number, number] = [...this.roundWins] as [number, number];
                    newRoundWins[scorer]++;
                    const roundWinner = newRoundWins[0] >= 2 ? 0 : newRoundWins[1] >= 2 ? 1 : -1;
                    this.scene.start("GameOver", {
                        winner: scorer + 1,
                        score: [...this.score],
                        matchStats: this.matchStats,
                        tournament: true,
                        roundWins: newRoundWins,
                        tournamentWinner: roundWinner >= 0 ? roundWinner + 1 : null,
                        chaosMode: this.chaosMode
                    });
                } else {
                    this.scene.start("GameOver", {
                        winner: scorer + 1,
                        score: [...this.score],
                        matchStats: this.matchStats,
                        chaosMode: this.chaosMode
                    });
                }
            } else {
                this.resetPositions();
                this.resetting = false;
            }
        });
    }

    private resetPositions() {
        this.p1.x = CX / 2;
        this.p1.y = CY;
        this.p2.x = CX + CX / 2;
        this.p2.y = CY;
        this.ball.x = CX;
        this.ball.y = CY;
        this.ball.vx = 0;
        this.ball.vy = 0;
    }

    private updateTimer() {
        const elapsed = Math.floor((this.time.now - this.startTime) / 1000);
        const mm = Math.floor(elapsed / 60)
            .toString()
            .padStart(2, "0");
        const ss = (elapsed % 60).toString().padStart(2, "0");
        this.timerText.setText(`${mm}:${ss}`);
    }

    // ── Chaos system ──────────────────────────────────────────────────────────

    private showAnnouncement(label: string) {
        this.annText.setText(label).setAlpha(0).setVisible(true);

        this.tweens.add({
            targets: this.annText,
            alpha: 1,
            scaleX: { from: 0.5, to: 1 },
            scaleY: { from: 0.5, to: 1 },
            duration: 350,
            ease: "Back.Out",
            onComplete: () => {
                this.time.delayedCall(1400, () => {
                    this.tweens.add({
                        targets: this.annText,
                        alpha: 0,
                        duration: 400
                    });
                });
            }
        });
    }

    // ── Power-up system ───────────────────────────────────────────────────────

    private spawnPowerUp() {
        if (this.powerUps.length >= POWERUP_MAX) return;

        const types: BonusType[] = [
            "speed_boost",
            "power_shot",
            "magnet",
            "shield",
            "confusion",
            "big_size",
            "shrink_opp",
            "auto_goal",
            "curse_ball",
            "fog_of_war",
            "second_ball"
        ];
        const type = types[Math.floor(Math.random() * types.length)];

        const x = Phaser.Math.Between(FIELD_L + 80, FIELD_R - 80);
        const y = Phaser.Math.Between(FIELD_T + 80, FIELD_B - 80);

        const circle = this.add.circle(0, 0, 18, BONUS_COLORS[type], 0.85);
        circle.setStrokeStyle(2, 0xffffff, 0.9);

        const txt = this.add.text(0, 0, BONUS_ICONS[type], { fontFamily: "Arial", fontSize: 18 }).setOrigin(0.5);

        const container = this.add.container(x, y, [circle, txt]);
        container.setDepth(4);

        this.tweens.add({
            targets: container,
            scaleX: 1.3,
            scaleY: 1.3,
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: "Sine.InOut"
        });

        const id = this.powerUpIdCounter++;
        this.powerUps.push({ id, x, y, type, container });
    }

    private checkPowerUpCollisions() {
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const pu = this.powerUps[i];
            for (const [player, opponent] of [
                [this.p1, this.p2],
                [this.p2, this.p1]
            ] as [PlayerState, PlayerState][]) {
                const dist = Phaser.Math.Distance.Between(player.x, player.y, pu.x, pu.y);
                if (dist < PLAYER_R * player.sizeMultiplier + 18) {
                    pu.container.destroy();
                    this.powerUps.splice(i, 1);
                    this.applyBonus(player, opponent, pu.type);
                    this.showAnnouncement(`${BONUS_ICONS[pu.type]}  ${BONUS_LABELS[pu.type]}`);
                    break;
                }
            }
        }
    }

    private applyBonus(player: PlayerState, opponent: PlayerState, type: BonusType) {
        player.activeBonus = { type, expiresAt: this.time.now + POWERUP_DURATION };

        if (type === "big_size") {
            player.sizeMultiplier = 2;
            player.container.setScale(2);
        } else if (type === "confusion") {
            opponent.confusedUntil = this.time.now + POWERUP_DURATION;
            opponent.confused = true;
        } else if (type === "shrink_opp") {
            opponent.shrunkUntil = this.time.now + POWERUP_DURATION;
            opponent.sizeMultiplier = 0.5;
            opponent.container.setScale(0.5);
        } else if (type === "curse_ball") {
            this.ball.cursed = true;
            this.ball.cursedUntil = this.time.now + POWERUP_DURATION;
            this.ball.curseTimer = 0;
        } else if (type === "fog_of_war") {
            this.fogActive = true;
            this.fogUntil = this.time.now + POWERUP_DURATION;
            this.fogOverlay.setFillStyle(0x000022, 0.72);
        } else if (type === "second_ball") {
            if (!this.secondBall) {
                const c2 = this.add.circle(CX, CY - 60, BALL_R, 0xddaa00);
                c2.setStrokeStyle(2, 0x886600);
                c2.setDepth(6);
                this.secondBall = { x: CX, y: CY - 60, vx: 200, vy: -150, shape: c2, cursed: false, cursedUntil: 0, curseTimer: 0 };
                this.secondBallUntil = this.time.now + POWERUP_DURATION;
            }
        }

        this.time.delayedCall(POWERUP_DURATION, () => {
            if (player.activeBonus?.type === type) {
                player.activeBonus = null;
            }
            if (type === "fog_of_war") this.fogOverlay.setAlpha(0);
        });
    }

    private updateSizeAndConfusion() {
        for (const player of [this.p1, this.p2]) {
            // Confusion expiry
            if (player.confused && player.confusedUntil > 0 && this.time.now >= player.confusedUntil) {
                player.confused = false;
                player.confusedUntil = 0;
            }

            // Shrunk expiry
            if (player.shrunkUntil > 0 && this.time.now >= player.shrunkUntil) {
                player.shrunkUntil = 0;
                if (player.activeBonus?.type !== "big_size") {
                    player.sizeMultiplier = 1;
                    player.container.setScale(1);
                }
            }

            // big_size expiry (activeBonus already nulled by delayedCall)
            if (player.activeBonus?.type !== "big_size" && player.sizeMultiplier > 1 && player.shrunkUntil === 0) {
                player.sizeMultiplier = 1;
                player.container.setScale(1);
            }
        }
    }

    private clearAllPowerUps() {
        this.powerUps.forEach(pu => pu.container.destroy());
        this.powerUps = [];
        if (this.secondBall) {
            this.secondBall.shape.destroy();
            this.secondBall = null;
        }
        this.fogOverlay.setAlpha(0);
        this.fogActive = false;
        this.ball.cursed = false;
        for (const player of [this.p1, this.p2]) {
            player.activeBonus = null;
            player.confused = false;
            player.confusedUntil = 0;
            player.shrunkUntil = 0;
            player.sizeMultiplier = 1;
            player.container.setScale(1);
        }
        this.bonusIndicator1.setText("");
        this.bonusIndicator2.setText("");
    }

    private updateBonusIndicator(indicator: Phaser.GameObjects.Text, player: PlayerState) {
        if (player.activeBonus) {
            const remaining = Math.ceil(Math.max(0, player.activeBonus.expiresAt - this.time.now) / 1000);
            const icon = BONUS_ICONS[player.activeBonus.type];
            indicator.setText(`${icon} ${remaining}s`).setPosition(player.x, player.y - PLAYER_R * player.sizeMultiplier - 10);
        } else if (player.confused) {
            const remaining = Math.ceil(Math.max(0, player.confusedUntil - this.time.now) / 1000);
            indicator.setText(`🌀 ${remaining}s`).setPosition(player.x, player.y - PLAYER_R * player.sizeMultiplier - 10);
        } else if (player.shrunkUntil > 0 && this.time.now < player.shrunkUntil) {
            const remaining = Math.ceil(Math.max(0, player.shrunkUntil - this.time.now) / 1000);
            indicator.setText(`🐭 ${remaining}s`).setPosition(player.x, player.y - PLAYER_R * player.sizeMultiplier - 10);
        } else if (player.dashCooldown > 0) {
            indicator.setText(`🌪 ${Math.ceil(player.dashCooldown / 100) / 10}s`).setPosition(player.x, player.y - PLAYER_R * player.sizeMultiplier - 10);
        } else {
            indicator.setText("");
        }
    }

    // ── NEW SYSTEMS ───────────────────────────────────────────────────────────

    private createObstacles() {
        const COUNT = 3;
        const R_MIN = 12;
        const R_MAX = 22;
        // Keep obstacles away from goals and walls
        const margin = 60;
        const xMin = FIELD_L + WALL_THICK + margin;
        const xMax = FIELD_R - WALL_THICK - margin;
        const yMin = FIELD_T + WALL_THICK + margin;
        const yMax = FIELD_B - WALL_THICK - margin;
        // Exclude centre circle area and goal mouths
        const placed: { x: number; y: number; r: number }[] = [];

        const tooClose = (x: number, y: number, r: number) => {
            // centre circle exclusion
            if (Math.hypot(x - CX, y - CY) < 90) return true;
            // left/right goal mouth exclusion
            if (x < FIELD_L + 120 && Math.abs(y - CY) < GOAL_HALF + 30) return true;
            if (x > FIELD_R - 120 && Math.abs(y - CY) < GOAL_HALF + 30) return true;
            // too close to another obstacle
            for (const p of placed) {
                if (Math.hypot(x - p.x, y - p.y) < r + p.r + 30) return true;
            }
            return false;
        };

        let attempts = 0;
        while (placed.length < COUNT && attempts < 200) {
            attempts++;
            const r = R_MIN + Math.random() * (R_MAX - R_MIN);
            const x = xMin + Math.random() * (xMax - xMin);
            const y = yMin + Math.random() * (yMax - yMin);
            if (tooClose(x, y, r)) continue;
            placed.push({ x, y, r });
        }

        const OBS_SPEED = 55;
        for (const d of placed) {
            const shape = this.add.circle(d.x, d.y, d.r, 0x554433);
            shape.setStrokeStyle(3, 0x221100);
            shape.setDepth(3);
            const label = this.add
                .text(d.x, d.y, "🪨", { fontFamily: "Arial", fontSize: d.r * 1.5 })
                .setOrigin(0.5)
                .setDepth(4);
            const angle = Math.random() * Math.PI * 2;
            this.obstacles.push({
                x: d.x,
                y: d.y,
                r: d.r,
                vx: Math.cos(angle) * OBS_SPEED,
                vy: Math.sin(angle) * OBS_SPEED,
                shape,
                label,
                teleportIn: 4000 + Math.random() * 3000
            });
        }
    }

    private updateObstacles(dt: number) {
        const s = dt / 1000;
        const xMin = FIELD_L + WALL_THICK + 30;
        const xMax = FIELD_R - WALL_THICK - 30;
        const yMin = FIELD_T + WALL_THICK + 30;
        const yMax = FIELD_B - WALL_THICK - 30;

        const isSafe = (x: number, y: number, r: number, self: ObstacleState) => {
            if (Math.hypot(x - CX, y - CY) < 90) return false;
            if (x < FIELD_L + 120 && Math.abs(y - CY) < GOAL_HALF + r + 10) return false;
            if (x > FIELD_R - 120 && Math.abs(y - CY) < GOAL_HALF + r + 10) return false;
            for (const o of this.obstacles) {
                if (o === self) continue;
                if (Math.hypot(x - o.x, y - o.y) < r + o.r + 30) return false;
            }
            return true;
        };

        for (const obs of this.obstacles) {
            // Teleport countdown
            obs.teleportIn -= dt;
            if (obs.teleportIn <= 0) {
                // Flash then jump
                this.tweens.add({
                    targets: [obs.shape, obs.label],
                    alpha: 0,
                    duration: 120,
                    yoyo: true,
                    repeat: 2,
                    onComplete: () => {
                        let nx = 0,
                            ny = 0,
                            attempts = 0;
                        do {
                            nx = xMin + Math.random() * (xMax - xMin);
                            ny = yMin + Math.random() * (yMax - yMin);
                            attempts++;
                        } while (!isSafe(nx, ny, obs.r, obs) && attempts < 200);
                        obs.x = nx;
                        obs.y = ny;
                        const angle = Math.random() * Math.PI * 2;
                        const spd = 45 + Math.random() * 40;
                        obs.vx = Math.cos(angle) * spd;
                        obs.vy = Math.sin(angle) * spd;
                        obs.shape.setPosition(obs.x, obs.y);
                        obs.label.setPosition(obs.x, obs.y);
                        obs.shape.setAlpha(1);
                        obs.label.setAlpha(1);
                    }
                });
                obs.teleportIn = 4000 + Math.random() * 3000;
            }

            obs.x += obs.vx * s;
            obs.y += obs.vy * s;
            // Bounce off walls
            if (obs.x - obs.r < xMin) {
                obs.x = xMin + obs.r;
                obs.vx = Math.abs(obs.vx);
            }
            if (obs.x + obs.r > xMax) {
                obs.x = xMax - obs.r;
                obs.vx = -Math.abs(obs.vx);
            }
            if (obs.y - obs.r < yMin) {
                obs.y = yMin + obs.r;
                obs.vy = Math.abs(obs.vy);
            }
            if (obs.y + obs.r > yMax) {
                obs.y = yMax - obs.r;
                obs.vy = -Math.abs(obs.vy);
            }
            // Stay out of goal mouths
            if (obs.x < FIELD_L + 110 && Math.abs(obs.y - CY) < GOAL_HALF + obs.r) {
                obs.vx = Math.abs(obs.vx);
            }
            if (obs.x > FIELD_R - 110 && Math.abs(obs.y - CY) < GOAL_HALF + obs.r) {
                obs.vx = -Math.abs(obs.vx);
            }
            obs.shape.setPosition(obs.x, obs.y);
            obs.label.setPosition(obs.x, obs.y);
        }
    }

    private obstacleBallCollision(obs: ObstacleState, ball: BallState) {
        const minDist = obs.r + BALL_R;
        const dx = ball.x - obs.x;
        const dy = ball.y - obs.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= minDist || dist === 0) return;
        const nx = dx / dist,
            ny = dy / dist;
        ball.x = obs.x + nx * (minDist + 1);
        ball.y = obs.y + ny * (minDist + 1);
        const dot = ball.vx * nx + ball.vy * ny;
        ball.vx -= 2 * dot * nx;
        ball.vy -= 2 * dot * ny;
    }

    private handleChargeShoot(player: PlayerState, keys: KeySet, now: number) {
        const k = keys.shoot;
        if (Phaser.Input.Keyboard.JustDown(k) && player.shootCooldown <= 0) {
            player.shootHeldSince = now;
        }
        if (Phaser.Input.Keyboard.JustUp(k)) {
            if (player.shootHeldSince > 0 && player.shootCooldown <= 0) {
                const charge = Math.min((now - player.shootHeldSince) / CHARGE_MAX_MS, 1);
                this.doShoot(player, charge);
            }
            player.shootHeldSince = 0;
        }
    }

    private doShoot(player: PlayerState, chargeRatio: number) {
        const range = PLAYER_R * player.sizeMultiplier + BALL_R + 22;
        const dist1 = Phaser.Math.Distance.Between(player.x, player.y, this.ball.x, this.ball.y);
        const targetBall =
            dist1 <= range
                ? this.ball
                : this.secondBall && Phaser.Math.Distance.Between(player.x, player.y, this.secondBall.x, this.secondBall.y) <= range
                  ? this.secondBall
                  : null;
        if (!targetBall) return;

        const dx = targetBall.x - player.x;
        const dy = targetBall.y - player.y;
        const len = Math.hypot(dx, dy) || 1;
        let speed = SHOOT_SPEED + (SHOOT_SPEED_CHARGED - SHOOT_SPEED) * chargeRatio;
        if (player.activeBonus?.type === "power_shot") speed *= 1.5;

        targetBall.vx = (dx / len) * speed;
        targetBall.vy = (dy / len) * speed;
        player.shootCooldown = SHOOT_COOLDOWN_MS;
        player.shootHeldSince = 0;
        player.shots++;
        this.matchStats.shots[player === this.p1 ? 0 : 1]++;

        this.emitDust(player.x, player.y, 6);
        if (chargeRatio > 0.5) this.cameras.main.shake(80, 0.007 * chargeRatio);
    }

    private updateChargeBar(player: PlayerState, now: number) {
        if (player.shootHeldSince > 0 && player.shootCooldown <= 0) {
            const charge = Math.min((now - player.shootHeldSince) / CHARGE_MAX_MS, 1);
            const barW = Math.max(2, PLAYER_R * 2 * charge);
            const color = charge < 0.5 ? 0x88ff44 : charge < 0.8 ? 0xffee00 : 0xff3300;
            player.chargeBar
                .setSize(barW, 4)
                .setFillStyle(color)
                .setPosition(player.x - barW / 2, player.y - PLAYER_R * player.sizeMultiplier - 18)
                .setVisible(true);
        } else {
            player.chargeBar.setVisible(false);
        }
    }

    private handleDash(player: PlayerState, keys: KeySet, delta: number) {
        player.dashCooldown = Math.max(0, player.dashCooldown - delta);
        player.dashActive = Math.max(0, player.dashActive - delta);
        if (Phaser.Input.Keyboard.JustDown(keys.dash) && player.dashCooldown <= 0) {
            const angle = player.facingAngle - Math.PI / 2;
            player.dashVx = Math.cos(angle) * DASH_SPEED;
            player.dashVy = Math.sin(angle) * DASH_SPEED;
            player.dashActive = DASH_DURATION_MS;
            player.dashCooldown = DASH_COOLDOWN_MS;
            this.emitDust(player.x, player.y, 14);
        }
    }

    private applyMagnet(player: PlayerState, ball: BallState, dt: number) {
        const dx = player.x - ball.x;
        const dy = player.y - ball.y;
        const dist = Math.hypot(dx, dy) || 1;
        ball.vx += (dx / dist) * 350 * dt;
        ball.vy += (dy / dist) * 350 * dt;
    }

    private capBallSpeed(ball: BallState) {
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > BASE_BALL_MAX) {
            const r = BASE_BALL_MAX / speed;
            ball.vx *= r;
            ball.vy *= r;
        }
    }

    private updateCurseBall(delta: number, ball: BallState) {
        if (!ball.cursed) return;
        if (this.time.now > ball.cursedUntil) {
            ball.cursed = false;
            ball.shape.setStrokeStyle(2, 0x3a2000);
            return;
        }
        ball.curseTimer -= delta;
        if (ball.curseTimer <= 0) {
            ball.curseTimer = 350 + Math.random() * 300;
            const angle = Math.random() * Math.PI * 2;
            ball.vx += Math.cos(angle) * 260;
            ball.vy += Math.sin(angle) * 260;
        }
        ball.shape.setStrokeStyle(3, 0x9900ff);
    }

    private updateFog(now: number) {
        if (this.fogActive && now > this.fogUntil) {
            this.fogActive = false;
            this.fogOverlay.setAlpha(0);
        }
    }

    private emitDust(x: number, y: number, count: number) {
        for (let i = 0; i < count; i++) {
            const dot = this.add.circle(x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 16, 2 + Math.random() * 2, 0xc8a87a, 0.75).setDepth(4);
            this.tweens.add({
                targets: dot,
                alpha: 0,
                x: dot.x + (Math.random() - 0.5) * 28,
                y: dot.y + (Math.random() - 0.5) * 28,
                duration: 220 + Math.random() * 130,
                onComplete: () => dot.destroy()
            });
        }
    }
}
