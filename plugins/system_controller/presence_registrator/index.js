'use strict';

var libQ = require('kew');
var fs=require('fs-extra');
var config = new (require('v-conf'))();
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
var Gpio = require('onoff').Gpio;
var io = require('socket.io-client');
var socket = io.connect('http://localhost:3000');

module.exports = presenceRegistrator;
function presenceRegistrator(context) {
	var self = this;

	this.context = context;
	this.commandRouter = this.context.coreCommand;
	this.logger = this.context.logger;
	this.configManager = this.context.configManager;
	
	// Global Trigger array
	this.triggers = [];

}



presenceRegistrator.prototype.onVolumioStart = function()
{
	var self = this;
	var configFile=this.commandRouter.pluginManager.getConfigurationFile(this.context,'config.json');
	this.config = new (require('v-conf'))();
	this.config.loadFile(configFile);
	
	// Log Plugin start
	self.logger.info("Presence Registrator initialized.");

    return libQ.resolve();
}

presenceRegistrator.prototype.onStart = function() {
    var self = this;
	var defer=libQ.defer();

	
	// Log Plugin start
	self.logger.info("Presence Registrator started.");
	
	// Notify user about Plugin start
	self.commandRouter.pushToastMessage('success', "Hola!", "Presence Registrator enabled!");
	
	// Once the Plugin has successfull started resolve the promise
	defer.resolve();

    return defer.promise;
};

presenceRegistrator.prototype.onStop = function() {
    var self = this;
    var defer=libQ.defer();
	
	// Log Plugin stop
	self.logger.info("Presence Registrator stopped.");
	
	// Notify user about Plugin stop
	self.commandRouter.pushToastMessage('success', "Adios!", "Presence Registrator disabled!");
	
    // Once the Plugin has successfull stopped resolve the promise
    defer.resolve();

    return libQ.resolve();
};

presenceRegistrator.prototype.onRestart = function() {
    var self = this;
    // Optional, use if you need it
};


// Configuration Methods -----------------------------------------------------------------------------

presenceRegistrator.prototype.getUIConfig = function() {
    var defer = libQ.defer();
    var self = this;

    var lang_code = this.commandRouter.sharedVars.get('language_code');

    self.commandRouter.i18nJson(__dirname+'/i18n/strings_'+lang_code+'.json',
        __dirname+'/i18n/strings_en.json',
        __dirname + '/UIConfig.json')
        .then(function(uiconf)
        {


            defer.resolve(uiconf);
        })
        .fail(function()
        {
            defer.reject(new Error());
        });

    return defer.promise;
};

presenceRegistrator.prototype.getConfigurationFiles = function() {
	return ['config.json'];
}

presenceRegistrator.prototype.setUIConfig = function(data) {
	var self = this;
	//Perform your installation tasks here
};

presenceRegistrator.prototype.getConf = function(varName) {
	var self = this;
	//Perform your installation tasks here
};

presenceRegistrator.prototype.setConf = function(varName, varValue) {
	var self = this;
	//Perform your installation tasks here
};




// ******************************************************************************************
// Custom functions to save and retrieve config parameters

// Save config parameters from UIConfig
presenceRegistrator.prototype.saveConfig = function(data) {
	var self = this;
	// Log what I am doing
	self.logger.info("PRESENCE REGISTRATOR: Attempting to save parameters");
	
	// Save configuration parameters from data
	self.config.set('maxVol', data['maxVol']);
	self.config.set('minVol', data['minVol']);
	self.config.set('listenedPin', data['listenedPin']);
	
	// Clear all Triggers and set them again
	self.clearTriggers()
		.then(self.createTriggers());
	
	// Notify log and user about the success of this operation
	self.logger.info("PRESENCE REGISTRATOR: New configuration saved.");
	self.commandRouter.pushToastMessage('success',"Presence Registrator", TRANSLATE.CONFIG_SAVED);
};

// Show config parameters from config.json file
presenceRegistrator.prototype.showConfig = function(data)
{
	var self = this;
	
	// Extract configuration parameters from config file
	var maxVol = self.config.get('maxVol');
	var minVol = self.config.get('minVol');
	var pin = self.config.get('listenedPin');
	
	// Clear all Triggers and set them again
	self.clearTriggers()
		.then(self.createTriggers());
	
	// Notify log and user about the config parameters
	var outstr = "Listening on Pin " + pin + " with a maximum Volume of " + maxVol + "% and a minimum Volume of " + minVol + "%.";
	self.logger.info("PRESENCE REGISTRATOR: " + outstr);
	self.commandRouter.pushToastMessage('success',"GPIO Tester", outstr);
};

// End of custom configuration functions
// ******************************************************************************************




// ******************************************************************************************
// Custom functions to set and clear Triggers on the Gpio Pins

// Create Triggers from config data
presenceRegistrator.prototype.createTriggers = function()
{
	var self = this;
	
	// Read config parameters
	var pin = self.config.get('listenedPin');
	
	// Log what I am doing
	self.logger.info("PRESENCE REGISTRATOR: Attempting to set up Trigger on pin " + pin + ".");
	
	// Create rising and falling Trigger on configured pin
	var listener = new Gpio(pin,'in','both', {debounceTimeout: 250});
	self.logger.info("PRESENCE REGISTRATOR: Created Trigger.");
	
	// Define Interrupt handler
	listener.watch((err,value) => {
		if (err) {
			self.logger.info("PRESENCE REGISTRATOR: Could not activate interrupt on pin " + pin + ".");
		}
		self.presenceChanger(value);
	});
	self.logger.info("PRESENCE REGISTRATOR: Assigned Interrupt Handler.");
	
	// Add Trigger to global Trigger array
	self.triggers.push(listener);
	self.logger.info("PRESENCE REGISTRATOR: Added Trigger to Global Array");
	
	return libQ.resolve();
}

