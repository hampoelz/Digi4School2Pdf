const { app, shell, dialog, nativeTheme, ipcMain, BrowserWindow, Menu } = require('electron');
const downloader = require('./src/downloader');
const path = require('path');

nativeTheme.themeSource = 'light'

const version = 'Pre-Release v' + app.getVersion() + '-BETA'

// TODO: Add offline check

let mainWindow;

const options = {
  minWidth: 880,
  minHeight: 700,
  width: 880,
  height: 860,
  backgroundColor: '#67C6EE',
  icon: path.join(__dirname, 'src', 'icon.png'),
  center: true,
  show: true,
  webPreferences: {
    nodeIntegration: false,
    preload: path.resolve(__dirname, 'src', 'preload.js'),
  }
};

app.on('ready', () => {
  mainWindow = new BrowserWindow(options);
  mainWindow.loadURL('https://digi4school.at/');
  mainWindow.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    mainWindow.loadURL(url);
  });
  Menu.setApplicationMenu(downloadMenu);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function canNavigate() {
  if (!mainWindow.isDownloading) return true;
  dialog.showMessageBox(mainWindow, {
    type: 'info', title: 'Download is running ...', message: 'Your book has not yet been fully downloaded!', detail: 'Please wait until your book has finished downloading.\n\nIf you want to cancel the download, you can simply close the window.'
  });
  return false;
}

async function collectDebugData() {
  mainWindow.webContents.send('request:DebugData');
  const debug = await new Promise(resolve => ipcMain.once('DebugData', (_, data) => resolve(data)));

  const addSpoiler = (title, code, syntax) => [
    '<details>',
    `<summary>${title}</summary>`,
    '',
    '```' + syntax,
    code,
    '```',
    '</details>'
  ].join('\n')
  const formatConsoleMessages = (title, console) => addSpoiler(title, console.join('\n```\n\n```\n'), '')

  const pretty = require('pretty');
  const debugString = [
    '## Digi4School2Pdf DebugReport',
    '**Version:** ' + version,
    '**Page URL:** ' + mainWindow.webContents.getURL(),
    formatConsoleMessages('Console Logs', debug.logs),
    formatConsoleMessages('Console Warns', debug.warns),
    formatConsoleMessages('Console Errors', debug.errors),
    addSpoiler('Bare-bones HTML Page', pretty(
      debug.html
        .replace(/<script([\S\s]*?)>([\S\s]*?)<\/script>/ig, '<script />')
        .replace(/<style([\S\s]*?)>([\S\s]*?)<\/style>/ig, '<style />'),
      { ocd: true }), 'html')
  ].join('\n');
  
  const msgBox = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Debug Report',
    message: 'Provide debug data in your Issue',
    detail: 'Copy this debug report to your clipboard and paste the information into your issue.',
    buttons: ["Copy Debug Report", "Close"],
  });

  if (msgBox.response == 0) {
    require('child_process').spawn('clip').stdin.end(debugString);
  }
}

var downloadMenu = Menu.buildFromTemplate([
  {
    label: '📚 Digi4School',
    click: () => {
      if (canNavigate()) mainWindow.loadURL('https://digi4school.at/');
    }
  },
  {
    label: '🔙 Go Back',
    click: () => {
      if (canNavigate()) mainWindow.webContents.goBack();
    }
  },
  {
    label: '📥 Download',
    submenu: [
      {
        label: '📄 Current Page',
        click: async () => await downloader.requestDownloadAsync(mainWindow, 'page')
      },
      {
        label: '📘 Complete Book',
        click: async () => await downloader.requestDownloadAsync(mainWindow, 'book')
      }
    ]
  },
  {
    type: 'separator'
  },
  {
    label: '🖊️ Edit',
    submenu: [
      {
        role: 'undo'
      },
      {
        role: 'redo'
      },
      {
        type: 'separator'
      },
      {
        role: 'cut'
      },
      {
        role: 'copy'
      },
      {
        role: 'paste'
      },
      {
        type: 'separator'
      }
    ]
  },
  {
    label: '🗔 View',
    submenu: [
      {
        role: 'zoomIn'
      },
      {
        role: 'zoomOut'
      },
      {
        role: 'resetZoom'
      },
      {
        type: 'separator'
      },
      {
        role: 'togglefullscreen'
      },
      {
        type: 'separator'
      },
      {
        role: 'reload'
      },
      {
        role: 'toggleDevTools'
      },
    ]
  },
  {
    label: '💁 Help',
    submenu: [
      {
        label: version
      },
      {
        label: 'Releases',
        click: async () => await shell.openExternal('https://github.com/hampoelz/Digi4School2Pdf/releases')
      },
      {
        type: 'separator'
      },
      {
        label: 'Debug Report',
        click: async () => await collectDebugData()
      },
      {
        type: 'separator'
      },
      {
        label: 'Visit on Github',
        click: async () => await shell.openExternal('https://github.com/hampoelz/Digi4School2Pdf')
      },
      {
        label: 'View License',
        click: async () => await shell.openExternal('https://github.com/hampoelz/Digi4School2Pdf/blob/master/LICENSE')
      },
      {
        label: 'Report Issue',
        click: async () => await shell.openExternal('https://github.com/hampoelz/Digi4School2Pdf/issues')
      },
      {
        label: 'By Rene Hampölz',
        click: async () => await shell.openExternal('https://github.com/hampoelz')
      },
      {
        label: 'hampoelz.net',
        click: async () => await shell.openExternal('https://hampoelz.net/')
      },
    ]
  }]);