import { AUTO, Game, Scale } from "phaser";
import { Boot } from "./scenes/Boot";
import { Game as MainGame } from "./scenes/Game";
import { GameOver } from "./scenes/GameOver";
import { MainMenu } from "./scenes/MainMenu";
import { Preloader } from "./scenes/Preloader";

const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 1024,
    height: 768,
    parent: "game-container",
    backgroundColor: "#1a6b1a",
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH,
        width: 1024,
        height: 768
    },
    scene: [Boot, Preloader, MainMenu, MainGame, GameOver]
};

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
};

export default StartGame;
