// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const config = require('./dynapp/config');
const fs = require('fs-extra');
const path = require('path');
const sync = require('./dynapp/sync');
const api = require('./dynapp/api');
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	console.log('Extension "dynappvscode" is now active!');

	let _upload = vscode.commands.registerCommand('dynappvscode.upload', function () {
		upload();
	});
	let _download = vscode.commands.registerCommand('dynappvscode.download', function () {
		download();
	});
	let _createConfig = vscode.commands.registerCommand('dynappvscode.createConfig', function () {
		createConfig();
	});
	context.subscriptions.push(_upload);
	context.subscriptions.push(_download);
	context.subscriptions.push(_createConfig);
}

async function createConfig() {
	vscode.window.showInformationMessage('Creating config');
	await config.create();
	await createWorkFolder(config.workPath());
	await createIgnore(false, '.hgignore');
	await createIgnore(false, '.gitignore');
}


async function createWorkFolder(workpath) {
	await ensurePath(workpath);

	try {
		await fs.mkdir(path.join(workpath, 'data-source-items'));
	} catch (ex) {
		// data-source-items already exists
	}
	try {
		await fs.mkdir(path.join(workpath, 'data-objects'));
	} catch (ex) {
		// data-objects already exists
	}
	try {
		await fs.mkdir(path.join(workpath, 'data-items'));
	} catch (ex) {
		// data-items already exists
	}
}
async function ensurePath(path) {
	if (!fs.existsSync(path)) {
		await fs.mkdir(path, {
			recursive: true
		});
	}
}

async function createIgnore(messages, name) {
	if (messages) {
		vscode.window.showInformationMessage('Creating ignore file');
	}

	let projectPath = config.projectPath();
	let content = `syntax: regexp
.dynapp-state$
^dynappconfig.json$
data-items/version-android.json
data-items/version-ios.json
node_modules/
.DS_Store
dist/
data-items/web/
\#$
~$
`;
	let file = path.join(projectPath, name);
	let fileExists = await fs.exists(file);
	if (!fileExists) {
		await fs.writeFile(file, content);
		if (messages) {
			vscode.window.showInformationMessage('Ignore file created');
		}
	} else if (messages) {
		vscode.window.showErrorMessage('A file named ' + name + ' already exists.');
	}
}

async function download() {
	console.log('Downloading...');

	let _sync = new sync.Sync();
	vscode.window.showInformationMessage('Downloading project');

	try {
		await createWorkFolder(config.workPath());

		await _sync.download();
		console.log('Downloading Done!');
		vscode.window.showInformationMessage('Project downloaded');
	} catch (err) {
		console.error(err);
		var error_message = 'Check logs for more info.';
		if (err instanceof api.StatusCodeError) {
			error_message = '' + err.status + ', '
			if (err.status == 401 || err.status == 403) {
				error_message += 'Check credentials.';
			} else if (err.status == 404) {
				error_message += 'Check group, app and baseurl.';
			} else {
				error_message += 'Check logs for more info.';
			}
		} else if (err.name === 'RequestError' && err.error.code === 'ENOTFOUND') {
			error_message = "Couldn't find host.";
		} else if (err.name === 'Error' && err.message.indexOf('is this a zip file') !== -1) {
			error_message = "Couldn't parse zip. Is url correct?";
		}
		error_message = 'Download failed. ' + error_message;
		vscode.window.showErrorMessage(error_message);
	}
}

async function upload() {
	vscode.window.showInformationMessage('Uploading files');
	try {
		// TODO: Move config out of dynapp/ and pass config to upload
		let _sync = new sync.Sync();
		await _sync.upload();
		console.log('Uploading Done!');
		vscode.window.showInformationMessage('Files are uploaded');
	} catch (err) {
		console.error(err);
		var error_message = 'Check logs for more info.';
		if (err instanceof api.StatusCodeError) {
			error_message = '' + err.status + ', '
			if (err.status == 401 || err.status == 403) {
				error_message += 'Check credentials.';
			} else if (err.status == 404) {
				error_message += 'Check group, app and baseurl.';
			} else {
				error_message += 'Check logs for more info.';
			}
		} else if (err.name === 'RequestError' && err.error.code === 'ENOTFOUND') {
			error_message = "Couldn't find host.";
		}
		error_message = 'Upload failed. ' + error_message;
		vscode.window.showErrorMessage(error_message);
	}
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
