import * as PIXI from "pixi.js";

export async function loadImageFromExternalUrl(externalUrl: string): Promise<PIXI.Texture | undefined> {
    try {
        const dataUrlFromMain = await window.electronAPI.fetchImage(externalUrl);

        if (!dataUrlFromMain) {
            throw new Error("Main process did not return a Data URL.");
        }

        const dataUrl = dataUrlFromMain.trim();

        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
            throw new Error('Invalid Data URL format after fetching and trimming.');
        }

        const texture = await PIXI.Assets.load<PIXI.Texture>(dataUrl);
        texture.source.autoGenerateMipmaps = true;

        // Validation for PixiJS v8
        if (!texture) {
            throw new Error('Texture is null/undefined after PIXI.Assets.load attempt.');
        }
        if (!(texture instanceof PIXI.Texture)) {
            throw new Error('Loaded asset is not a PIXI.Texture instance.');
        }
        if (texture.width <= 0 || texture.height <= 0) {
            throw new Error(`Texture has invalid dimensions after load: width=${texture.width}, height=${texture.height}`);
        }
        // Ensure source exists before checking its properties
        if (!texture.source || !(texture.source.resource instanceof ImageBitmap)) {
            throw new Error('Texture source or its underlying resource is invalid.');
        }
        // Check if texture or its source has been destroyed
        if (texture.destroyed || (texture.source && texture.source.destroyed)) {
            throw new Error('Texture or its source is marked as destroyed.');
        }

        // If all checks pass, create and return the sprite
        return texture;

    } catch (error) {
        console.error(`loadImageFromExternalUrl failed for ${externalUrl}:`, error instanceof Error ? error.message : error);
        return undefined;
    }
}