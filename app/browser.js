const { BrowserWindow, shell, session } = require('electron');
const path = require('path');

class Browser extends BrowserWindow {
    constructor(startUrl, show) {
        const options = {
            minWidth: 880,
            minHeight: 700,
            width: 880,
            height: 860,
            backgroundColor: '#67C6EE',
            icon: path.join(__dirname, '../src', 'assets', 'd4s_icon.png'),
            center: true,
            webPreferences: {
                enableRemoteModule: true,
                nodeIntegration: false,
                preload: path.resolve(__dirname, '../src', 'preload.js'),
            },
        };

        // Initialize BrowserWindow
        super(options);
        this.url = startUrl;
        
        // Open new windows in default Browser
        this.webContents.on('new-window', (event, url) => {
            event.preventDefault();
            this.loadCustomUrl(url);
        });

        
        this.loadHome();
    }

    // Add custom user agent postfix (e.g. for google analytics)
    loadCustomUrl(url, userAgentPostfix = '') {
        this.loadURL(url, {
            userAgent: (session.defaultSession.getUserAgent()
                + (userAgentPostfix == '' ? '' : ' ' + userAgentPostfix))
        });
    }

    loadRelativeUrl(relativeUrl) {
        this.loadCustomUrl(this.url + relativeUrl);
    }

    loadHome() {
        this.loadRelativeUrl('');
    }

}

module.exports = Browser;
