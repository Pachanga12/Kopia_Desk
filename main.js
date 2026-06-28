const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const drivelist = require("drivelist");

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers
ipcMain.handle("select-directory", async (event, opts = {}) => {
  const res = await dialog.showOpenDialog({ properties: ["openDirectory", ...(opts.multi ? ["multiSelections"] : [])] });
  if (res.canceled) return null;
  return res.filePaths; // array of absolute paths
});

ipcMain.handle("scan-directory", async (event, dirPath, options = { hash: false }) => {
  async function recurse(base) {
    const entries = await fs.readdir(base, { withFileTypes: true });
    const out = {};
    for (const e of entries) {
      const full = path.join(base, e.name);
      const rel = path.relative(dirPath, full).replace(/\\/g, "/");
      if (e.isDirectory()) {
        Object.assign(out, await recurse(full));
      } else if (e.isFile()) {
        const s = await fs.stat(full);
        out[rel] = { name: e.name, path: rel, size: s.size, lastModified: s.mtimeMs, hash: null, fullPath: full };
        if (options.hash) {
          const buf = await fs.readFile(full);
          const crypto = require("crypto");
          out[rel].hash = crypto.createHash("sha256").update(buf).digest("hex");
        }
      }
    }
    return out;
  }
  return await recurse(dirPath);
});

ipcMain.handle("write-file", async (event, destRoot, relPath, sourceFullPath) => {
  const destFull = path.join(destRoot, relPath);
  await fs.mkdir(path.dirname(destFull), { recursive: true });
  // atomic copy: copy to temp then rename
  const tmp = destFull + ".tmp-" + Date.now();
  await fs.copyFile(sourceFullPath, tmp);
  await fs.rename(tmp, destFull);
  return true;
});

ipcMain.handle("list-drives", async () => {
  const drives = await drivelist.list();
  return drives.map(d => ({ device: d.device, description: d.description, mountpoints: d.mountpoints, size: d.size, isRemovable: d.isRemovable }));
});
