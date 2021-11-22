const { app, shell, dialog, ipcMain } = require('electron');
const { JSDOM } = require('jsdom');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const path = require('path');
const url = require('url');
const fs = require('fs');

async function requestDownloadAsync(browserWindow, mode) {
    if (browserWindow.isDownloading) {
        dialog.showMessageBox(browserWindow, {
            type: 'info', title: 'Download is running ...', message: 'Your book is not fully downloaded!', detail: 'Please wait until your book has finished downloading before starting the next one, only one book can be downloaded at a time.'
        });
        return;
    }

    var svgData = await requestSvgData(browserWindow);
    var bookSize = await requestBookSize(browserWindow);
    var bookTitle = await requestBookTitle(browserWindow);

    if (!svgData.baseUri || !bookSize) {
        dialog.showMessageBox(browserWindow, {
            type: 'info', title: 'Nothing found to download!', message: 'No book was found to download!', detail: 'Please go to a book that you want to download. If you\'ve already opened the book, please open an issue on Github and report that you cannot download this book.'
        });
        return;
    }

    manipulateContent(browserWindow, 'Select storage location to save the PDF ...');

    var pathInput = await dialog.showSaveDialog({
        'filters': [{ 'name': 'PDF', 'extensions': ['pdf'] }],
        'defaultPath': path.join(app.getPath('documents'), bookTitle ?? 'eBook' + '.pdf')
    });

    var filePath = pathInput.filePath;
    if (!filePath) {
        manipulateContent(browserWindow, 'Canceled download...');
        browserWindow.webContents.reload();
        return;
    }

    browserWindow.isDownloading = true;

    function showDownloadError(error) {
        browserWindow.isDownloading = false;
        browserWindow.webContents.reload();
        dialog.showMessageBox(browserWindow, {
            type: 'error', title: 'Download error!', message: 'Unfortunately an error occurred while downloading your book!', detail: error.message
        });
    }

    manipulateContent(browserWindow, 'Create pdf file ...');

    const doc = new PDFDocument({ autoFirstPage: false });

    var writeStream = fs.createWriteStream(filePath);
    writeStream.on('finish', async () => {
        browserWindow.isDownloading = false;
        manipulateContent(browserWindow, 'Download Complete!', { text: ">Go back to Digi4School<", url: "https://digi4school.at/" });
        await shell.openPath(filePath);
    });

    doc.pipe(writeStream);

    if (mode == 'page') {
        manipulateContent(browserWindow, 'Downloading current page ...');
        try {
            await addSvgToPdf(browserWindow, doc, bookSize, svgData);
        } catch (error) {    
            showDownloadError(error);
            return;
        }
    } else if (mode == 'book') {
        manipulateContent(browserWindow, 'Start downloading book ...');
        var loop = true;
    
        for (var page = 1; loop; page++) {
            try {
                var pageUrl = new url.URL(browserWindow.webContents.getURL());
                pageUrl.search = '?page=' + page;
                browserWindow.loadURL(pageUrl.toString());

                await new Promise(resolve => browserWindow.webContents.once('dom-ready', resolve));
                browserWindow.webContents.send('zoomOut');
                browserWindow.webContents.send('zoomOut');
                manipulateContent(browserWindow, `Load page ${page} ...`);

                await new Promise(resolve => browserWindow.webContents.once('did-finish-load', resolve));
                manipulateContent(browserWindow, `Downloading page ${page} ...`);

                browserWindow.webContents.send('wait:PageLoaded');
                await new Promise(resolve => ipcMain.once('PageLoaded', resolve));

                var pageSvgData = await requestSvgData(browserWindow);
                if (pageSvgData.baseUri) await addSvgToPdf(browserWindow, doc, bookSize, pageSvgData);
                else {
                    loop = false;

                    var pageUrl = new url.URL(browserWindow.webContents.getURL());
                    pageUrl.search = '?page=1';
                    browserWindow.loadURL(pageUrl.toString());

                    await new Promise(resolve => browserWindow.webContents.once('dom-ready', resolve));
                    browserWindow.webContents.send('zoomOut');
                    browserWindow.webContents.send('zoomOut');
                }
            } catch (error) {
                loop = false;
                showDownloadError(error);
                return;
            }
        }
    }

    manipulateContent(browserWindow, 'Save Pdf file ...');
    doc.end()
}

function manipulateContent(browserWindow, message, { text, url } = {}) {
    browserWindow.webContents.send('manipulateContent', message, { text, url });
}

async function requestFetch(browserWindow, url) {
    browserWindow.webContents.send('request:Fetch', url);
    return await new Promise(resolve => ipcMain.once('Fetch', (_, response) => resolve(response)));
}

async function requestSvgData(browserWindow) {
    browserWindow.webContents.send('request:SvgData');
    return await new Promise(resolve => ipcMain.once('SvgData', (_, data) => resolve(data)));
}

async function requestBookSize(browserWindow) {
    browserWindow.webContents.send('request:BookSize');
    return await new Promise(resolve => ipcMain.once('BookSize', (_, size) => resolve(size)));
}

async function requestBookTitle(browserWindow) {
    browserWindow.webContents.send('request:BookTitle');
    return await new Promise(resolve => ipcMain.once('BookTitle', (_, title) => resolve(title)));
}

async function addSvgToPdf(browserWindow, doc, bookSize, svgData) {
    var element = new JSDOM(svgData.content, {
        omitJSDOMErrors: true,
        resources: "usable",
        url: svgData.baseUri,
        contentType: "image/svg+xml"});

    var svgElement = element.window.document.querySelector("svg");
    if (!svgElement) throw new Error(`Error parsing the requested page from '${svgData.baseUri}'!`);

    var svgName = svgData.baseUri.substr(svgData.baseUri.lastIndexOf('/') + 1);
    var parentUrl = svgData.baseUri.replace(svgName, '');
        
    var images = {};
    var imgElements = element.window.document.querySelectorAll("image");
    for (let i = 0; i < imgElements.length; i++) {
        var imageSrc = imgElements[i].getAttribute('xlink:href');
        var imageUrl = parentUrl + imageSrc;

        var imageResponse = await requestFetch(browserWindow, imageUrl);
        if (!imageResponse.ok) throw new Error(`Error getting the requested image file from '${imageUrl}'!`);

        images[imageSrc] = imageResponse.arrayBuffer;
    }

    svgElement.removeAttribute('width');
    svgElement.removeAttribute('height')
    svgElement.setAttribute('viewBox', `0 0 ${bookSize[0]} ${bookSize[1]}`);
    var svg = svgElement.outerHTML;

    doc.addPage({ size: bookSize });

    // Lengths must be numeric and greater than zero
    [...svg.matchAll(/dasharray: ([0-9.]*[,\s])*[0-9.]*;/gm)]
        .filter(match => match[0].match(/0[,;\s]/gm))
        .forEach(match => {
            var value = match[0];
            var newValue = value.replaceAll('0', '0.001');
            svg = svg.replace(value, newValue);
        });

    SVGtoPDF(doc, svg, 0, 0, {
        imageCallback: image => images[image]
    });
}

module.exports = {
    requestDownloadAsync,
    addSvgToPdf
};