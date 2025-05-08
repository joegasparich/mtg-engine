import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
    fetchImage: (imageUrl: string) => Promise<string>; // Returns a Promise resolving to the Data URL
}

const api: ElectronAPI = {
    fetchImage: (imageUrl: string): Promise<string> => {
        // console.log(`Preload: Sending 'fetch-image' request for ${imageUrl}`);
        return ipcRenderer.invoke('fetch-image', imageUrl);
    }
};

contextBridge.exposeInMainWorld('electronAPI', api);

console.log("Preload script executed and electronAPI exposed.");