const { ipcRenderer, shell, remote } = require('electron');
const PDFDocument = require('pdfkit');
const downloader = require('../app/downloader');
const path = require('path');
const fs = require('fs');

window.ipcRenderer = ipcRenderer;

var lockDownload = false;

ipcRenderer.on('download', async (_, mode) => {
  if (lockDownload) {
    remote.dialog.showMessageBox(null, {
      type: 'info', title: 'Download is running ...', message: 'Your book has not yet been fully downloaded!', detail: 'Please wait until your book has finished downloading before starting the next one, only one book can be downloaded at a time.'
    });
    return;
  }

  var bookSize = getBookSize();
  if (!bookSize) {
    remote.dialog.showMessageBox(null, {
      type: 'info', title: 'Nothing found to download!', message: 'No book was found to download!', detail: 'Please go to a book that you want to download. If you\'ve already opened the book, please open an issue on Github and report that you cannot download this book.'
    });
    return;
  }

  manipulateContent('Select storage location to save the PDF ...');

  var input = await remote.dialog.showSaveDialog({
    'filters': [{ 'name': 'PDF', 'extensions': ['pdf'] }],
    'defaultPath': path.join(remote.app.getPath('documents'), document.title + '.pdf')
  });

  var filePath = input.filePath;
  if (!filePath) {
    manipulateContent('Canceled download...');
    document.location.reload();
    return;
  }

  lockDownload = true;

  manipulateContent('Create pdf file ...');

  var writeStream = fs.createWriteStream(filePath)
  writeStream.on('finish', async () => await shell.openPath(filePath));
  
  var doc = new PDFDocument({ autoFirstPage: false });
  doc.pipe(writeStream);

  if (mode == 'page') {
    manipulateContent(`Downloading current page ...`);
    try {
      await downloader.writePageToPdf(doc, bookSize, window.location);
    } catch (error) {
      lockDownload = false;;
      showDownloadError(error);
      document.location.reload();
      return;
    }
  }
  else if (mode == 'book') {
    var loop = true;
    for (var i = 1; loop; i++) {
      manipulateContent(`Downloading page ${i} ...`, { customPage: i});
      try {
        var response = await downloader.writePageToPdf(doc, bookSize, window.location, i);
        if (response && response.status == 404) loop = false;
        else if (response) new Error(response.message);
      } catch (error) {
        loop = false;
        lockDownload = false;
        showDownloadError(error);
        window.document.location.search = '?page=' + i;
        return;
      }
    }
  }

  function showDownloadError(error) {
    remote.dialog.showMessageBox(null, {
      type: 'error', title: 'Download error!', message: 'Unfortunately an error occurred while downloading your book!', detail: error.message
    });
  }

  doc.end();

  lockDownload = false;

  manipulateContent('Download Complete!');
});

function getBookSize() {
  var scriptTags = window.document.getElementsByTagName("script");
  if (scriptTags == undefined) return null;

  var scriptRegex = /[0-9]*,[0-9]*/gm;
  var sizes = scriptRegex.exec(scriptTags[0].innerHTML);
  if (sizes == undefined) return null;

  var isBook = downloader.isDownloadable(location.href);
  if (!isBook) return null;

  return [Number(sizes[0].split(',')[0]), Number(sizes[0].split(',')[1])];
}

function manipulateContent(message, { customPage } = {}) {
  var navigationElement = document.getElementById('mainNav');  
  var messageElement = document.getElementById('message');

  if (!messageElement) {
    messageElement = document.createElement("p");
    messageElement.id = 'message';
    messageElement.style.color = '#fff';
    messageElement.style.fontSize = '20pt';
    messageElement.style.fontFamily = 'Open Sans, sans-serif';
    messageElement.style.left = '50%';
    messageElement.style.top = '50%';
    messageElement.style.position = 'absolute';
    messageElement.style.textAlign = 'center';
    messageElement.style.transform = 'translate(-50%, -50%)';
    
    var contentElement = document.getElementById('mainContent');
    if (navigationElement && contentElement) {
      navigationElement.style.pointerEvents = 'none';
      contentElement.innerHTML = null;
      contentElement.appendChild(messageElement);
    } else {
      var body = document.getElementsByTagName('body')[0];
      body.innerHTML = null;
      body.appendChild(messageElement);
    }
  }
  
  if (navigationElement && customPage) document.getElementById('txtPage').value = customPage;

  messageElement.innerHTML = message;
}