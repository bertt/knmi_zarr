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
