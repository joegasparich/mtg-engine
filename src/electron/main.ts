import {app, BrowserWindow, ipcMain, net, IpcMainInvokeEvent, session} from 'electron';
import type { IncomingMessage } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

type FetchImageResult = string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
    app.quit();
}

const createWindow = () => {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 1000,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    // and load the index.html of the app.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
    }

    // Open the DevTools.
    mainWindow.webContents.openDevTools();
};

// --- App Lifecycle ---

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
    try {
        const extensionPath = path.join(app.getAppPath(), '../pixi-devtools');
        await session.defaultSession.loadExtension(extensionPath);
        console.log('Pixi DevTools loaded successfully!');
    } catch (error) {
        console.error('Error loading Pixi DevTools:', error);
    }

    createWindow(); // Create the main window

    app.on('activate', () => {
        // On OS X it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

const imageCache = new Map<string, FetchImageResult | Promise<FetchImageResult>>();

ipcMain.handle('fetch-image', async (event: IpcMainInvokeEvent, imageUrl: string): Promise<FetchImageResult> => {
    console.log(`Main process received request for: ${imageUrl}`);

    if (imageCache.has(imageUrl)) {
        const cachedValue = imageCache.get(imageUrl)!; // Non-null assertion is safe here
        if (cachedValue instanceof Promise) {
            console.log(`Waiting for pending request for ${imageUrl} from cache.`);
            return await cachedValue;
        } else {
            console.log(`Serving ${imageUrl} from resolved cache.`);
            return cachedValue;
        }
    }

    const fetchPromise = new Promise<FetchImageResult>((resolve, reject) => {
        if (!imageUrl || typeof imageUrl !== 'string') {
            console.error('Invalid imageUrl provided:', imageUrl);
            return reject(new Error('Invalid imageUrl provided.'));
        }

        let requestUrl: URL;
        try {
            requestUrl = new URL(imageUrl);
        } catch (error) {
            console.error(`Invalid URL format for ${imageUrl}:`, error);
            return reject(new Error(`Invalid URL format: ${(error as Error).message}`));
        }

        const request = net.request({
            method: 'GET',
            url: requestUrl.toString(),
            useSessionCookies: false
        });

        const chunks: Buffer[] = [];

        request.on('response', (response: IncomingMessage) => {
            console.log(`Response status: ${response.statusCode} for ${imageUrl}`);

            response.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });

            response.on('end', () => {
                if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
                    const imageBuffer = Buffer.concat(chunks);
                    const mimeType = response.headers['content-type'] || 'image/png';
                    const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

                    console.log(`Successfully fetched image ${imageUrl}, returning Data URL (length: ${dataUrl.length})`);

                    // Store the resolved Data URL in the cache
                    imageCache.set(imageUrl, dataUrl);
                    resolve(dataUrl);
                } else {
                    const errorMsg = `Failed to fetch image ${imageUrl}: Status code ${response.statusCode}`;
                    console.error(errorMsg, response.statusMessage);
                    // Remove the promise from the cache on failure
                    imageCache.delete(imageUrl);
                    reject(new Error(errorMsg));
                }
            });

            response.on('error', (error: Error) => {
                const errorMsg = `Failed to fetch image ${imageUrl}: Response stream error: ${error.message}`;
                console.error(errorMsg, error);
                // Remove the promise from the cache on failure
                imageCache.delete(imageUrl);
                reject(new Error(errorMsg));
            });
        });

        request.on('error', (error: Error) => {
            const errorMsg = `Error fetching ${imageUrl}: ${error.message}`;
            console.error(errorMsg, error);
            // Remove the promise from the cache on failure
            imageCache.delete(imageUrl);
            reject(new Error(errorMsg));
        });

        request.on('login', (authInfo, callback) => {
            console.warn(`Login required for ${imageUrl}, cancelling request. AuthInfo:`, authInfo);
            request.abort();
        });

        request.on('abort', () => {
            const errorMsg = `Request for ${imageUrl} was aborted.`;
            console.warn(errorMsg);
            // Remove the promise from the cache on abortion
            imageCache.delete(imageUrl);
        });

        request.end();
    });

    // Store the promise in the cache
    imageCache.set(imageUrl, fetchPromise);
    return await fetchPromise;
});