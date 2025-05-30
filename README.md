# dynapp-vscode README


This extension alows vscode to download and publish to DynApp.

# Get started!

Install from marketplace: https://marketplace.visualstudio.com/items?itemName=WIPab.dynapp-vscode

## dynappconfig.json

* **username** - The username and group separated with slash to use for requests againts DynApp.
* **password** - The password for the given user.
* **group** - The group name of the app to work against.
* **app** - The app id of the app to work against.
* **baseurl** - The base url of the DynApp server.
* **workpath** - Path to where the app files are saved relative to the config file.
* **rungroup** - For use with DynApp Webcomponents. Overrides the value of group when running a web with proxy locally.
* **runapp** - For use with DynApp Webcomponents. Overrides the value of app when running a web with proxy locally.

## Use it!

* In your directory, open commands with "ctrl+shift+p" and run "Create Dynapp Config" or "ctrl+alt+C" (mac: "shift+cmd+c")
* Open the new file 'dynappconfig.json' and enter your credentials.
* Run "Download from Dynapp" (or "ctrl+alt+o" (mac "shift+cmd+o")) to download your project from dynapp-server.
* You can now locally edit the files.
* To publish your changes, run "Upload to Dynapp" (or press "ctrl+alt+u"  (mac "shift+cmd+u"))

# TODO

As this package was ported quickly from atom packages due to sunseting of Atom, thus this package could use some more care.
For example, it has certain dependencies that won work when upgrading them to a new version (node-fetch, js-base64)

Ability to send py code to server and retrive the response, just like the native Dynapp editor would be very usefull.

Original atom-package was developed here: https://github.com/wip-opensource/dynapp-atom

# Development

The package can be ran in VS Code to test during development.

When ready to realease, commit you changes and tag your release.
Then build/package a new .vsix file for distribution.

If this is your first time, you first need to install @vsce@.

```
npm install -g @vscode/vsce
```

The package the extension. This will create the .vsix file, named using the current version in package.json

```
vsce package
```

For more details: https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions

The packaged vsix file can be submitted to VSCode Marketplace via vsce or via web:
https://marketplace.visualstudio.com/manage/publishers/

## Installing

* Download dynapp-vscode-x.x.x.vsix
* Open vsCode>File>Preferences>Extensions
* Click dot meny in EXTENSIONS tab > Install from VSIX > locate dynapp-vscode-x.x.x.vsix

# Release Notes

## 1.2.5

* Updated README
* Fix to narrow checking of OK status codes
* Fix bad build

## 1.2.4

* Don't fail upload when missing data-sources folder
* Improve error messages

## 1.2.1

* Changed to removing not ignored files on download instead of copying ignored files to a temp folder and back while clearing workspace

## 1.2.0

* Added support for a .dynappignore file to specify files not to sync
* Corrected message for creating config
* Changed user agent in requests
* Improved log info when uploading

## 1.1.0

* Added settings for default config values

## 1.0.0

* First functional version of the port
* Ported the extension from atom packages to VS code

---


