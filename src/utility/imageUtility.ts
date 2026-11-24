import { Assets, Texture } from "pixi.js";

export async function loadImageFromExternalUrl(url: string): Promise<Texture | undefined> {
    try {
        const texture = await Assets.load<Texture>(url);
        texture.source.autoGenerateMipmaps = true;
        return texture;
    } catch (error) {
        console.error(`Could not load card art from ${url}:`, error);
        return undefined;
    }
}
