const { ipcRenderer } = require('electron');
const parser = require('./parser');

ipcRenderer.handle = function (channel, listener) {
  this.on('request:' + channel, async (...details) => {
    const data = await listener(...details)
    this.send('result:' + channel, data);
  });
}

const debug = {
  logs: [],
  warns: [],
  errors: []
}

consoleLogger(debug.logs, debug.warns, debug.errors);

ipcRenderer.handle('DebugData', async () => {
  const htmlData = await frameLoopAsync(dom => dom.querySelector('html').outerHTML) ?? [];
  
  return {
    logs: debug.logs,
    warns: debug.warns,
    errors: debug.errors,
    html: htmlData
  }
});

ipcRenderer.handle('PageData', async () => {
  const parser = selectParser();
  const getData = parser?.getPageData;

  const dataSet = await frameLoopAsync(getData); // [[], [], ...]
  const data = dataSet?.filter(data => Array.isArray(data) && data.length > 0)[0] ?? [];

  return data;
});

ipcRenderer.handle('PageLabel', async () => {
  const parser = selectParser();
  const getLabel = parser?.getPageLabel;

  const labelSet = await frameLoopAsync(getLabel);
  const label = labelSet?.filter(label => typeof label == 'string')[0] ?? '';
  let page = '';

  if (label)
    page = label
      .replaceAll(' ', '')
      .split('/')[0]
      .split('-')[0];

  return page;
});

ipcRenderer.handle('BookTitle', async () => {
  const parser = selectParser();
  const getTitle = parser?.getBookTitle;

  let titleSet = await frameLoopAsync(getTitle);
  titleSet = titleSet?.filter(title => typeof title == 'string');
  const title = titleSet[1] ?? titleSet[0] ?? '';

  return title;
});

ipcRenderer.handle('PageLoaded', async () => {
  const parser = selectParser();
  const isLoaded = parser?.isPageLoaded;

  const result = await new Promise(resolve => {
    setTimeout(() => resolve(false), 120_000);

    let check = setInterval(async () => {
      const isLoadedSet = await frameLoopAsync(isLoaded);
      const loaded = isLoadedSet?.filter(loaded => typeof loaded == 'boolean').includes(true);

      if (loaded) {
        clearInterval(check);
        resolve(true);
      }
    }, 100);
  });

  return result;
});

ipcRenderer.handle('Fetch', async (_, uri) => {
  const response = await window.fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    arrayBuffer: arrayBuffer
  }
});

// TODO: Modernize UI
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
      [...window.document.querySelectorAll('body *')]
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

function consoleLogger(logArray = [], warnArray = [], errorArray = []) {
  console.defaultLog = console.log.bind(console);
  console.defaultWarn = console.warn.bind(console);
  console.defaultError = console.error.bind(console);

  console.log = function () {
    console.defaultLog.apply(console, arguments);
    logArray.push(Array.from(arguments));
  }

  console.error = function () {
    console.defaultError.apply(console, arguments);
    warnArray.push(Array.from(arguments));
  }

  console.warn = function () {
    console.defaultWarn.apply(console, arguments);
    errorArray.push(Array.from(arguments));
  }
}

function selectParser() {
  const host = window.location.origin;
  let result;

  Object.entries(parser).forEach(detection => {
    if (detection[1].libraries.some(library => host.includes(library)))
      result = detection[1];
  });

  return result;
}

async function frameLoopAsync(method) {
  if (!(method instanceof Function) || document.body.childElementCount <= 0) return;
  let results = [];

  results[0] = await method(window.document);

  const frames = window.document.querySelectorAll('iframe');
  for (let i = 0; i <= frames.length; i++) {
    const frame = frames[i];
    if (!frame?.contentDocument) continue;
    results[i + 1] = await method(frame.contentDocument);
  }

  // remove duplicates, undefined and empty values
  results = [...new Set(results)].filter(result => result != undefined && result !== '');

  return results;
}