const { app, shell, dialog, nativeTheme, BrowserWindow, Menu } = require('electron');
const downloader = require('./src/downloader');
const path = require('path');

nativeTheme.themeSource = 'light'

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
        label: 'Pre-Release v' + app.getVersion()
      },
      {
        label: 'Releases',
        click: async () => await shell.openExternal('https://github.com/hampoelz/Digi4School2Pdf/releases')
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