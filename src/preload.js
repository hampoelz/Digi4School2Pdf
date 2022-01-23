const { ipcRenderer } = require('electron');

window.ipcRenderer = ipcRenderer;

console.defaultLog = console.log.bind(console);
console.defaultError = console.error.bind(console);
console.defaultWarn = console.warn.bind(console);
console.defaultDebug = console.debug.bind(console);

console.logs = [];
console.errors = [];
console.warns = [];

console.log = function () {
  console.defaultLog.apply(console, arguments);
  console.logs.push(Array.from(arguments));
}

console.error = function () {
  console.defaultError.apply(console, arguments);
  console.errors.push(Array.from(arguments));
}

console.warn = function () {
  console.defaultWarn.apply(console, arguments);
  console.warns.push(Array.from(arguments));
}

ipcRenderer.on('request:DebugData', async () => {
  const htmlData = await frameLoop(dom => dom.querySelector('html').outerHTML);
  ipcRenderer.send('DebugData', {
    logs: console.logs,
    warns: console.warns,
    errors: console.errors,  
    html: htmlData
  });
});

ipcRenderer.on('request:Fetch', async (_, uri) => {
  var response = await window.fetch(uri);
  var arrayBuffer = await response.arrayBuffer();

  ipcRenderer.send('Fetch', { ok: response.ok, status: response.status, statusText: response.statusText, arrayBuffer});
});

