const { app, shell, dialog, nativeTheme, ipcMain, BrowserWindow, Menu } = require('electron');
const downloader = require('./src/downloader');
const path = require('path');

nativeTheme.themeSource = 'light'

const version = 'Pre-Release v' + app.getVersion() + '-BETA'

// TODO: Add offline check

// https://github.com/hampoelz/Digi4School2Pdf/issues/9
app.commandLine.appendSwitch("disable-http-cache");

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
    backgroundThrottling: false,
    preload: path.resolve(__dirname, 'src', 'preload.js'),
  }
};

app.on('ready', () => {
  mainWindow = new BrowserWindow(options);

  // Change user agent to avoid showing up in analyses
  mainWindow.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36');

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

  const addSpoiler = (title, code, syntax = '') => [
    '<details>',
    `<summary>${title}</summary>`,
    '',
    '```' + syntax,
    [...code].join('\n```\n\n```' + syntax + '\n'),
    '```',
    '</details>'
  ].join('\n')

  const pretty = require('pretty');
  const debugString = [
    '## Digi4School2Pdf DebugReport',
    '**Version:** ' + version,
    '**Page URL:** ' + mainWindow.webContents.getURL(),
    addSpoiler('Console Logs', debug.logs),
    addSpoiler('Console Warns', debug.warns),
    addSpoiler('Console Errors', debug.errors),
    addSpoiler('Bare-bones HTML Page', debug.html.map(html => pretty(html
      .replace(/<script([\S\s]*?)>([\S\s]*?)<\/script>/ig, '<script />')
      .replace(/<style([\S\s]*?)>([\S\s]*?)<\/style>/ig, '<style />'),
      { ocd: true })), 'html')
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
    label: '🌐 Go To Library',
    submenu: [
      {
        label: '🟦 DIGI4SCHOOL Bücherregal',
        click: () => {
          if (canNavigate()) mainWindow.loadURL('https://digi4school.at/');
        }
      },
      {
        label: '🟥 TRAUNER-DigiBox',
        click: () => {
          if (canNavigate()) mainWindow.loadURL('https://www.trauner-digibox.com/');
        }
      },
      {
        label: '🟩 HPT-Bücherregal',
        click: () => {
          if (canNavigate()) mainWindow.loadURL('https://hpthek.at/');
        }
      },
      {
        label: '🟨 HELBLING e-zone',
        click: () => {
          if (canNavigate()) mainWindow.loadURL('https://www.helbling-ezone.com/');
        }
      },
      {
        label: '🟦 scook - Die online VERITAS-Plattform',
        click: () => {
          if (canNavigate()) mainWindow.loadURL('https://www.scook.at/');
        }
      },
      {
        label: '🟧 öbv - Österreichischer Bundesverlag',
        click: () => {
          if (canNavigate()) mainWindow.loadURL('https://www.oebv.at/');
        }
      }
    ]
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