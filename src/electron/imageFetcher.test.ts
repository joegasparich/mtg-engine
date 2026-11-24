import { describe,expect,it,vi } from 'vitest';
import { createImageFetcher,validateImageUrl } from './imageFetcher';

const url = 'https://cards.scryfall.io/normal/front/card.jpg';
describe('image fetching', () => {
    it.each(['file:///etc/passwd', 'http://cards.scryfall.io/a', 'https://example.com/a', 'https://user@cards.scryfall.io/a'])('rejects unsafe URL %s', value => {
        expect(() => validateImageUrl(value)).toThrow();
    });
    it('shares concurrent downloads and caches successful images', async () => {
        const fetcher = vi.fn(async () => new Response('image', { headers: { 'content-type': 'image/jpeg' } }));
        const load = createImageFetcher(fetcher);
        const results = await Promise.all([load(url), load(url)]);
        expect(results[0]).toBe(results[1]);
        expect(await load(url)).toBe(results[0]);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher.mock.calls[0]).toBeDefined();
    });
    it('retries failed downloads', async () => {
        const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 500 }))
            .mockResolvedValueOnce(new Response('image', { headers: { 'content-type': 'image/png' } }));
        const load = createImageFetcher(fetcher);
        await expect(load(url)).rejects.toThrow('500');
        await expect(load(url)).resolves.toMatch(/^data:image\/png/);
    });
    it('queues opening-hand bursts, shares queued requests, and releases slots on failure', async () => {
        const release: (() => void)[] = [];
        let active = 0;
        let peak = 0;
        const fetcher = vi.fn(async (imageUrl: string) => {
            active++;
            peak = Math.max(peak, active);
            await new Promise<void>(resolve => release.push(resolve));
            active--;
            return new Response('image', {
                status: imageUrl.endsWith('/0') ? 500 : 200,
                headers: { 'content-type': 'image/jpeg' },
            });
        });
        const load = createImageFetcher(fetcher);
        const requests = Array.from({ length: 20 }, (_, i) => load(`${url}/${i}`));
        const duplicate = load(`${url}/19`);
        const completed = Promise.allSettled([...requests, duplicate]);
        expect(fetcher).toHaveBeenCalledTimes(8);
        while (release.length) {
            release.shift()?.();
            await vi.waitFor(() => expect(release.length > 0 || fetcher.mock.calls.length === 20).toBe(true));
        }
        const results = await completed;
        expect(peak).toBe(8);
        expect(fetcher).toHaveBeenCalledTimes(20);
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(20);
        expect(results[0].status).toBe('rejected');
        expect(results[19]).toEqual(results[20]);
    });
    it('rejects non-images and oversized responses', async () => {
        await expect(createImageFetcher(async () => new Response('<html>'))(url)).rejects.toThrow('type');
        await expect(createImageFetcher(async () => new Response('image', {
            headers: { 'content-type': 'image/jpeg', 'content-length': '20000000' },
        }))(url)).rejects.toThrow('large');
    });
});
