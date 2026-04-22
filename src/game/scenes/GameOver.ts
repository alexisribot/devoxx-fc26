import { Scene } from "phaser";
import { EventBus } from "../EventBus";

export class GameOver extends Scene {
    private keyHandler?: (e: KeyboardEvent) => void;

    constructor() {
        super("GameOver");
    }

    create(data: Record<string, unknown> = {}) {
        const winner = (data.winner as number) ?? 1;
        const score = (data.score as number[]) ?? [0, 0];
        const stats = (data.matchStats as { shots: [number, number]; goals: [number, number] }) ?? null;
        const tournament = !!data.tournament;
        const roundWins = (data.roundWins as [number, number]) ?? [0, 0];
        const tourWinner = (data.tournamentWinner as number | null) ?? null;
        const chaosMode = !!data.chaosMode;
        const { width, height } = this.scale;
        const cx = width / 2;
        const cy = height / 2;

        // ── Background ────────────────────────────────────────────────────────
        const g = this.add.graphics();
        g.fillStyle(winner === 1 ? 0x0a2a4a : 0x4a0a0a);
        g.fillRect(0, 0, width, height);

        // Stone tile pattern
        g.fillStyle(winner === 1 ? 0x0d3060 : 0x600d0d, 0.5);
        for (let row = 0; row < height; row += 40) {
            const off = (Math.floor(row / 40) % 2) * 60;
            for (let col = -60 + off; col < width; col += 120) g.fillRect(col, row, 118, 38);
        }

        // Corner torches
        ["🔦", "🔦", "🔦", "🔦"].forEach((t, i) => {
            const tx = i % 2 === 0 ? 30 : width - 30;
            const ty = i < 2 ? 30 : height - 30;
            this.add.text(tx, ty, t, { fontSize: "28px" }).setOrigin(0.5);
        });

        // ── FIFA 1026 header ──────────────────────────────────────────────────
        this.add
            .text(cx, 28, "FIFA 1026", {
                fontFamily: "Arial Black",
                fontSize: 18,
                color: "#ccaa44",
                stroke: "#000000",
                strokeThickness: 4
            })
            .setOrigin(0.5);

        // ── Tournament round wins ─────────────────────────────────────────────
        if (tournament) {
            const badge = tourWinner ? "🏆 CHAMPION DU TOURNOI 🏆" : `Manches : ⚔️${roundWins[0]}  –  ${roundWins[1]}⚔️`;
            this.add
                .text(cx, 58, badge, {
                    fontFamily: "Arial Black",
                    fontSize: 16,
                    color: "#ffdd44",
                    stroke: "#000000",
                    strokeThickness: 3
                })
                .setOrigin(0.5);
        }

        // ── Winner banner (animated) ──────────────────────────────────────────
        const winColor = winner === 1 ? "#6699ff" : "#ff6666";
        const winLabel = winner === 1 ? "⚔️  Chevalier Bleu" : "⚔️  Chevalier Rouge";

        const bannerY = cy - 115;
        const bannerBg = this.add.rectangle(cx, bannerY, 600, 68, winner === 1 ? 0x112255 : 0x551111).setStrokeStyle(3, winner === 1 ? 0x4488ff : 0xff4444);

        const winText = this.add
            .text(cx, bannerY, winLabel, {
                fontFamily: "Arial Black",
                fontSize: 42,
                color: winColor,
                stroke: "#000000",
                strokeThickness: 8
            })
            .setOrigin(0.5)
            .setAlpha(0)
            .setScale(0.5);

        this.tweens.add({
            targets: [bannerBg, winText],
            alpha: 1,
            scaleX: { from: 0.3, to: 1 },
            scaleY: { from: 0.3, to: 1 },
            duration: 500,
            ease: "Back.Out"
        });

        // Drop banner decoration strips
        for (let i = 0; i < 8; i++) {
            const bx = cx - 280 + i * 80;
            const col = winner === 1 ? (i % 2 === 0 ? 0x2255bb : 0x4488ff) : i % 2 === 0 ? 0xbb2222 : 0xff4444;
            const strip = this.add.rectangle(bx, -30, 14, 60, col).setAlpha(0.8);
            this.tweens.add({
                targets: strip,
                y: bannerY - 38 + (i % 3) * 8,
                duration: 600 + i * 60,
                ease: "Bounce.Out",
                delay: 200 + i * 40
            });
        }

        this.add
            .text(cx, cy - 48, "a remporté la manche !", {
                fontFamily: "Arial Black",
                fontSize: 28,
                color: "#ffff44",
                stroke: "#000000",
                strokeThickness: 7
            })
            .setOrigin(0.5);

        // ── Score ─────────────────────────────────────────────────────────────
        this.add
            .text(cx, cy + 10, `Score final : ${score[0]} – ${score[1]}`, {
                fontFamily: "Arial Black",
                fontSize: 28,
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 5
            })
            .setOrigin(0.5);

        // ── Stats ─────────────────────────────────────────────────────────────
        if (stats) {
            const statY = cy + 58;
            this.add
                .text(cx, statY, `Tirs : ⚔️${stats.shots[0]}   vs   ${stats.shots[1]}⚔️`, {
                    fontFamily: "Arial",
                    fontSize: 16,
                    color: "#dddddd",
                    stroke: "#000000",
                    strokeThickness: 2
                })
                .setOrigin(0.5);

            const accuracy1 = stats.shots[0] > 0 ? Math.round((stats.goals[0] / stats.shots[0]) * 100) : 0;
            const accuracy2 = stats.shots[1] > 0 ? Math.round((stats.goals[1] / stats.shots[1]) * 100) : 0;
            this.add
                .text(cx, statY + 24, `Précision : ${accuracy1}%   vs   ${accuracy2}%`, {
                    fontFamily: "Arial",
                    fontSize: 14,
                    color: "#aaaaaa",
                    stroke: "#000000",
                    strokeThickness: 2
                })
                .setOrigin(0.5);
        }

        // ── Mode badge ────────────────────────────────────────────────────────
        if (chaosMode) {
            this.add
                .text(cx, cy + 105, "🌀 Mode GUERRE", {
                    fontFamily: "Arial Black",
                    fontSize: 14,
                    color: "#ff8800",
                    stroke: "#000000",
                    strokeThickness: 3
                })
                .setOrigin(0.5);
        }

        // ── Next action ───────────────────────────────────────────────────────
        const nextLabel = tournament && !tourWinner ? "Appuyez sur une touche  →  Prochaine manche" : "Appuyez sur une touche  →  Menu principal";
        const restart = this.add
            .text(cx, cy + 140, nextLabel, {
                fontFamily: "Arial Black",
                fontSize: 18,
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 4
            })
            .setOrigin(0.5);

        this.tweens.add({ targets: restart, alpha: 0.15, duration: 550, yoyo: true, repeat: -1 });

        this.keyHandler = () => {
            if (this.keyHandler) {
                window.removeEventListener("keydown", this.keyHandler);
                this.keyHandler = undefined;
            }
            if (tournament && !tourWinner) {
                // Play next round
                this.scene.start("Game", { chaosMode, tournament: true, roundWins });
            } else {
                this.scene.start("MainMenu");
            }
        };
        window.addEventListener("keydown", this.keyHandler);
        this.input.once("pointerdown", () => this.keyHandler && this.keyHandler(new KeyboardEvent("keydown")));

        EventBus.emit("current-scene-ready", this);
    }
}
