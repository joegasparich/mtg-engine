const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_CONCURRENT = 8;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateImageUrl(value: unknown): string {
    if (typeof value !== 'string') throw new Error('An image URL is required.');
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'cards.scryfall.io' ||
        url.username || url.password || url.port) {
        throw new Error('Only HTTPS Scryfall card images are supported.');
    }
    return url.href;
}

export function createImageFetcher(fetchImage: (url: string, options: RequestInit) => Promise<Response>) {
    const cache = new Map<string, string>();
    const pending = new Map<string, Promise<string>>();
    let cacheBytes = 0;
    let activeDownloads = 0;
    const waiting: (() => void)[] = [];

    async function queuedDownload(url: string): Promise<string> {
        if (activeDownloads >= MAX_CONCURRENT) {
            await new Promise<void>(resolve => waiting.push(resolve));
        } else {
            activeDownloads++;
        }
        try {
            return await download(url);
        } finally {
            const next = waiting.shift();
            if (next) next(); // Transfer this download slot to the next request.
            else activeDownloads--;
        }
    }

    async function download(url: string): Promise<string> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try {
            const response = await fetchImage(url, {
                redirect: 'error', credentials: 'omit', signal: controller.signal,
            });
            if (!response.ok) throw new Error(`Image request failed (${response.status}).`);
            const mime = response.headers.get('content-type')?.split(';')[0].trim();
            if (!mime || !IMAGE_TYPES.has(mime)) throw new Error('Unsupported image type.');
            if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
                throw new Error('Image is too large.');
            }
            if (!response.body) throw new Error('Image response is empty.');
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    size += value.byteLength;
                    if (size > MAX_IMAGE_BYTES) throw new Error('Image is too large.');
                    chunks.push(value);
                }
            } catch (error) {
                controller.abort();
                await reader.cancel().catch((): void => {});
                throw error;
            } finally {
                reader.releaseLock();
            }
            if (!size) throw new Error('Image response is empty.');
            const result = `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`;
            const bytes = result.length * 2;
            while (cacheBytes + bytes > MAX_CACHE_BYTES && cache.size) {
                const oldest = cache.entries().next().value;
                if (!oldest) break;
                cacheBytes -= oldest[1].length * 2;
                cache.delete(oldest[0]);
            }
            cache.set(url, result);
            cacheBytes += bytes;
            return result;
        } finally {
            clearTimeout(timeout);
        }
    }

    return async (value: unknown): Promise<string> => {
        const url = validateImageUrl(value);
        const cached = cache.get(url);
        if (cached) return cached;
        const existing = pending.get(url);
        if (existing) return existing;
        const request = queuedDownload(url);
        pending.set(url, request);
        try { return await request; }
        finally { pending.delete(url); }
    };
}
