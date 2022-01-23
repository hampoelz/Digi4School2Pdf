const { app, shell, dialog, ipcMain } = require('electron');
const { JSDOM } = require('jsdom');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const path = require('path');
const fs = require('fs');

async function requestDownloadAsync(browserWindow, mode) {
    if (browserWindow.isDownloading) {
        dialog.showMessageBox(browserWindow, {
            type: 'info', title: 'Download is running ...', message: 'Your book is not fully downloaded!', detail: 'Please wait until your book has finished downloading before starting the next one, only one book can be downloaded at a time.'
        });
        return;
    }

    var bookTitle = await requestBookTitle(browserWindow);
    var currentPageData = await requestPageData(browserWindow);
    
    if (!currentPageData || currentPageData.length <= 0) {
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

    // Depending on the window size, oebv switches between double and single page views, so disable resizing
    browserWindow.setResizable(false);

    if (mode == 'page') {
        manipulateContent(browserWindow, 'Downloading current page ...');
        try {
            for (const data of currentPageData) {
                await addToPdf(browserWindow, doc, data)
            }
        } catch (error) {    
            showDownloadError(error);
            console.log(error);
            return;
        }
    } else if (mode == 'book') {
        manipulateContent(browserWindow, 'Start downloading book ...');
        var loop = true;
        var firstDataUri;       // Check if book starts over 
        var previousDataUri;

        // Start with page -1 and skip 0 to prevent helbling-ezone from reloading
        for (var page = -1; loop; page++) {
            if (page == 0) continue;
            try {
                const loadNextPageMsg = () => manipulateContent(browserWindow, `Load next page ...`);

                loadNextPageMsg();
                await goToPage(browserWindow, page, loadNextPageMsg);
                
                loadNextPageMsg();
                browserWindow.webContents.send('wait:PageLoaded');
                await new Promise(resolve => ipcMain.once('PageLoaded', resolve));

                var pageLabel = await requestPageLabel(browserWindow);
                console.log(pageLabel)

                manipulateContent(browserWindow, `Downloading page ${pageLabel} ...`);
                var pageData = await requestPageData(browserWindow);
                if (pageData?.length > 0 && pageData[0]?.uri != previousDataUri && pageData[0]?.uri != firstDataUri) {
                    let pageNumber = Number(pageLabel);
                    for (const data of pageData) {
                        if (!Number.isNaN(pageNumber)) {
                            manipulateContent(browserWindow, `Downloading page ${pageNumber} ...`);
                            pageNumber++;
                        }
                        
                        if (!data.size) data.size = currentPageData.size;
                        await addToPdf(browserWindow, doc, data);
                    }
                    if (!previousDataUri) firstDataUri = pageData[0].uri;
                    previousDataUri = pageData[0].uri;
                    page += pageData.length - 1;
                } else if (page > 1) /* Most books start with page 1, so go ahead if no data was found */ {
                    loop = false;
                    await goToPage(browserWindow);
                }
                console.log(page);
            } catch (error) {
                loop = false;
                showDownloadError(error);
                return;
            }
        }
    }

    browserWindow.setResizable(true);

    manipulateContent(browserWindow, 'Save Pdf file ...');
    doc.end()
}

async function goToPage(browserWindow, page, loadMethod) {
    let pageUrl = browserWindow.webContents.getURL();
    const params = pageUrl.split('?')[1];

    let isPageParam = false;

    if (params) {
        params.split('&').forEach(item => {
            if (item.split('=')[0] == 'page') {
                // If no page given go to default page
                pageUrl = pageUrl.replace(item, page == undefined ? '' : 'page=' + page);
                isPageParam = true;
            }
        });
    }
    
    if (!isPageParam && page != undefined) {
        let prefix = '';
        if (params == undefined) prefix = '?';
        if (params.length > 0) prefix = '&'
        pageUrl += `${prefix}page=${page}`;
    }

    browserWindow.loadURL(pageUrl);
    if (loadMethod instanceof Function) loadMethod();
    await new Promise(resolve => browserWindow.webContents.once('did-stop-loading', resolve));
}

function manipulateContent(browserWindow, message, { text, url } = {}) {
    browserWindow.webContents.send('manipulateContent', message, { text, url });
}

async function requestFetch(browserWindow, url) {
    browserWindow.webContents.send('request:Fetch', url);
    return await new Promise(resolve => ipcMain.once('Fetch', (_, response) => resolve(response)));
}

async function requestPageData(browserWindow) {
    browserWindow.webContents.send('request:PageData');
    return await new Promise(resolve => ipcMain.once('PageData', (_, data) => resolve(data)));
}

async function requestPageLabel(browserWindow) {
    browserWindow.webContents.send('request:PageLabel');
    return await new Promise(resolve => ipcMain.once('PageLabel', (_, label) => resolve(label)));
}

async function requestBookTitle(browserWindow) {
    browserWindow.webContents.send('request:BookTitle');
    return await new Promise(resolve => ipcMain.once('BookTitle', (_, title) => resolve(title)));
}

async function addSvgToPdf(browserWindow, doc, svgData) {
    var element = new JSDOM(svgData.content, {
        omitJSDOMErrors: true,
        resources: "usable",
        url: svgData.uri,
        contentType: "image/svg+xml"});

    var svgElement = element.window.document.querySelector("svg");
    if (!svgElement) throw new Error(`Error parsing the requested page from '${svgData.uri}'!`);

    var svgName = svgData.uri.substr(svgData.uri.lastIndexOf('/') + 1);
    var parentUrl = svgData.uri.replace(svgName, '');
        
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
    svgElement.setAttribute('viewBox', `0 0 ${svgData.size[0]} ${svgData.size[1]}`);
    var svg = svgElement.outerHTML;

    doc.addPage({ size: svgData.size });

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

async function addToPdf(browserWindow, doc, data) {
    switch (data.type) {
        case "svg":
            await addSvgToPdf(browserWindow, doc, data);
            break;
        case "img":
            doc.addPage({ size: data.size });
            doc.image(data.content, 0, 0);
            break;
    }
}

module.exports = {
    requestDownloadAsync
};