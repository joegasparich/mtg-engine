import { Container,Rectangle,Sprite,Text,Texture } from "pixi.js";
import { BasicLandType,type CardDef,CardType } from "~/defs";

// The text area to the left of the set symbol in the 672 × 936 card face.
const LINE_LEFT = 52 / 672;
const LINE_TOP = 533 / 936;
const LINE_WIDTH = 474 / 672;
const LINE_HEIGHT = 41 / 936;
const BLANK_STRIP_HEIGHT = 4 / 936;
const basicLandNames = new Set<string>(Object.values(BasicLandType));

function typeLabel(value: string, changed: boolean): string {
    return changed ? `<changed>${value}</changed>` : value;
}

export class UICardTypeLine extends Container {
    private readonly lineText: Text;
    private readonly maxTextWidth: number;

    constructor(texture: Texture, cardWidth: number, cardHeight: number) {
        super();
        this.eventMode = "none";
        const { frame, source } = texture;

        // Use the card's own frame colour to cover the printed line.
        const paperTexture = new Texture({
            source,
            frame: new Rectangle(
                frame.x + frame.width * LINE_LEFT,
                frame.y + frame.height * LINE_TOP,
                frame.width * LINE_WIDTH,
                frame.height * BLANK_STRIP_HEIGHT,
            ),
        });
        const left = (LINE_LEFT - 0.5) * cardWidth;
        const top = (LINE_TOP - 0.5) * cardHeight;
        const paper = new Sprite(paperTexture);
        paper.position.set(left, top);
        paper.width = LINE_WIDTH * cardWidth;
        paper.height = LINE_HEIGHT * cardHeight;
        this.maxTextWidth = paper.width - 2;

        this.lineText = new Text({
            anchor: { x: 0, y: 0.5 },
            resolution: 3,
            style: {
                fontFamily: ["Times New Roman", "serif"],
                fontSize: 6,
                fontWeight: "bold",
                fill: 0x000000,
                tagStyles: { changed: { fill: 0x1749bf } },
            },
        });
        this.lineText.position.set(left + 1, top + paper.height / 2);
        this.addChild(paper, this.lineText);
    }

    setTypes(types: readonly CardType[], subtypes: readonly string[], printed: CardDef) {
        // The five basic land images include the Basic supertype in their printed type lines.
        const basic = printed.types.includes(CardType.Land) && basicLandNames.has(printed.name) ? "Basic " : "";
        const typeText = basic + types.map(type => typeLabel(type, !printed.types.includes(type))).join(" ");
        const subtypeText = subtypes.map(subtype => typeLabel(subtype, !printed.subtypes?.includes(subtype))).join(" ");
        const line = subtypeText ? `${typeText} — ${subtypeText}` : typeText;
        if (line === this.lineText.text)
            return;

        this.lineText.text = line;
        this.lineText.scale.set(1);
        this.lineText.scale.set(Math.min(1, this.maxTextWidth / this.lineText.width));
    }
}
