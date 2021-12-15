const { ipcRenderer } = require('electron');

window.ipcRenderer = ipcRenderer;

ipcRenderer.on('request:Fetch', async (_, uri) => {
  var response = await window.fetch(uri);
  var arrayBuffer = await response.arrayBuffer();

  ipcRenderer.send('Fetch', { ok: response.ok, status: response.status, statusText: response.statusText, arrayBuffer});
});

ipcRenderer.on('request:SvgData', async () => {
  var data = [];

  const svgObjects = window.document.querySelectorAll('object');

  for (let i = 0; i < svgObjects.length; i++) {
    data[i] = {};
    data[i].uri = svgObjects[i].data;
      
    const svgResponse = await window.fetch(data[i].uri);
    const svgArrayBuffer = await svgResponse.arrayBuffer();

    data[i].content = svgArrayBuffer;

    const decoder = new TextDecoder();
    const parser = new DOMParser();

    const svgData = decoder.decode(data[i].content);
    const svgElement = parser.parseFromString(svgData, "image/svg+xml");
    const viewBox = svgElement.documentElement.viewBox.baseVal;

    const width = viewBox.width == 0 ? svgObjects[i].width : viewBox.width;
    const height = viewBox.height == 0 ? svgObjects[i].height : viewBox.height;

    data[i].size = [Number(width), Number(height)];
  }

  ipcRenderer.send('SvgData', data);
});

ipcRenderer.on('request:PageLabel', () => {
  let label = document.querySelector('#txtPage')?.value || document.querySelector('input')?.value;
  let page = '';

  if (label) {
    label = label.replaceAll(' ', '');
    let activePages = label.split('/')[0];
    page = activePages.split('-')[0];
  }

  ipcRenderer.send('PageLabel', page);
});

ipcRenderer.on('request:BookTitle', () => {
  var title = window.document.title;

  var metas = window.document.getElementsByTagName('meta');
  for (let i = 0; i < metas.length; i++) {
    if (metas[i].getAttribute('name') == 'title') {
      title = metas[i].getAttribute('content');
    }
  }

  ipcRenderer.send('BookTitle', title);
});

ipcRenderer.on('wait:PageLoaded', () => {
  var isPageLoading = true;

  var loadPage = window.document.getElementById('loadPage') || document.getElementsByClassName('loader')[0];
  if (loadPage) {
    while (isPageLoading)
      if (loadPage.style.display != 'block') isPageLoading = false;
  }

  ipcRenderer.send('PageLoaded');
});

ipcRenderer.on('manipulateContent', (_, message, { text, url }) => {
  var navigationElement = window.document.getElementById('mainNav');
  var overlayElement = window.document.getElementById('download-overlay');
  var messageElement = window.document.getElementById('download-message');
  var buttonElement = window.document.getElementById('download-button');

  if (!overlayElement) {
    if (navigationElement) {
      navigationElement.style.pointerEvents = 'none';
      navigationElement.style.backgroundColor = '#fff';
    }
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

    var contentElement = window.document.getElementById('mainContent');
    if (contentElement) {
      contentElement.prepend(overlayElement);
    } else {
      var body = window.document.getElementsByTagName('body')[0];
      body.prepend(overlayElement);
    }
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