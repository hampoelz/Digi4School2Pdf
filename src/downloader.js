const { app, shell, dialog } = require('electron');
const { JSDOM } = require('jsdom');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const path = require('path');
const fs = require('fs');

function manipulateContent(webContents, message, { text, url } = {}) {
    webContents.send('manipulateContent', message, { text, url });
}

async function requestDownloadAsync(browserWindow, webContents, mode) {
    if (webContents.isDownloading) {
        dialog.showMessageBox(browserWindow, {
            type: 'info',
            title: 'Download is running ...',
            message: 'Your book is not fully downloaded!',
            detail: 'Please wait until your book has finished downloading before starting the next one, only one book can be downloaded at a time.'
        });
        return;
    }

    const currentPageData = await webContents.invoke('PageData');
    if (!currentPageData || currentPageData.length <= 0) {
        dialog.showMessageBox(browserWindow, {
            type: 'info',
            title: 'Nothing found to download!',
            message: 'No book was found to download!',
            detail: 'Please go to a book that you want to download. If you\'ve already opened the book, please open an issue on Github and report that you cannot download this book.'
        });
        return;
    }

    manipulateContent(webContents, 'Select storage location to save the PDF ...');

    const bookTitle = await webContents.invoke('BookTitle');
    const pathInput = await dialog.showSaveDialog({
        'filters': [{ 'name': 'PDF', 'extensions': ['pdf'] }],
        'defaultPath': path.join(app.getPath('documents'), bookTitle ?? 'eBook' + '.pdf')
    });

    const filePath = pathInput.filePath;
    if (!filePath) {
        manipulateContent(webContents, 'Canceled download...');
        webContents.reload();
        return;
    }

    webContents.isDownloading = true;

    function showDownloadError(error) {
        webContents.isDownloading = false;
        webContents.reload();
        dialog.showMessageBox(browserWindow, {
            type: 'error',
            title: 'Download error!',
            message: 'Unfortunately an error occurred while downloading your book!',
            detail: error.stack
        });
        console.log(error)
        browserWindow.setResizable(true);
    }

    manipulateContent(webContents, 'Create pdf file ...');

    const doc = new PDFDocument({ autoFirstPage: false });

    const writeStream = fs.createWriteStream(filePath);
    writeStream.on('finish', () => {
        webContents.isDownloading = false;
        manipulateContent(webContents, 'Download Complete!', { text: ">Go back to Digi4School<", url: "https://digi4school.at/" });
        shell.openPath(filePath);
    });

    doc.pipe(writeStream);

    // Depending on the window size, oebv switches between double and single page views, so disable resizing
    browserWindow.setResizable(false);

    if (mode == 'page') {
        manipulateContent(webContents, 'Downloading current page ...');
        try {
            for (const data of currentPageData) {
                await addDataToPdfAsync(webContents, doc, data);
            }
        } catch (error) {
            showDownloadError(error);
            return;
        }
    } else if (mode == 'book') {
        manipulateContent(webContents, 'Start downloading book ...');
        let loop = true;
        let firstDataUri;       // Check if book starts over 
        let previousDataUri;

        // Start with page -1 and skip 0 to prevent helbling-ezone from reloading
        for (let page = -1; loop; page++) {
            if (page == 0) continue;
            try {
                const loadNextPageMsg = () => manipulateContent(webContents, `Load next page ...`);

                loadNextPageMsg();
                await goToPageAsync(webContents, page, loadNextPageMsg);

                loadNextPageMsg();
                await webContents.invoke('PageLoaded');

                const pageLabel = await webContents.invoke('PageLabel');
                manipulateContent(webContents, `Downloading page ${pageLabel} ...`);

                const pageData = await webContents.invoke('PageData');
                if (pageData?.length > 0 && pageData[0]?.uri != previousDataUri && pageData[0]?.uri != firstDataUri) {
                    let pageNumber = Number(pageLabel);
                    for (const data of pageData) {
                        if (!Number.isNaN(pageNumber)) {
                            manipulateContent(webContents, `Downloading page ${pageNumber} ...`);
                            pageNumber++;
                        }

                        if (!data.size) data.size = currentPageData.size;
                        await addDataToPdfAsync(webContents, doc, data);
                    }

                    if (!previousDataUri) firstDataUri = pageData[0].uri;
                    previousDataUri = pageData[0].uri;
                    page += pageData.length - 1;
                } else if (page > 1) /* Most books start with page 1, so go ahead if no data was found */ {
                    await goToPageAsync(webContents);
                    loop = false;
                }
            } catch (error) {
                loop = false;
                showDownloadError(error);
                return;
            }
        }
    }

    browserWindow.setResizable(true);

    manipulateContent(webContents, 'Save Pdf file ...');
    doc.end();
}

async function addDataToPdfAsync(webContents, doc, data) {
    doc.addPage({ size: data.size });

    if (data.type == 'svg') {
        const preparedSvg = await prepareSvgAsync(webContents, data);
        SVGtoPDF(doc, preparedSvg.svgDocument, 0, 0, {
            imageCallback: image => preparedSvg.imgBuffer[image]
        });
    } else if (data.type == 'img') {
        doc.image(data.content, 0, 0);
    }
}

async function prepareSvgAsync(webContents, svgData) {
    const element = new JSDOM(svgData.content, {
        omitJSDOMErrors: true,
        resources: "usable",
        url: svgData.uri,
        contentType: "image/svg+xml"
    });

    const svgElement = element.window.document.querySelector("svg");
    if (!svgElement) throw new Error(`Error parsing the requested page from '${svgData.uri}'!`);

    const svgName = svgData.uri.substr(svgData.uri.lastIndexOf('/') + 1);
    const parentUrl = svgData.uri.replace(svgName, '');

    let images = {};
    const imgElements = element.window.document.querySelectorAll("image");
    for (let i = 0; i < imgElements.length; i++) {
        const imageSrc = imgElements[i].getAttribute('xlink:href');
        const imageUrl = parentUrl + imageSrc;

        const imageResponse = await webContents.invoke('Fetch', imageUrl);
        if (!imageResponse.ok) throw new Error(`Error getting the requested image file from '${imageUrl}'!`);

        images[imageSrc] = imageResponse.arrayBuffer;
    }

    svgElement.removeAttribute('width');
    svgElement.removeAttribute('height')
    svgElement.setAttribute('viewBox', `0 0 ${svgData.size[0]} ${svgData.size[1]}`);
    let svg = svgElement.outerHTML;

    // Lengths must be numeric and greater than zero
    [...svg.matchAll(/dasharray: ([0-9.]*[,\s])*[0-9.]*;/gm)]
        .filter(match => match[0].match(/0[,;\s]/gm))
        .forEach(match => {
            const value = match[0];
            const newValue = value.replaceAll('0', '0.001');
            svg = svg.replace(value, newValue);
        });

    return {
        svgDocument: svg,
        imgBuffer: images
    };
}

async function goToPageAsync(webContents, page, loadMethod) {
    let pageUrl = webContents.getURL();
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

    await new Promise(resolve => {
        webContents.once('did-stop-loading', resolve);
        webContents.loadURL(pageUrl);
        if (loadMethod instanceof Function) loadMethod();
    });
}

module.exports = {
    requestDownloadAsync
};