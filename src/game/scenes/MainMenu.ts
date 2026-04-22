import * as Phaser from "phaser";
import { Scene } from "phaser";
import { EventBus } from "../EventBus";

export class MainMenu extends Scene {
    private selectedMode = 0; // 0 = Normal, 1 = Guerre
    private selectedTournament = false;
    private normalBox!: Phaser.GameObjects.Container;
    private chaosBox!: Phaser.GameObjects.Container;
    private tourneyBtn!: Phaser.GameObjects.Container;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

    constructor() {
        super("MainMenu");
    }

    create() {
        const { width, height } = this.scale;
        const cx = width / 2;
        const cy = height / 2;

        // Medieval stone background
        const g = this.add.graphics();
        g.fillStyle(0x1a1208);
        g.fillRect(0, 0, width, height);
        g.fillStyle(0x2a2015, 0.7);
        for (let row = 0; row < height; row += 40) {
            const offset = (Math.floor(row / 40) % 2) * 60;
            for (let col = -60 + offset; col < width; col += 120) g.fillRect(col, row, 118, 38);
        }

        // Torches
        this.add.text(30, 30, "🔦", { fontSize: 32 });
        this.add.text(width - 30, 30, "🔦", { fontSize: 32 }).setOrigin(1, 0);
        this.add.text(30, height - 30, "🔦", { fontSize: 32 }).setOrigin(0, 1);
        this.add.text(width - 30, height - 30, "🔦", { fontSize: 32 }).setOrigin(1, 1);

        // Title
        this.add
            .text(cx, cy - 158, "⚔️  FIFA 1026  ⚔️", {
                fontFamily: "Arial Black",
                fontSize: 52,
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 8,
                align: "center"
            })
            .setOrigin(0.5);

        // Skin preview circles
        const skinP1 = parseInt(localStorage.getItem("skin_p1") ?? "0") || 0x3366cc;
        const skinP2 = parseInt(localStorage.getItem("skin_p2") ?? "0") || 0xcc2222;
        const totalP1 = parseInt(localStorage.getItem("total_goals_p1") ?? "0");
        const totalP2 = parseInt(localStorage.getItem("total_goals_p2") ?? "0");
        this.add.circle(cx - 180, cy - 65, 18, skinP1).setStrokeStyle(3, 0xffffff);
        this.add.circle(cx + 180, cy - 65, 18, skinP2).setStrokeStyle(3, 0xffffff);
        if (totalP1 >= 10) this.add.text(cx - 180, cy - 92, "⭐ Skin doré !", { fontFamily: "Arial", fontSize: 11, color: "#ffd700" }).setOrigin(0.5);
        if (totalP2 >= 10) this.add.text(cx + 180, cy - 92, "⭐ Skin doré !", { fontFamily: "Arial", fontSize: 11, color: "#ffd700" }).setOrigin(0.5);

        // Controls
        this.add
            .text(cx - 160, cy - 65, "🛡  Chevalier 1", {
                fontFamily: "Arial Black",
                fontSize: 16,
                color: "#6699ff"
            })
            .setOrigin(0.5);
        this.add
            .text(cx - 160, cy - 42, "ZQSD + Espace + Shift(dash)", {
                fontFamily: "Arial",
                fontSize: 12,
                color: "#aaccff"
            })
            .setOrigin(0.5);
        this.add
            .text(cx + 160, cy - 65, "⚔️  Chevalier 2", {
                fontFamily: "Arial Black",
                fontSize: 16,
                color: "#ff6666"
            })
            .setOrigin(0.5);
        this.add
            .text(cx + 160, cy - 42, "Flèches + Entrée + Num0(dash)", {
                fontFamily: "Arial",
                fontSize: 12,
                color: "#ffaaaa"
            })
            .setOrigin(0.5);
        this.add
            .text(cx, cy - 8, "★  Premier à 5 buts remporte la manche  ★  Tir chargé : maintenir la touche", {
                fontFamily: "Arial",
                fontSize: 12,
                color: "#ffdd44",
                stroke: "#000000",
                strokeThickness: 2
            })
            .setOrigin(0.5);

        // Mode selection
        this.add
            .text(cx, cy + 38, "Mode de jeu :", {
                fontFamily: "Arial Black",
                fontSize: 17,
                color: "#cccccc",
                stroke: "#000000",
                strokeThickness: 3
            })
            .setOrigin(0.5);

        this.normalBox = this.buildModeBox(cx - 130, cy + 95, "⚔️  MATCH", "#88ffaa", false);
        this.chaosBox = this.buildModeBox(cx + 130, cy + 95, "🌀  GUERRE", "#ffaa33", true);

        // Tournament toggle
        this.tourneyBtn = this.buildTourneyBtn(cx, cy + 155);

        this.add
            .text(cx, cy + 198, "← → choisir mode  ·  T activer tournoi  ·  ENTRÉE lancer", {
                fontFamily: "Arial",
                fontSize: 13,
                color: "#888888",
                stroke: "#000000",
                strokeThickness: 2
            })
            .setOrigin(0.5);

        this.refreshSelection();

        // Input
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.input.keyboard!.once("keydown-ENTER", () => this.launch());
        this.input.keyboard!.on("keydown-SPACE", () => this.launch());
        this.input.keyboard!.on("keydown-LEFT", () => {
            this.selectedMode = 0;
            this.refreshSelection();
        });
        this.input.keyboard!.on("keydown-RIGHT", () => {
            this.selectedMode = 1;
            this.refreshSelection();
        });
        this.input.keyboard!.on("keydown-Q", () => {
            this.selectedMode = 0;
            this.refreshSelection();
        });
        this.input.keyboard!.on("keydown-D", () => {
            this.selectedMode = 1;
            this.refreshSelection();
        });
        this.input.keyboard!.on("keydown-T", () => {
            this.selectedTournament = !this.selectedTournament;
            this.refreshSelection();
        });

        this.normalBox.setInteractive(new Phaser.Geom.Rectangle(-110, -30, 220, 60), Phaser.Geom.Rectangle.Contains).on("pointerdown", () => {
            this.selectedMode = 0;
            this.launch();
        });
        this.chaosBox.setInteractive(new Phaser.Geom.Rectangle(-110, -30, 220, 60), Phaser.Geom.Rectangle.Contains).on("pointerdown", () => {
            this.selectedMode = 1;
            this.launch();
        });
        this.tourneyBtn.setInteractive(new Phaser.Geom.Rectangle(-100, -20, 200, 40), Phaser.Geom.Rectangle.Contains).on("pointerdown", () => {
            this.selectedTournament = !this.selectedTournament;
            this.refreshSelection();
        });

        EventBus.emit("current-scene-ready", this);
    }

