module.exports = {
    svgParser: {
        libraries: ["digi4school", "trauner-digibox", "hpthek", "helbling-ezone"],
        isPageLoaded: dom => {
            const contentContainer = dom.querySelector('#contentContainer');
            const pages = dom.querySelectorAll('object');

            const pageExists = contentContainer ? contentContainer.children.length > 0 : true; // Skip if there's no container

            // return true when page doesn't exist or pages exists and is loaded
            return !pageExists || pages.length > 0 && pages.length <= 2;
        },
        getPageData: async dom => {
            let data = [];

            if (!dom) return data;
            const svgObjects = dom.querySelectorAll('object');

            for (let page = 0; page < svgObjects.length; page++) {
                const uri = svgObjects[page].data;
                let pageData = await processSvgAsync(uri);

                if (pageData.size[0] == 0) pageData.size[0] = Number(svgObjects[page].width);
                if (pageData.size[1] == 0) pageData.size[1] = Number(svgObjects[page].height);

                data[page] = pageData;
            }

            return data;
        },
        getPageLabel: dom => dom.querySelector('#txtPage')?.value || dom.querySelector('input')?.value,
        getBookTitle: dom => [...dom.querySelectorAll('meta')].find(meta => meta.name == 'title')?.content || dom.title
    },
    imgParser_scook: {
        libraries: ['scook'],
        isPageLoaded: dom => {
            const pages = dom.querySelectorAll('.pages-wrapper img');
            return pages.length > 0 && pages.length <= 2;
        },
        getPageData: async dom => {
            let data = [];

            if (!dom) return data;
            const imgElements = dom.querySelectorAll(".pages-wrapper img");

            for (let page = 0; page < imgElements.length; page++) {
                const uri = imgElements[page].src;
                const pageData = await processImgAsync(uri);
                data[page] = pageData;
            }

            return data;
        },
        getPageLabel: dom => dom.querySelector('input.current-page')?.placeholder,
        getBookTitle: dom => dom.title
    },
    imgParser_oebv: {
        libraries: ['oebv'],
        isPageLoaded: dom => {
            const currentPage = window.location.href.split('?')[1]?.split('&')
                .find(item => item.split('=')[0] == 'page')
                .split('=')[1] ?? '0';

            const pageIdQuery = Number(currentPage) > 1 ? `[id ^= '_hx_']` : '';
            const expectedPages = [...dom.querySelectorAll('.page' + pageIdQuery)];

            const pages = [...dom.querySelectorAll('.page')];
            const notExpectedPages = pages.filter(page => !expectedPages.includes(page));

            return notExpectedPages.length == 0 && expectedPages.length > 0 && expectedPages.length <= 2;
        },
        getPageData: async dom => {
            let data = [];

            if (!dom) return data;
            const imgElements = dom.querySelectorAll('.image-layers');

            for (let page = 0; page < imgElements.length; page++) {
                const imgContainerList = imgElements[page];
                const imgContainer = imgContainerList.children[imgContainerList.children.length - 1]; // Highest resolution
                const imgSrc = getComputedStyle(imgContainer.firstChild).backgroundImage.match(/url\(["']?([^"']*)["']?\)/)[1];

                const uri = imgSrc;
                const pageData = await processImgAsync(uri);
                data[page] = pageData;
            }

            // Manipulate User Settings to prevent page jumping
            for (var i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const item = localStorage.getItem(key);
                const settings = (() => {
                    try {
                        const json = JSON.parse(item);
                        if (json && json instanceof Object) return json;
                    } catch { }

                    return;
                })()

                if (!settings || !settings.rememberLastPage) continue;
                settings.rememberLastPage.enabled = false;
                settings.welcome.enabled = false;
                window.localStorage.setItem(key, JSON.stringify(settings));
            }

            return data;
        },
        getPageLabel: dom => dom.querySelector('.gauge')?.innerText,
        getBookTitle: dom => dom.querySelector('title')?.dataset.original
    }
}

async function processSvgAsync(uri) {
    let data = {};
    data.uri = uri;

    const svgResponse = await window.fetch(data.uri);
    const svgArrayBuffer = await svgResponse.arrayBuffer();

    data.content = svgArrayBuffer;

    const decoder = new TextDecoder();
    const parser = new DOMParser();

    const svgData = decoder.decode(data.content);
    const svgElement = parser.parseFromString(svgData, "image/svg+xml");
    const viewBox = svgElement.documentElement.viewBox.baseVal;

    const width = viewBox.width;
    const height = viewBox.height;

    data.size = [Number(width), Number(height)];
    data.type = 'svg';
    
    return data;
}

async function processImgAsync(uri) {
    let data = {};
    data.uri = uri;

    const imgResponse = await window.fetch(data.uri);
    const imgArrayBuffer = await imgResponse.arrayBuffer();

    data.content = imgArrayBuffer;

    const img = new Image();

    const size = await new Promise(resolve => {
        img.onload = function () {
            resolve({ width: this.width, height: this.height })
        }
        img.src = data.uri;
    });

    data.size = [Number(size.width), Number(size.height)];
    data.type = 'img';

    return data;
}