// Clear all active Triggers
presenceRegistrator.prototype.clearTriggers = function()
{
	var self = this;
	
	// Log what I am doing
	self.logger.info("PRESENCE REGISTRATOR: Attempting to delete all Triggers.");
	
	// Cycle through Trigger array deleting all Triggers
	self.triggers.forEach(function(trigger, index, array) {
		trigger.unwatchAll();
		trigger.unexport();
	});
	self.triggers = [];
	self.logger.info("PRESENCE REGISTRATOR: Deleted all Triggers.");
	
	return libQ.resolve();	
};

// Interrupt handler function
presenceRegistrator.prototype.presenceChanger = function(value)
{
	var self = this;
	
	// Get config data
	var maxVol = self.config.get('maxVol');
	var minVol = self.config.get('minVol');
	
	var present;
	var outstr;
	
	// Check if there was a rising (1) or a falling (0) edge on the GPIO Pin
	if(value==1){
		present = true;
		var outstr = "full";
		socket.emit('volume',maxVol);
	} else{
		present = false;
		outstr = "empty";
		socket.emit('volume',minVol);
	}
	
	// Write new presence information to config
	self.config.set('presence',present);
	
	// Notify log and user about it
	self.logger.info("PRESENCE REGISTRATOR: The room is now " + outstr + ".");
	self.commandRouter.pushToastMessage('success',"Presence Registrator", "The room is now " + outstr + ".");
	
	return libQ.resolve();
}

// End of custom Trigger functions
// ******************************************************************************************




// Playback Controls ---------------------------------------------------------------------------------------
// If your plugin is not a music_sevice don't use this part and delete it


presenceRegistrator.prototype.addToBrowseSources = function () {

	// Use this function to add your music service plugin to music sources
    //var data = {name: 'Spotify', uri: 'spotify',plugin_type:'music_service',plugin_name:'spop'};
    this.commandRouter.volumioAddToBrowseSources(data);
};

presenceRegistrator.prototype.handleBrowseUri = function (curUri) {
    var self = this;

    //self.commandRouter.logger.info(curUri);
    var response;


    return response;
};



// Define a method to clear, add, and play an array of tracks
presenceRegistrator.prototype.clearAddPlayTrack = function(track) {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'presenceRegistrator::clearAddPlayTrack');

	self.commandRouter.logger.info(JSON.stringify(track));

	return self.sendSpopCommand('uplay', [track.uri]);
};

presenceRegistrator.prototype.seek = function (timepos) {
    this.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'presenceRegistrator::seek to ' + timepos);

    return this.sendSpopCommand('seek '+timepos, []);
};

// Stop
presenceRegistrator.prototype.stop = function() {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'presenceRegistrator::stop');


};

// Spop pause
presenceRegistrator.prototype.pause = function() {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'presenceRegistrator::pause');


};

// Get state
presenceRegistrator.prototype.getState = function() {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'presenceRegistrator::getState');


};

//Parse state
presenceRegistrator.prototype.parseState = function(sState) {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'presenceRegistrator::parseState');

	//Use this method to parse the state and eventually send it with the following function
};

// Announce updated State
presenceRegistrator.prototype.pushState = function(state) {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'presenceRegistrator::pushState');

	return self.commandRouter.servicePushState(state, self.servicename);
};


presenceRegistrator.prototype.explodeUri = function(uri) {
	var self = this;
	var defer=libQ.defer();

	// Mandatory: retrieve all info for a given URI

	return defer.promise;
};

presenceRegistrator.prototype.getAlbumArt = function (data, path) {

	var artist, album;

	if (data != undefined && data.path != undefined) {
		path = data.path;
	}

	var web;

	if (data != undefined && data.artist != undefined) {
		artist = data.artist;
		if (data.album != undefined)
			album = data.album;
		else album = data.artist;

		web = '?web=' + nodetools.urlEncode(artist) + '/' + nodetools.urlEncode(album) + '/large'
	}

	var url = '/albumart';

	if (web != undefined)
		url = url + web;

	if (web != undefined && path != undefined)
		url = url + '&';
	else if (path != undefined)
		url = url + '?';

	if (path != undefined)
		url = url + 'path=' + nodetools.urlEncode(path);

	return url;
};





presenceRegistrator.prototype.search = function (query) {
	var self=this;
	var defer=libQ.defer();

	// Mandatory, search. You can divide the search in sections using following functions

	return defer.promise;
};

presenceRegistrator.prototype._searchArtists = function (results) {

};

presenceRegistrator.prototype._searchAlbums = function (results) {

};

presenceRegistrator.prototype._searchPlaylists = function (results) {


};

presenceRegistrator.prototype._searchTracks = function (results) {

};

presenceRegistrator.prototype.goto=function(data){
    var self=this
    var defer=libQ.defer()

// Handle go to artist and go to album function

     return defer.promise;
};
