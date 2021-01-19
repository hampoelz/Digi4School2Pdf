const { app, shell, nativeTheme, dialog, Menu } = require('electron');
const Browser = require('./app/browser');

nativeTheme.themeSource = 'light'

// TODO: Add offline check
// TODO: Only allow single instance

app.on('ready', () => {
  mainWindow = new Browser('https://digi4school.at/');
  Menu.setApplicationMenu(downloadMenu);
});

var downloadMenu = Menu.buildFromTemplate([
  {
    label: '📚 Digi4School',
    click: () => mainWindow.loadHome()
  },
  {
    label: '🔙 Go Back',
    click: () => mainWindow.webContents.goBack()
  },
  {
    label: '📥 Download',
    submenu: [
      {
        label: '📄 Current Page',
        click: () => mainWindow.webContents.send('download', 'page')
      },
      {
        label: '📘 Complete Book',
        click: () => mainWindow.webContents.send('download', 'book')
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
        label: 'Pre-Release v0.1.2'
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