const algorithm = {
  svgDetection: {
    libraries: ["digi4school", "trauner-digibox", "hpthek", "helbling-ezone"],
    parser: async dom => {
      let data = [];

      if (!dom) return data;
      const svgObjects = dom.querySelectorAll('object');

      for (let page = 0; page < svgObjects.length; page++) {
        const uri = svgObjects[page].data;
        let pageData = await processSvg(uri);

        if (pageData.size[0] == 0) pageData.size[0] = Number(svgObjects[page].width);
        if (pageData.size[1] == 0) pageData.size[1] = Number(svgObjects[page].height);

        data[page] = pageData;
      }

      return data;
    },
    isPageLoaded: dom => {
      const contentContainer = dom.querySelector('#contentContainer');
      const pages = dom.querySelectorAll('object');

      const pageExists = contentContainer ? contentContainer.children.length > 0 : true; // Skip if there's no container

      // return true when page doesn't exist or pages exists and is loaded
      return !pageExists || pages.length > 0 && pages.length <= 2;
    },
    getPageLabel: dom => dom.querySelector('#txtPage')?.value || dom.querySelector('input')?.value,
    getBookTitle: dom => [...dom.querySelectorAll('meta')].find(meta => meta.name == 'title')?.content || dom.title
  },
  imgDetection_scook: {
    libraries: ['scook'],
    parser: async dom => {
      let data = [];

      if (!dom) return data;
      const imgElements = dom.querySelectorAll(".pages-wrapper img");

      for (let page = 0; page < imgElements.length; page++) {
        const uri = imgElements[page].src;
        const pageData = await processImg(uri);
        data[page] = pageData;
      }

      return data;
    },
    isPageLoaded: dom => {
      const pages = dom.querySelectorAll('.pages-wrapper img');
      return pages.length > 0 && pages.length <= 2;
    },
    getPageLabel: dom => dom.querySelector('input.current-page')?.placeholder,
    getBookTitle: dom => dom.title
  },
  imgDetection_oebv: {
    libraries: ['oebv'],
    parser: async dom => {
      let data = [];
      
      if (!dom) return data;
      const imgElements = dom.querySelectorAll('.image-layers');

      for (let page = 0; page < imgElements.length; page++) {
        const imgContainerList = imgElements[page];
        const imgContainer = imgContainerList.children[imgContainerList.children.length - 1]; // Highest resolution
        const imgSrc = getComputedStyle(imgContainer.firstChild).backgroundImage.match(/url\(["']?([^"']*)["']?\)/)[1];
        
        const uri = imgSrc;
        const pageData = await processImg(uri);
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
    getPageLabel: dom => dom.querySelector('.gauge')?.innerText,
    getBookTitle: dom => dom.querySelector('title')?.dataset.original
  }
}

async function processSvg(uri) {
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

async function processImg(uri) {
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

function selectAlgorithm() {
  const host = window.location.origin;
  let result;

  Object.entries(algorithm).forEach(detection => {
    if (detection[1].libraries.some(library => host.includes(library))) result = detection[1];
  });

  return result;
}

async function frameLoop(method) {
  if (!(method instanceof Function)) return;
  let results = [];

  results[0] = await method(window.document);

  const frames = window.document.querySelectorAll('iframe');
  for (let i = 0; i <= frames.length; i++) {
    const frame = frames[i];
    if (!frame?.contentDocument) continue;
    results[i+1] = await method(frame.contentDocument);
  }

  // remove duplicates, undefined and empty values
  results = [...new Set(results)].filter(result => result != undefined && result !== '')

  return results;
}

ipcRenderer.on('request:PageData', async () => {
  const algorithm = selectAlgorithm();
  const parse = algorithm.parser;
  const dataSet = await frameLoop(parse); // [[], [], ...]
  const data = dataSet.filter(data => Array.isArray(data) && data.length > 0)[0]
  ipcRenderer.send('PageData', data);
});

ipcRenderer.on('request:PageLabel', async () => {
  const algorithm = selectAlgorithm();
  const getLabel = algorithm.getPageLabel;

  const labelSet = await frameLoop(getLabel);
  const label = labelSet.filter(label => typeof label == 'string')[0]
  let page = '';

  if (label)
    page = label
      .replaceAll(' ', '')
      .split('/')[0]
      .split('-')[0];

  ipcRenderer.send('PageLabel', page);
});

ipcRenderer.on('request:BookTitle', async () => {
  const algorithm = selectAlgorithm();
  const getTitle = algorithm.getBookTitle;

  let titleSet = await frameLoop(getTitle);
  titleSet = titleSet.filter(title => typeof title == 'string')
  const title = titleSet[1] ?? titleSet[0]

  ipcRenderer.send('BookTitle', title);
});

ipcRenderer.on('wait:PageLoaded', async () => {
  const algorithm = selectAlgorithm();
  const isLoaded = algorithm.isPageLoaded;

  await new Promise(resolve => {
    setTimeout(() => resolve(), 60000)
    var check = setInterval(async () => {
      const isLoadedSet = await frameLoop(isLoaded);
      const loaded = isLoadedSet.filter(loaded => typeof loaded == 'boolean').includes(true);
      if (loaded) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });

  ipcRenderer.send('PageLoaded');
});

ipcRenderer.on('manipulateContent', (_, message, { text, url }) => {
  var overlayElement = window.document.getElementById('download-overlay');
  var messageElement = window.document.getElementById('download-message');
  var buttonElement = window.document.getElementById('download-button');

  if (!overlayElement) {
    overlayElement = window.document.createElement("div");
    overlayElement.id = 'download-overlay';
    overlayElement.style.position = 'fixed';
    overlayElement.style.display = 'block';
    overlayElement.style.width = '100%';
    overlayElement.style.height = '100%';
    overlayElement.style.top = '0';
    overlayElement.style.left = '0';
    overlayElement.style.right = '0';
    overlayElement.style.bottom = '0';
    overlayElement.style.zIndex = '100';
    overlayElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
    overlayElement.style.backdropFilter = 'blur(6px)';

    let maxZ = Math.max.apply(null,
      [...document.querySelectorAll('body *')]
        .map(element => {
          let style = getComputedStyle(element);
          if (style.position != 'static') return (parseInt(style.zIndex) || 1);
        })
        .filter(i => !isNaN(i))
    )

    overlayElement.style.zIndex = maxZ;

    window.document.body.prepend(overlayElement);
  }

  if (!messageElement) {
    messageElement = window.document.createElement("p");
    messageElement.id = 'download-message';
    messageElement.style.color = '#fff';
    messageElement.style.fontSize = '20pt';
    messageElement.style.fontWeight = 'bold';
    messageElement.style.fontFamily = 'Open Sans, sans-serif';
    messageElement.style.left = '50%';
    messageElement.style.top = '50%';
    messageElement.style.position = 'absolute';
    messageElement.style.textAlign = 'center';
    messageElement.style.transform = 'translate(-50%, -50%)';
    messageElement.style.userSelect = 'none';

    overlayElement.appendChild(messageElement);
  }

  if (text && url && !buttonElement) {
    buttonElement = window.document.createElement("a");
    buttonElement.id = 'download-button';
    buttonElement.style.color = '#fff';
    buttonElement.style.fontSize = '15pt';
    buttonElement.style.fontFamily = 'Open Sans, sans-serif';
    buttonElement.style.left = '50%';
    buttonElement.style.top = '65%';
    buttonElement.style.position = 'absolute';
    buttonElement.style.textAlign = 'center';
    buttonElement.style.transform = 'translate(-50%, -200%)';
    buttonElement.style.userSelect = 'none';
    
    overlayElement.appendChild(buttonElement);
  }

  if (text && url) {
    buttonElement.innerHTML = text;
    buttonElement.href = url;
  }

  messageElement.innerHTML = message;
});