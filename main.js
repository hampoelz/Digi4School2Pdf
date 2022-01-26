const { app, shell, dialog, nativeTheme, ipcMain, clipboard, Menu } = require('electron');
const wrapper = require('pwa-wrapper');
const downloader = require('./src/downloader');
const isFirstRun = require('first-run');

const version = 'Pre-Release v' + app.getVersion();

// https://github.com/hampoelz/Digi4School2Pdf/issues/9
app.commandLine.appendSwitch("disable-http-cache");

(async () => {
  const { window, browser } = await wrapper({
    window: {
      minWidth: 880,
      minHeight: 700,
      width: 880,
      height: 860,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#0B0A10' : '#F2F2F2',
      foregroundColor: nativeTheme.shouldUseDarkColors ? '#FFFFFF' : '#000000',
      foregroundHoverColor: nativeTheme.shouldUseDarkColors ? '#FFFFFF' : '#000000',
      icon: './build/icon.png',
      center: true,
      titleBarAlignment: 'left',
      menuPosition: 'bottom',
    },
    browser: {
      url: 'https://digi4school.at/',
      // Change user agent to avoid showing up in analyses
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36',
      whitelist: '.*',
      webPreferences: {
        backgroundThrottling: false,
        preload: './src/preload.js',
      }
    },
    updateHistory: 'https://raw.githubusercontent.com/hampoelz/PWA-Wrapper/master/update-history.json',
  });

  browser.webContents.invoke = function (channel, ...args) {
    this.send('request:' + channel, ...args);
    return new Promise(resolve => ipcMain.once('result:' + channel, (_, data) => resolve(data)));;
  }

  if (isFirstRun({ name: 'Digi4School2Pdf' })) {
    dialog.showMessageBox(window, {
      type: 'warning',
      title: 'Digi4School2Pdf FirstStart',
      message: 'Disclaimer',
      detail: 'This project is for private/educational purposes only and it is illegal to duplicate eBooks as well as share, print and / or publish the generated PDF files. You may only download and use books that you own and which are not subject to a copy protection. Once you lose the right to use the books, all related files have to be deleted.'
    });
  }

  function canNavigate() {
    if (!browser.webContents.isDownloading) return true;
    dialog.showMessageBox(window, {
      type: 'info', title: 'Download is running ...', message: 'Your book has not yet been fully downloaded!', detail: 'Please wait until your book has finished downloading.\n\nIf you want to cancel the download, you can simply close the window.'
    });
    return false;
  }

  async function collectDebugDataAsync() {
    const debugData = await browser.webContents.invoke('DebugData');

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
      '**Page URL:** ' + browser.webContents.getURL(),
      addSpoiler('Console Logs', debugData.logs),
      addSpoiler('Console Warns', debugData.warns),
      addSpoiler('Console Errors', debugData.errors),
      addSpoiler('Bare-bones HTML Page', debugData.html.map(html => pretty(html
        .replace(/<script([\S\s]*?)>([\S\s]*?)<\/script>/ig, '<script />')
        .replace(/<style([\S\s]*?)>([\S\s]*?)<\/style>/ig, '<style />'),
        { ocd: true })), 'html')
    ].join('\n');

    const msgBox = await dialog.showMessageBox(window, {
      type: 'info',
      title: 'Debug Report',
      message: 'Provide debug data in your Issue',
      detail: 'Copy this debug report to your clipboard and paste the information into your issue.',
      buttons: ["Copy Debug Report", "Close"],
    });

    if (msgBox.response == 0) clipboard.writeText(debugString);
  }

  const menuTemplate = [
    {
      label: '📚 Digi4School',
      click: () => {
        if (canNavigate()) browser.webContents.loadURL('https://digi4school.at/');
      }
    },
    {
      label: '🌐 Switch Library',
      click: async () => {
        const msgBox = await dialog.showMessageBox(window, {
          title: 'Switch Library',
          message: 'Choose a library you want to open:',
          buttons: [
            "Close",
            'DIGI4SCHOOL Bücherregal',
            'TRAUNER-DigiBox',
            'HPT-Bücherregal',
            'HELBLING e-zone',
            'scook - Die online VERITAS-Plattform',
            'öbv - Österreichischer Bundesverlag'
          ],
        });

        if (!canNavigate()) return;

        switch (msgBox.response) {
          case 1: browser.webContents.loadURL('https://digi4school.at/'); break;
          case 2: browser.webContents.loadURL('https://www.trauner-digibox.com/'); break;
          case 3: browser.webContents.loadURL('https://hpthek.at/'); break;
          case 4: browser.webContents.loadURL('https://www.helbling-ezone.com/'); break;
          case 5: browser.webContents.loadURL('https://www.scook.at/'); break;
          case 6: browser.webContents.loadURL('https://www.oebv.at/'); break;
        }
      }
    },
    {
      label: '🔙 Go Back',
      click: () => {
        if (canNavigate()) browser.webContents.goBack();
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Download: '
    },
    {
      label: '📄 Current Page',
      click: async () => await downloader.requestDownloadAsync(window, browser.webContents, 'page')
    },
    {
      label: '📘 Complete Book',
      click: async () => await downloader.requestDownloadAsync(window, browser.webContents, 'book')
    },
    {
      type: 'separator'
    },
    {
      label: '🪛 Debug Report',
      click: async () => await collectDebugDataAsync()
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

})();

// Old Menu
/*
  var downloadMenu = [
    {
      label: '📚 Digi4School',
      click: () => {
        if (canNavigate()) wrapper.browser.webContents.loadURL('https://digi4school.at/');
      }
    },
    {
      label: '🌐 Go To Library',
      submenu: [
        {
          label: '🟦 DIGI4SCHOOL Bücherregal',
          click: () => {
            if (canNavigate()) wrapper.browser.webContents.loadURL('https://digi4school.at/');
          }
        },
        {
          label: '🟥 TRAUNER-DigiBox',
          click: () => {
            if (canNavigate()) wrapper.browser.webContents.loadURL('https://www.trauner-digibox.com/');
          }
        },
        {
          label: '🟩 HPT-Bücherregal',
          click: () => {
            if (canNavigate()) wrapper.browser.webContents.loadURL('https://hpthek.at/');
          }
        },
        {
          label: '🟨 HELBLING e-zone',
          click: () => {
            if (canNavigate()) wrapper.browser.webContents.loadURL('https://www.helbling-ezone.com/');
          }
        },
        {
          label: '🟦 scook - Die online VERITAS-Plattform',
          click: () => {
            if (canNavigate()) wrapper.browser.webContents.loadURL('https://www.scook.at/');
          }
        },
        {
          label: '🟧 öbv - Österreichischer Bundesverlag',
          click: () => {
            if (canNavigate()) wrapper.browser.webContents.loadURL('https://www.oebv.at/');
          }
        }
      ]
    },
    {
      label: '🔙 Go Back',
      click: () => {
        if (canNavigate()) wrapper.browser.webContents.goBack();
      }
    },
    {
      label: '📄 Current Page',
      click: async () => await downloader.requestDownloadAsync(wrapper.window, wrapper.browser.webContents, 'page')
    },
    {
      label: '📘 Complete Book',
      click: async () => await downloader.requestDownloadAsync(wrapper.window, wrapper.browser.webContents, 'book')
    },
    {
      type: 'separator'
    },
    {
      label: '⚙️ Dev Tools',
      role: 'toggleDevTools'
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
    }];
*/