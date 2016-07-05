# NodeJS ARK Server Data Reader

This is a port of AuthiQ's ARK Server Data Reader into NodeJS. There might still be a few quirks, but I'm sure it will work fine. 
I still need to modify this so that it can be used on npm, but I'll get there.

----

You can help me test the library by running the following with npm

```npm install git+https://github.com/knightzac19/NodeJS-ArkData.git```

## How-To

Go to your node_modules/arkdata folder and copy the settings.json-example to your project root ./settings.json and make sure the ark path is correct. 
Then you should be able to just have the following require.

``` 
var arkdata = require('arkdata'); 
var player = arkdata.player; 
var tribe = arkdata.tribe;
```

In your project just have the following two callbacks,

```
player.setupPlayers(function() {  
    tribe.setupTribes(function() {
      /*Put all your code in here to ensure that your player data is all set. */ 
      }); 
}); 
```

## Issues

Please report any issues you have with it in the repo and hopefully we'll be able to fix them!
