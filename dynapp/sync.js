const config = require('./config');
const api = require('./api');
const md5File = require('md5-file');
const fs = require('fs-extra');
const path = require('path');
const mkdirp = require('mkdirp');
const JSZip = require('jszip');

function json_stringify_readable(content) {
  return JSON.stringify(content, null, 4);
}

// Remove dir with files recursively
const rmdir = async function(dir) {
    let files = await fs.readdir(dir);

    for (let i = 0; i < files.length; i++) {
      let file = files[i];
      let fileName = path.join(dir, file);
      let stat;
      try {
          stat = fs.statSync(fileName);
      } catch(err) {
      }
      if (fileName == "." || fileName == "..") {
          // pass these files
          continue;
      } else if (stat && stat.isDirectory()) {
          // rmdir recursively
          await rmdir(fileName);
      } else {
          // rm filename
          await fs.unlink(fileName);
      }
    }
    await fs.rmdir(dir);
};

/* TODO: I'm absolutely certain there is a good use case for generators here,
   but i can't figure out how to use them with nested promises.
   Is there a workaround without babel until this is available?
   https://github.com/tc39/proposal-async-iteration
*/
/* TODO: Can be optimized by not simply awaiting everything. Next file could be read in parallel. */
async function listFiles(folder, filter) {
  let result = [];

  let files = await fs.readdir(folder);
  for (let i = 0; i < files.length; i++) {
    let file = files[i];
    let fileWithPath = path.join(folder, file);
    let stats;
    try {
      stats = await fs.stat(fileWithPath);
    } catch (err) {
    }
    if (stats && stats.isDirectory()) {
      let subFiles = await listFiles(path.join(folder, file), filter);
      subFiles.forEach(subFile => {
        result.push(path.join(file, subFile));
      });
    } else {
      result.push(file);
    }
  }

  if (filter) {
    result = result.filter((file) => {
      return filter(path.join(folder, file));
    });
  }

  return result.slice(0);
}



class DynappObjects {
  constructor(folder, fileExt) {
    this.folder = folder;
    // TODO: Use a single meta-file per type (data-items, data-source-items, data-objects)
    //       Would remove need to check file extension and have filter
    //       Would also make file tree more user friendly
    this.fileExt = fileExt || '';
    this.ignoreList = this.getIgnoreList();
  }

  getIgnoreFilePath () {
    return path.join(config.projectPath(), '.dynappignore');
  }

