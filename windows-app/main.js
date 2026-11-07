const { app, BrowserWindow, protocol, net, shell } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

// Serve the bundled web app from a secure, standard origin (ES modules and fetch don't work well on file://)
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const root = path.join(__dirname, "www");

function createWindow() {
  const win = new BrowserWindow({
    width: 700, height: 900, minWidth: 360, backgroundColor: "#ffffff",
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  // The page is a 620px column: scale it up with the window width so it fills the window
  const fit = () => {
    const [w] = win.getContentSize();
    win.webContents.setZoomFactor(Math.min(Math.max(w / 660, 1), 2.5));
  };
  win.webContents.on("did-finish-load", fit);
  win.on("resize", fit);
  // While the page is still rendering (data, quote, fonts), keep the window height equal to the content height
  win.webContents.once("did-finish-load", async () => {
    for (let i = 0; i < 60 && !win.isDestroyed(); i++) {
      await new Promise(r => setTimeout(r, 500));
      if (win.isDestroyed()) return;
      const h = await win.webContents.executeJavaScript(
        "document.querySelector('.card') ? Math.ceil(document.querySelector('.wrap').getBoundingClientRect().bottom) + 14 : 0").catch(() => 0);
      if (!h) continue;
      const [w, curH] = win.getContentSize();
      const want = Math.ceil(h * win.webContents.getZoomFactor()) + 2;
      if (Math.abs(want - curH) > 1) win.setContentSize(w, want);
    }
  });
  win.loadURL("app://local/cycling.html");
  // External links open in the default browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("app://")) { e.preventDefault(); shell.openExternal(url); }
  });
}

app.whenReady().then(() => {
  protocol.handle("app", req => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(root, decodeURIComponent(pathname)));
    if (!file.startsWith(root)) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).href);
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => app.quit());
