const { app, shell, dialog, nativeTheme, ipcMain, BrowserWindow, Menu } = require('electron');
const downloader = require('./src/downloader');
const isFirstRun = require('first-run');
const path = require('path');

const version = 'Pre-Release v' + app.getVersion() + '-BETA';

// TODO: Add offline check
// TODO: Modernize UI

// https://github.com/hampoelz/Digi4School2Pdf/issues/9
app.commandLine.appendSwitch("disable-http-cache");

nativeTheme.themeSource = 'light';

let mainWindow;

const options = {
  minWidth: 880,
  minHeight: 700,
  width: 880,
  height: 860,
  backgroundColor: '#67C6EE',
  icon: path.join(__dirname, 'build', 'icon.png'),
  center: true,
  show: true,
  webPreferences: {
    nodeIntegration: false,
    backgroundThrottling: false,
    preload: path.resolve(__dirname, 'src', 'preload.js'),
  }
};

app.on('ready', () => {
  Menu.setApplicationMenu(downloadMenu);

  mainWindow = new BrowserWindow(options);
  mainWindow.webContents.setWindowOpenHandler(details => {
    mainWindow.loadURL(details.url);
    return { action: 'deny' };
  });

  mainWindow.webContents.invoke = function (channel, ...args) {
    this.send('request:' + channel, ...args);
    return new Promise(resolve => ipcMain.once('result:' + channel, (_, data) => resolve(data)));;
  }

  // Change user agent to avoid showing up in analyses
  mainWindow.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36');

  mainWindow.loadURL('https://digi4school.at/');

  if (isFirstRun({name: 'Digi4School2Pdf'})) {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Digi4School2Pdf FirstStart',
      message: 'Disclaimer',
      detail: 'This project is for private/educational purposes only and it is illegal to duplicate eBooks as well as share, print and / or publish the generated PDF files. You may only download and use books that you own and which are not subject to a copy protection. Once you lose the right to use the books, all related files have to be deleted.'
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function canNavigate() {
  if (!mainWindow.webContents.isDownloading) return true;
  dialog.showMessageBox(mainWindow, {
    type: 'info', title: 'Download is running ...', message: 'Your book has not yet been fully downloaded!', detail: 'Please wait until your book has finished downloading.\n\nIf you want to cancel the download, you can simply close the window.'
  });
  return false;
}

async function collectDebugDataAsync() {
  const debugData = await mainWindow.webContents.invoke('DebugData');

  const addSpoiler = (title, code, syntax = '') => [
    '<details>',
    `<summary>${title}</summary>`,
    '',
    '```' + syntax,
    [...code].join('\n```\n\n```' + syntax + '\n'),
    '```',
    '</details>'
  ].join('\n');

  const pretty = require('pretty');
  const debugString = [
    '## Digi4School2Pdf DebugReport',
    '**Version:** ' + version,
    '**Page URL:** ' + mainWindow.webContents.getURL(),
    addSpoiler('Console Logs', debugData.logs),
    addSpoiler('Console Warns', debugData.warns),
    addSpoiler('Console Errors', debugData.errors),
    addSpoiler('Bare-bones HTML Page', debugData.html.map(html => pretty(html
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

const downloadMenu = Menu.buildFromTemplate([
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
        click: async () => await downloader.requestDownloadAsync(mainWindow, mainWindow.webContents, 'page')
      },
      {
        label: '📘 Complete Book',
        click: async () => await downloader.requestDownloadAsync(mainWindow, mainWindow.webContents, 'book')
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
        click: () => shell.openExternal('https://github.com/hampoelz/Digi4School2Pdf/releases')
      },
      {
        type: 'separator'
      },
      {
        label: 'Debug Report',
        click: async () => await collectDebugDataAsync()
      },
      {
        type: 'separator'
      },
      {
        label: 'Visit on Github',
        click: () => shell.openExternal('https://github.com/hampoelz/Digi4School2Pdf')
      },
      {
        label: 'View License',
        click: () => shell.openExternal('https://github.com/hampoelz/Digi4School2Pdf/blob/master/LICENSE')
      },
      {
        label: 'Report Issue',
        click: () => shell.openExternal('https://github.com/hampoelz/Digi4School2Pdf/issues')
      },
      {
        label: 'By Rene Hampölz',
        click: () => shell.openExternal('https://github.com/hampoelz')
      },
      {
        label: 'hampoelz.net',
        click: () => shell.openExternal('https://hampoelz.net/')
      },
    ]
  }]);