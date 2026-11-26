import { Container,Graphics,Text } from "pixi.js";
import { type CardDef,cardColours,CardType } from "~/defs";

// Median sRGB samples from the paper, raised rim and inset edge of 30A creature capsules.
const capsuleColours = {
    W: { face: 0xe6e0ca, rim: 0xf5f3e6, inset: 0x504b44 },
    U: { face: 0x9bc0ce, rim: 0xc5dbe6, inset: 0x36444a },
    B: { face: 0xb4ada7, rim: 0xdbd5cf, inset: 0x433b3b },
    R: { face: 0xeac4b0, rim: 0xf5dbc9, inset: 0x533e34 },
    G: { face: 0xb7c8ba, rim: 0xd2dfd6, inset: 0x424740 },
    [CardType.Artifact]: { face: 0xb9c5c7, rim: 0xc9d6d6, inset: 0x3d4144 },
} as const;

// Positions in the printed card face, expressed relative to Scryfall's 672 × 936 image.
// The top and bottom are flat. Only the last ~8 pixels at each end bow outward.
function capsule(graphics: Graphics, inset: number, offsetY = 0) {
    const x = 49 - inset;
    const y = 26 - inset;
    return graphics.moveTo(-x, offsetY - y).lineTo(x, offsetY - y)
        .bezierCurveTo(x + 9, offsetY - y / 2, x + 9, offsetY + y / 2, x, offsetY + y)
        .lineTo(-x, offsetY + y)
        .bezierCurveTo(-x - 9, offsetY + y / 2, -x - 9, offsetY - y / 2, -x, offsetY - y)
        .closePath();
}

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

    constructor(printed: CardDef, cardWidth: number, cardHeight: number) {
        super();
        this.eventMode = "none";
        const frameColour = printed.types.includes(CardType.Artifact)
            ? CardType.Artifact : cardColours.find(colour => printed.cost?.includes(`{${colour}}`)) ?? CardType.Artifact;
        const colours = capsuleColours[frameColour];
        const x = (578 / 672 - 0.5) * cardWidth;
        const y = (858 / 936 - 0.5) * cardHeight;
        const badge = new Graphics();
        capsule(badge, -1, 2).fill({ color: 0x121a1d, alpha: 0.85 });
        capsule(badge, 0).fill(colours.rim);
        capsule(badge, 3, 0).fill(colours.inset);
        capsule(badge, 5, 2).fill(colours.face);
        badge.position.set(x, y);
        badge.scale.set(cardWidth / 672, cardHeight / 936);

        this.maxTextWidth = cardWidth * 86 / 672;
        const textOptions = {
            anchor: { x: 0, y: 0.5 },
            resolution: 3,
            style: { fontFamily: ["Times New Roman", "serif"], fontSize: 7, fontWeight: "bold" as const, fill: 0xffffff },
        };
        this.powerText = new Text(textOptions);
        this.separator = new Text({ ...textOptions, text: "/", tint: StatColour.Neutral });
        this.toughnessText = new Text(textOptions);
        this.numbers.position.set(x, y + 2 * cardHeight / 936);
        this.numbers.addChild(this.powerText, this.separator, this.toughnessText);
        this.addChild(badge, this.numbers);
    }

    setStats(power: number, remainingToughness: number, base: { basePower: number; baseToughness: number }, damaged: boolean) {
        this.powerText.tint = statColour(power, base.basePower);
        this.toughnessText.tint = damaged ? StatColour.Lower : statColour(remainingToughness, base.baseToughness);

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
