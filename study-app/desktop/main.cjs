// Study Vault desktop app (Electron). It shows the exact same single-file app
// in its own window. Your data is stored encrypted in the app's own storage
// (~/Library/Application Support/Study Vault on macOS) – never on a server.
const { app, BrowserWindow, Menu, shell, session } = require("electron");
const path = require("node:path");

app.setName("Study Vault");

// Only one window may open the vault at a time.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
const isExternal = (url) => /^(https?|mailto):/i.test(url);

function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 760,
    minHeight: 560,
    title: "Study Vault",
    backgroundColor: "#f6f7fb",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  win.loadFile(path.join(__dirname, "index.html"));
  win.once("ready-to-show", () => win.show());

  // Links (claude.ai, console.anthropic.com …) open in your normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      event.preventDefault();
      if (isExternal(url)) shell.openExternal(url);
    }
  });
  win.on("closed", () => (win = null));
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [{ role: "reload", label: "Reload (locks the vault)" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [{ label: "Open Claude in the browser", click: () => shell.openExternal("https://claude.ai/new") }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on("second-instance", () => {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  // No camera, microphone, location, notifications … – only the clipboard (for "Copy prompt").
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "clipboard-sanitized-write" || permission === "clipboard-read");
  });
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
