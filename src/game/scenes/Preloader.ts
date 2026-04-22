import { Scene } from 'phaser';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    create ()
    {
        this.scene.start('MainMenu');
    }
}