    private buildModeBox(x: number, y: number, label: string, textColor: string, isChaos: boolean): Phaser.GameObjects.Container {
        const bg = this.add.rectangle(0, 0, 220, 60, isChaos ? 0x220000 : 0x002200).setStrokeStyle(3, isChaos ? 0xff6600 : 0x00cc44);
        const txt = this.add
            .text(0, 0, label, {
                fontFamily: "Arial Black",
                fontSize: isChaos ? 20 : 22,
                color: textColor,
                stroke: "#000000",
                strokeThickness: 4
            })
            .setOrigin(0.5);
        const container = this.add.container(x, y, [bg, txt]);
        container.setDepth(5);
        return container;
    }

    private buildTourneyBtn(x: number, y: number): Phaser.GameObjects.Container {
        const bg = this.add.rectangle(0, 0, 200, 40, 0x1a1208).setStrokeStyle(2, 0x888888);
        const txt = this.add
            .text(0, 0, "🏆 Tournoi BO3 : OFF", {
                fontFamily: "Arial Black",
                fontSize: 14,
                color: "#aaaaaa",
                stroke: "#000000",
                strokeThickness: 3
            })
            .setOrigin(0.5);
        const container = this.add.container(x, y, [bg, txt]);
        container.setDepth(5);
        return container;
    }

    private refreshSelection() {
        const normalBg = this.normalBox.list[0] as Phaser.GameObjects.Rectangle;
        const chaosBg = this.chaosBox.list[0] as Phaser.GameObjects.Rectangle;
        const tBg = this.tourneyBtn.list[0] as Phaser.GameObjects.Rectangle;
        const tTxt = this.tourneyBtn.list[1] as Phaser.GameObjects.Text;

        if (this.selectedMode === 0) {
            this.normalBox.setScale(1.08);
            this.chaosBox.setScale(0.93);
            normalBg.setStrokeStyle(4, 0x00ff55);
            chaosBg.setStrokeStyle(2, 0x884400);
        } else {
            this.normalBox.setScale(0.93);
            this.chaosBox.setScale(1.08);
            normalBg.setStrokeStyle(2, 0x006622);
            chaosBg.setStrokeStyle(4, 0xff8800);
        }

        if (this.selectedTournament) {
            tBg.setStrokeStyle(3, 0xffdd44).setFillStyle(0x2a2000);
            tTxt.setText("🏆 Tournoi BO3 : ON").setColor("#ffdd44");
        } else {
            tBg.setStrokeStyle(2, 0x888888).setFillStyle(0x1a1208);
            tTxt.setText("🏆 Tournoi BO3 : OFF").setColor("#aaaaaa");
        }
    }

    private launch() {
        this.input.keyboard!.removeAllListeners();
        this.scene.start("Game", {
            chaosMode: this.selectedMode === 1,
            tournament: this.selectedTournament,
            roundWins: [0, 0]
        });
    }

    update() {
        void this.cursors;
    }
}
