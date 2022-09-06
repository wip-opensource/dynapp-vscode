const path = require('path');
const fs = require('fs-extra');
const vscode = require('vscode');
// TODO: Should be passed as argument to Sync constructor instead, like `new Sync({projectPath: '...'})`.
// TODO: Pass as argument to not make any coupling to vscode.
function projectPath () {
  let pPaths = vscode.workspace.workspaceFolders;
  if (pPaths == undefined) {
    console.log('Project path is not defined');
    return null;
  }
  return pPaths.map(folder => folder.uri.path)[0];
}

function projectFilePath (relativePath) {
  return path.join(projectPath(), relativePath);
}

function workPath () {
  let wPath = config().workpath || '';
  return path.join(projectPath(), wPath);
}

function workFilePath (relativePath) {
  return path.join(workPath(), relativePath);
}

function config () {
  try {
    let content = fs.readFileSync(projectFilePath('dynappconfig.json'), 'utf8');
    return JSON.parse(content);
  } catch(ex) {
    console.log('Could not find dynappconfig.json');
    return {};
  }
}

async function create() {
  let dynappConfig = {
    'username': '<username>/<devgroups>',
    'password': '<password>',
    'group': '<projectGroup>',
    'app': '<appname>',
    'baseUrl': 'https://dynappbeta.wip.se/',
    'workpath': '',
    'rungroup': '',
    'runapp': ''
  };
  dynappConfig.username = vscode.workspace.getConfiguration('dynappvscode').get("defaultUserNameAndGroup")
  dynappConfig.password = vscode.workspace.getConfiguration('dynappvscode').get("defaultPassword")
  dynappConfig.baseUrl = vscode.workspace.getConfiguration('dynappvscode').get("defaultBaseUrl")
  
  let configFile = path.join(projectPath(), 'dynappconfig.json');
  let configFileExists = await fs.exists(configFile);
  if (!configFileExists) {
    console.log('Config file created');
    await fs.writeFile(configFile, JSON.stringify(dynappConfig, null, 4));
  } else {
    console.log('Config file already exists');
  }
}

module.exports = {
  projectPath,
  projectFilePath,
  workPath,
  workFilePath,
  config,
  create
}
