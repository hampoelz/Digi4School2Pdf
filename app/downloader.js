const SVGtoPDF = require('svg-to-pdfkit');
const URL = require('url').URL;
const path = require('path');
const fs = require('fs');

const settings = {
    localPdf: null
}

async function isDownloadable(url, page = 1) {
    url = new URL(url);

    var protocol = url.protocol;
    var host = url.host
    var pathname = url.pathname.replace('index.html', '');

    var response = await fetch(`${protocol}//${host}${pathname}${page}/${page}.svg`);
    return response.ok;
}

async function writePageToPdf(doc, bookSize, localFolder, url, page = null) {
    url = new URL(url);

    var protocol = url.protocol;
    var host = url.host
    var pathname = url.pathname.replace('index.html', '');
    if (!page) page = url.search.replace('?page=', '');
    if (!page) page = 1;

    var uri = `${protocol}//${host}${pathname}${page}/`;

    doc.addPage({ size: bookSize });

    var response = await fetch(`${uri}${page}.svg`);
    if (response.ok) {
        var svg = await response.text();
        var html = new DOMParser().parseFromString(svg, 'image/svg+xml');

        var svgElements = html.getElementsByTagName("svg");
        if (svgElements.length <= 0) return new Error(`Can't parse the requested page ${page}!`);

        var imgElements = html.getElementsByTagName("image");
        if (imgElements.length > 0) {
            for (let i = 0; i < imgElements.length; i++) {
                if (settings.localPdf == null) return;
                var element = imgElements[i];
                var imageSrc = element.getAttribute('xlink:href');
                var imagePath = path.join(localFolder, page.toString(), imageSrc);
                var imageDir = path.dirname(imagePath);

                var imageResponse = await fetch(uri + imageSrc);
                if (!imageResponse.ok) return new Error(`Error getting the requested image file from '${uri}${imageSrc}'!`);
                var arrayBuffer = await imageResponse.arrayBuffer();

                if (!fs.existsSync(imageDir)) await fs.promises.mkdir(imageDir, { recursive: true });
                await fs.promises.writeFile(imagePath, Buffer.from(arrayBuffer));

                element.setAttribute('xlink:href', imagePath);
            }
        }

        svgElements[0].setAttribute("viewBox", `0 0 ${bookSize[0]} ${bookSize[1]}`);

        svg = svgElements[0].outerHTML;

        
        try {
            SVGtoPDF(doc, svg, 0, 0);
        } catch {
            svg = svg.replaceAll(': 0,', '') // fix svg convert error
            SVGtoPDF(doc, svg, 0, 0);
        }    
    }

    return response;
}

async function removeTempData() {
    var filePath = settings.localPdf;
    settings.localPdf = null;
    if (filePath != null) {
        var tmpPath = filePath.replace('.pdf', '_tmp').replaceAll(' ', '');

        try {
            await fs.promises.rmdir(tmpPath, { recursive: true });
            await fs.promises.unlink(filePath);
        } catch {}
    }
}

module.exports = {
    settings,
    isDownloadable,
    writePageToPdf,
    removeTempData
};