const SVGtoPDF = require('svg-to-pdfkit');
const URL = require('url').URL;

async function isDownloadable(url, page = 1) {
    url = new URL(url);

    var protocol = url.protocol;
    var host = url.host
    var pathname = url.pathname.replace('index.html', '');

    var response = await fetch(`${protocol}//${host}${pathname}${page}/${page}.svg`);
    return response.ok;
}

async function writePageToPdf(doc, bookSize, url, page = null) {
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

        var images = {};
        var imgElements = html.getElementsByTagName("image");
        if (imgElements.length > 0) {
            for (let i = 0; i < imgElements.length; i++) {
                var imageSrc = imgElements[i].getAttribute('xlink:href');

                var imageResponse = await fetch(uri + imageSrc);
                if (!imageResponse.ok) return new Error(`Error getting the requested image file from '${uri}${imageSrc}'!`);

                var arrayBuffer = await imageResponse.arrayBuffer();
                images[imageSrc] = arrayBuffer;
            }
        }

        svgElements[0].setAttribute("viewBox", `0 0 ${bookSize[0]} ${bookSize[1]}`);

        svg = svgElements[0].outerHTML;

        try {
            SVGtoPDF(doc, svg, 0, 0, {
                imageCallback: image => images[image]
            });
        } catch {
            svg = svg.replaceAll(': 0,', '') // fix svg convert error
            SVGtoPDF(doc, svg, 0, 0, {
                imageCallback: image => images[image]
            });
        }    
    }

    return response;
}

module.exports = {
    isDownloadable,
    writePageToPdf
};