  getIgnoreList () {
    let ignoreContent;
    try {
      ignoreContent = fs.readFileSync(this.getIgnoreFilePath(), 'utf8');
    } catch(err) {
      if (err.code === 'ENOENT') {
        // Create a default ignore file
        ignoreContent = [
          '# Files to not sync with DynApp',
          '/node_modules/',
          '/dist/'
        ].join('\n');
        fs.writeFileSync(this.getIgnoreFilePath(), ignoreContent, 'utf8');
      } else {
        throw err;
      }
    }
    return ignoreContent
      .split('\n')
      .filter(line => !!line && line[0] != '#')
      .map(line => new RegExp(line.replace(/\//g, '\\' + path.sep)));
  }

  getIgnoredFilter () {
    // Function to determine if file should be ignored or not
    var ignoreList = this.ignoreList;
    return function (filePath) {
      filePath = filePath.split(config.workPath()).slice(-1)[0];
      if (filePath.indexOf(path.sep) == 0) {
        filePath = filePath.slice(1);
      }
      return ignoreList.some(regex => regex.test(filePath));
    };
  }

  getNotIgnoredFilter () {
    // Function to determine if file should be ignored or not
    var ignoreFilter = this.getIgnoredFilter();
    return function (filePath) {
      return !ignoreFilter(filePath);
    };
  }

  _objectsPath () {
    return path.join(config.workPath(), this.folder);
  }

  async upload () {
    let objectsPath = this._objectsPath();
    let operations = [];
    let [newObjects, changedObjects, deletedObjects] = await this.dirty();

    let logString = this.folder + ' - ';
    let changeInfo = []
    if (newObjects.length > 0) {
      changeInfo.push(newObjects.length + ' new');
    }
    if (changedObjects.length > 0) {
      changeInfo.push(changedObjects.length + ' changed');
    }
    if (deletedObjects.length > 0) {
      changeInfo.push(deletedObjects.length + ' deleted');
    }
    if (newObjects.length + changedObjects.length + deletedObjects.length == 0) {
      changeInfo.push('No changes');
    }
    logString += changeInfo.join(', ');
    console.log(logString);

    for (let obj of newObjects) {
      operations.push(this.createObject(obj, path.join(objectsPath, obj)));
    }
    for (let obj of changedObjects) {
      operations.push(this.updateObject(obj, path.join(objectsPath, obj)));
    }
    for (let obj of deletedObjects) {
      operations.push(this.deleteObject(obj).catch(err => {
        // File has been removed by other means, everything is good
        if (err.statusCode && err.statusCode === 404)
          return err.message;
        else
          throw err;
      }));
    }

    return await Promise.all(operations);
  }

  createObject (obj, file) {
    throw new Error('Not implemented');
  }

  updateObject (obj, file) {
    throw new Error('Not implemented');
  }

  deleteObject (obj, file) {
    throw new Error('Not implemented');
  }

  async hashes() {
    let operations = [];
    let objectsPath = this._objectsPath();
    // TODO: Reuse list from dirty() and hashes() ?
    let localFiles = await listFiles(objectsPath, this.getNotIgnoredFilter());

    // Do in batches to not exceed open file limit
    var batchSize = 100;
    var batchCount = Math.ceil(localFiles.length / batchSize);
    var files = [];
    for (let b = 0; b < batchCount; b++) {
      let batchFiles = localFiles.slice(b*batchSize, (b+1)*batchSize);
      for (let i = 0; i < batchFiles.length; i++) {
        let fileName = batchFiles[i];
        let operation = md5File(path.join(objectsPath, fileName)).then(function(hash) {
          return {
            name: fileName,
            hash: hash
          };
        });
        operations.push(operation);
      }
      files = files.concat(await Promise.all(operations));
    }

    let result = {};
    for (let i = 0; i < files.length; i++) {
      let file = files[i];
      result[file.name] = {
        hash: file.hash
      };
    }

    return result;
  }

  setHashes (hashes) {
    this._hashes = hashes;
  }

  async readMeta (file) {
    let metaFilePath = file + '.meta.json';
    let metaRaw = '{}'
    try {
      metaRaw = await fs.readFile(metaFilePath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT')
        throw err;
    }
    return JSON.parse(metaRaw);
  }

  async generateMeta (file) {
    // Generates a meta json file, used for updating data-sources and -objects
    let metaFilePath = file.substring(0, file.lastIndexOf('.py')) + '.meta.json';

    let bodyRaw = await fs.readFile(file, 'utf8');
    let body = Buffer.from(bodyRaw).toString('base64');

    let metaRaw = '{}';
    try {
      metaRaw = await fs.readFile(metaFilePath, 'utf8');
    } catch(err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
    let meta = JSON.parse(metaRaw);

    meta.stylesheet = body;
    return json_stringify_readable(meta);
  }

  async dirty() {
    let objectsPath = this._objectsPath();
    let localFiles = await listFiles(objectsPath, this.getNotIgnoredFilter());
    let newObjects = [];
    let deletedObjects = [];
    let changedObjectsOperations = [];

    for (let file of localFiles) {
      if (file in this._hashes) {
        // Check both normal and meta-files for changes
        let operation = md5File(path.join(objectsPath, file)).then((hash) => {
          return this._hashes[file].hash !== hash ? file : null;
        });
        changedObjectsOperations.push(operation);
      } else if (!file.endsWith('.meta.json')) {
        newObjects.push(file);
      }
    }

    for (let fileName in this._hashes) {
      // No need to try to delete meta files
      if (!fileName.endsWith('.meta.json') && localFiles.indexOf(fileName) === -1) {
        deletedObjects.push(fileName);
      }
    }

    // Remove all nulls returned in above loop
    let changedObjects = (await Promise.all(changedObjectsOperations))
      .filter(item => !!item);
    changedObjects = changedObjects.map(item => item.replace(/\.meta\.json$/, this.fileExt));
    // Remove duplicates. We might have caught meta files that we formatted to be origin files.
    // Because if meta changes origin should be updated.
    changedObjects = [...new Set(changedObjects)];

    return [newObjects, changedObjects, deletedObjects];
  }

  async removeNonIgnored () {
    // Remove files that are not ignored
    let objectsPath = this._objectsPath();
    let files = await listFiles(objectsPath, this.getNotIgnoredFilter());
    let fileMovements = [];
    for (let file of files) {
      let fileMovement = new Promise((resolve, reject) => {
        fs.unlink(path.join(objectsPath, file)).then(resolve, reject);
      });
      fileMovements.push(fileMovement);
    }
    return await Promise.all(fileMovements);
  }
}

class DataItems extends DynappObjects {
  constructor() {
    super('data-items', null);
  }

  async createObject (dataItem, file) {
    // TODO: Should we use PUT? Then we have to catch eventual error and try PUT if POST already exists.
    // Seems like PUT just overrides everything, and that is kind of what we want.
    return await api.updateDataItem(dataItem, fs.createReadStream(file), await this.readMeta(file));
  }

  async updateObject (dataItem, file) {
    return await api.updateDataItem(dataItem, fs.createReadStream(file), await this.readMeta(file));
  }

  deleteObject (dataItem) {
    return api.deleteDataItem(dataItem);
  }
}

class DataSourceItems extends DynappObjects {
  constructor() {
    super('data-source-items', '.py');
  }

  async createObject (dataSourceItem, file) {
    return await api.updateDataSourceItem(dataSourceItem.substring(0, dataSourceItem.lastIndexOf('.py')), await this.generateMeta(file));
  }

  async updateObject (dataSourceItem, file) {
    return await api.updateDataSourceItem(dataSourceItem.substring(0, dataSourceItem.lastIndexOf('.py')), await this.generateMeta(file));
  }

  deleteObject (dataSourceItem) {
    return api.deleteDataSourceItem(dataSourceItem.substring(0, dataSourceItem.lastIndexOf('.py')));
  }
}

class DataObjects extends DynappObjects {
  constructor() {
    super('data-objects', '.py');
  }

  async createObject (dataObject, file) {
    return await api.updateDataObject(dataObject.substring(0, dataObject.lastIndexOf('.py')), await this.generateMeta(file));
  }

  async updateObject (dataObject, file) {
    return await api.updateDataObject(dataObject.substring(0, dataObject.lastIndexOf('.py')), await this.generateMeta(file));
  }

  deleteObject (dataObject) {
    return api.deleteDataObject(dataObject.substring(0, dataObject.lastIndexOf('.py')));
  }
}

class Sync {
  constructor () {
    this.dataItems = new DataItems();
    this.dataSourceItems = new DataSourceItems();
    this.dataObjects = new DataObjects();
  }

  getStateFilePath () {
    return config.workFilePath('.dynapp-state');
  }

  async state () {
    let stateContent;

    try {
      stateContent = await fs.readFile(this.getStateFilePath(), 'utf8');
    } catch(err) {
      // Ensure we have a state-file
      if (err.code === 'ENOENT') {
        stateContent = json_stringify_readable({});
        await fs.writeFile(this.getStateFilePath(), stateContent, 'utf8');
      } else {
        throw err;
      }
    }

    return JSON.parse(stateContent);
  }

  async setHashes () {
    let state = await this.state();
    this.dataItems.setHashes(state['data-items'] || {});
    this.dataSourceItems.setHashes(state['data-source-items'] || {});
    this.dataObjects.setHashes(state['data-objects'] || {});
  }

  async dumpState () {
    let hashes = await Promise.all([
      this.dataItems.hashes(),
      this.dataSourceItems.hashes(),
      this.dataObjects.hashes()
    ]);

    let state = {
      'data-items': hashes[0],
      'data-source-items': hashes[1],
      'data-objects': hashes[2]
    };
    return await fs.writeFile(this.getStateFilePath(), json_stringify_readable(state), 'utf8');
  }

  async upload () {
    await this.setHashes();

    await Promise.all([
      this.dataItems.upload(),
      this.dataSourceItems.upload(),
      this.dataObjects.upload()
    ]);

    await this.dumpState();
  }

  async download () {
    // TODO: Break into parts and put in respective class

    // TODO: Now we load all of the zip into memory.
    // Can we stream it somehow?
    const appZip = await api.downloadApp();
    console.log('Zip downloaded');
    const unpacked = await JSZip.loadAsync(appZip);
    console.log('Zip unpacked');
    const workpath = config.workPath();

    // Remove files that doesn't match .dynappignore
    await Promise.all([
      this.dataItems.removeNonIgnored(),
      this.dataSourceItems.removeNonIgnored(),
      this.dataObjects.removeNonIgnored()
    ]);
    console.log('Removed non-ignored files');

    let operations = [];
    let dataItemsMeta = [];
    if ('data-items.json' in unpacked.files) {
      dataItemsMeta = await unpacked.file('data-items.json').async('text');
      dataItemsMeta = JSON.parse(dataItemsMeta);
      console.log('Parsed data items meta');
    }

    for (let fileName in unpacked.files) {
      if (!fileName.startsWith('data-items/')) {
        continue;
      }

      let file = unpacked.file(fileName);
      let dataItemFileCreation = new Promise(function(resolve, reject) {
        let localFileName = path.join(workpath, fileName);
        mkdirp(path.dirname(localFileName)).then(function () {
          file.nodeStream()
            .pipe(fs.createWriteStream(localFileName))
            .on('finish', function() {
              resolve();
            });
        });
      }).then(function() {
        let currentFileKey = fileName.substring('data-items/'.length);
        let currentFileMeta = dataItemsMeta.find(m => m.name === currentFileKey);
        let metaContent = {
          category: currentFileMeta.category
        };
        if (currentFileMeta.contentType)
          metaContent.contentType = currentFileMeta.contentType;
        if (currentFileMeta.key)
          metaContent.key = currentFileMeta.key;

        return fs.writeFile(path.join(workpath, fileName + '.meta.json'), JSON.stringify(metaContent));
      });

      operations.push(dataItemFileCreation);
    }
    console.log('Data-items write initiated');

    if ('data-objects.json' in unpacked.files) {
      operations.push(new Promise(function(resolve, reject) {
        unpacked.file('data-objects.json').async('text').then(function(dataObjectsRaw) {
          let dataObjects = JSON.parse(dataObjectsRaw);
          let dataObjectOperations = [];

          for (let dataObject of dataObjects) {
            let code;
            if (dataObject.stylesheet) {
              code = Buffer.from(dataObject.stylesheet, 'base64').toString('utf8');
            } else {
              code = '';
            }
            dataObject.stylesheet = '<See corresponding .py file>';
            let pyName = dataObject.name + '.py';
            let metaName = dataObject.name + '.meta.json';
            let pyOperation = fs.writeFile(path.join(workpath, 'data-objects', pyName), code);
            let metaOperation = fs.writeFile(path.join(workpath, 'data-objects', metaName), json_stringify_readable(dataObject));

            dataObjectOperations.push(pyOperation, metaOperation);
          }

          Promise.all(dataObjectOperations).then(resolve);
        });
      }));
      console.log('Data-objects write initiated');
    }

    // TODO: Duplicated code from data-objects
    if ('data-source-items.json' in unpacked.files) {
      operations.push(new Promise(function(resolve, reject) {
        unpacked.file('data-source-items.json').async('text').then(function(dataSourceItemsRaw) {
          let dataSourceItems = JSON.parse(dataSourceItemsRaw);
          let dataSourceItemOperations = [];

          for (let dataSourceItem of dataSourceItems) {
            let code;
            if (dataSourceItem.stylesheet) {
              code = Buffer.from(dataSourceItem.stylesheet, 'base64').toString('utf8');
            }
            else {
              code = '';
            }
            dataSourceItem.stylesheet = '<See corresponding .py file>';
            let pyName = dataSourceItem.name + '.py';
            let metaName = dataSourceItem.name + '.meta.json';

            let pyOperation = fs.writeFile(path.join(workpath, 'data-source-items', pyName), code);
            let metaOperation = fs.writeFile(path.join(workpath, 'data-source-items', metaName), json_stringify_readable(dataSourceItem));

            dataSourceItemOperations.push(pyOperation, metaOperation);
          }

          Promise.all(dataSourceItemOperations).then(resolve);
        });
      }));
      console.log('Data-sources write initiated');
    }

    await Promise.all(operations);
    console.log('All items written');
    await this.dumpState();
    console.log('State saved');

  }
}

module.exports = {
  Sync: Sync
}
