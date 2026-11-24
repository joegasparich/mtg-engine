import { afterEach,expect,it,vi } from 'vitest';
import { getCard,getSet } from './scryfallService';
afterEach(() => vi.unstubAllGlobals());
it('rejects HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    await expect(getCard('missing')).rejects.toThrow('404');
});
it('encodes resource identifiers', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{"name":"test"}'));
    vi.stubGlobal('fetch', request);
    await expect(getSet('a/b')).resolves.toEqual({ name: 'test' });
    expect(request).toHaveBeenCalledWith('https://api.scryfall.com/sets/a%2Fb', expect.any(Object));
});
