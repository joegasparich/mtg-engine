import { Container,Rectangle,Sprite,Text,Texture } from "pixi.js";

// Positions in the printed card face, expressed relative to Scryfall's 672 × 936 image.
const CAPSULE_X = 578 / 672;
const CAPSULE_Y = 860 / 936;
const PATCH_WIDTH = 72 / 672;
const PATCH_HEIGHT = 34 / 936;
const BLANK_STRIP_Y = 842 / 936;
const BLANK_STRIP_HEIGHT = 3 / 936;

enum StatColour {
    Neutral = 0x201a16,
    Higher = 0x155c32,
    Lower = 0x962326,
}

function statColour(value: number, base: number): StatColour {
    if (value > base)
        return StatColour.Higher;
    if (value < base)
        return StatColour.Lower;
    return StatColour.Neutral;
}

export class UICardPowerToughness extends Container {
    private readonly numbers = new Container();
    private readonly powerText: Text;
    private readonly separator: Text;
    private readonly toughnessText: Text;
    private readonly maxTextWidth: number;

    constructor(texture: Texture, cardWidth: number, cardHeight: number) {
        super();
        this.eventMode = "none";
        const { frame, source } = texture;

        // Stretch a clean strip directly above the ink to preserve the card's own capsule color.
        const paperTexture = new Texture({
            source,
            frame: new Rectangle(
                frame.x + frame.width * (CAPSULE_X - PATCH_WIDTH / 2),
                frame.y + frame.height * BLANK_STRIP_Y,
                frame.width * PATCH_WIDTH,
                frame.height * BLANK_STRIP_HEIGHT,
            ),
        });
        const x = (CAPSULE_X - 0.5) * cardWidth;
        const y = (CAPSULE_Y - 0.5) * cardHeight;
        const paper = new Sprite({ texture: paperTexture, anchor: 0.5 });
        paper.position.set(x, y);
        paper.width = PATCH_WIDTH * cardWidth;
        paper.height = PATCH_HEIGHT * cardHeight;

        this.maxTextWidth = paper.width - 1;
        const textOptions = {
            anchor: { x: 0, y: 0.5 },
            resolution: 3,
            style: { fontFamily: ["Times New Roman", "serif"], fontSize: 7, fontWeight: "bold" as const, fill: 0xffffff },
        };
        this.powerText = new Text(textOptions);
        this.separator = new Text({ ...textOptions, text: "/", tint: StatColour.Neutral });
        this.toughnessText = new Text(textOptions);
        this.numbers.position.set(x, y);
        this.numbers.addChild(this.powerText, this.separator, this.toughnessText);
        this.addChild(paper, this.numbers);
    }

    setStats(power: number, remainingToughness: number, base: { power: number; toughness: number }, damaged: boolean) {
        this.powerText.tint = statColour(power, base.power);
        this.toughnessText.tint = damaged ? StatColour.Lower : statColour(remainingToughness, base.toughness);

        const powerText = String(power);
        const toughnessText = String(remainingToughness);
        if (this.powerText.text === powerText && this.toughnessText.text === toughnessText)
            return;

        this.powerText.text = powerText;
        this.toughnessText.text = toughnessText;
        const powerWidth = this.powerText.width;
        const separatorWidth = this.separator.width;
        const width = powerWidth + separatorWidth + this.toughnessText.width;
        this.powerText.x = -width / 2;
        this.separator.x = this.powerText.x + powerWidth;
        this.toughnessText.x = this.separator.x + separatorWidth;
        this.numbers.scale.set(Math.min(1, this.maxTextWidth / width));
    }
}
