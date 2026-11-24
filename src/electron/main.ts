import { app,BrowserWindow,ipcMain,net,session } from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';

import { createImageFetcher } from './imageFetcher';

const fetchImage = createImageFetcher((url, options) => net.fetch(url, options));

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
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    mainWindow.webContents.on('console-message', event => {
        if (event.level === 'error') console.error(`[renderer] ${event.message}`);
    });
    mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
        console.error(`Window failed to load (${code}): ${description}`);
    });

    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', event => event.preventDefault());

    // and load the index.html of the app.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
    }

    // Open the DevTools.
    if (!app.isPackaged) mainWindow.webContents.openDevTools();
};

// --- App Lifecycle ---

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
    try {
        if (!app.isPackaged && process.env.PIXI_DEVTOOLS_PATH) {
            const extensionPath = process.env.PIXI_DEVTOOLS_PATH;
            await session.defaultSession.extensions.loadExtension(extensionPath);
            console.log('Pixi DevTools loaded successfully!');
        }
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


ipcMain.handle('fetch-image', (event, url: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || event.senderFrame !== window.webContents.mainFrame) {
        throw new Error('Untrusted image request.');
    }
    return fetchImage(url);
});
