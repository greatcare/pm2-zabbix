var when = require('when');
var nodefn = require('when/node');
var pm2 = require('pm2');
var fs = nodefn.liftAll(require('fs'));
var pidusage = nodefn.liftAll(require('pidusage'));
var EventEmitter = require('events').EventEmitter;
var ProcessState = require('./ProcessState');

/* when's liftAll doesn't lift inherited properties.  PM2 v2 now
 * returns an object instance from require('pm2').  So just wrap the
 * functions we need.
 *
 * See https://github.com/cujojs/when/issues/294
 */
['connect', 'launchBus', 'list', 'disconnect'].forEach (function (fn) {
  pm2[fn + 'Async'] = nodefn.lift(pm2[fn]);
});

/**
 * PM2Tracker is a component that connects to the PM2 bus on its own, loads a process list,
 *  and allows for tracking process state changes within that list when new processes are started
 *  or existing ones are stopped. It is also possible to check the status of the PM2 daemon itself.
 * The tracker is constructed as inactive and must be started manually using start().
 * @constructor
 * @extends EventEmitter
 */
function PM2Tracker() {
	/**
	 * The PM2 bus object used for communicating with the process manager daemon.
	 * @type {Object}
	 */
	this._bus = null;
	/**
	 * A map of processes, indexed by process ID made out of the process name and pm_id.
	 * @type {Object.<string,ProcessState>}
	 */
	this._processes = {};
	
	EventEmitter.call(this);
}
PM2Tracker.prototype = Object.create(EventEmitter.prototype);

/**
 * Synthesize a textual identifier (processID) from a process info object obtained from PM2.
 * Returned IDs should coincide with PM2-generated values (for example, logs are typically stored in
 * <processName>-<index>.log files by PM2).
 * @static
 * @param {Object} processObject - The process description. Usually obtained as an element of the process list from PM2.
 * @returns {string} The synthetic processID.
 */
PM2Tracker.getProcessID = function getProcessID(processObject) {
	return processObject.name + '-' + processObject.pm_id;
};

/**
 * Take a process list and turn it into a map of ProcessState objects, keyed by the synthetic processID.
 * @static
 * @param {Object[]} processList - A process list, as obtained from pm2.list() (of PM2 API).
 * @returns {Object.<string,ProcessState>} A map of process states, keyed by processID.
 */
PM2Tracker.generateProcessMap = function generateProcessMap(processList) {
	var processes = {};
	processList.forEach(function(processEntry) {
		var processID = PM2Tracker.getProcessID(processEntry);
		processes[processID] = new ProcessState({
			name: processEntry.name,
			status: processEntry.pm2_env.status,
			resources: processEntry.monit,
			restarts: processEntry.pm2_env.restart_time
		});
	});
	
	return processes;
};

/**
 * Load a process list into the tracker. This updates the cached process map.
 * @param {Object[]} processList - The process list returned by pm2.list().
 */
PM2Tracker.prototype._loadProcessList = function _loadProcessList(processList) {	
	this._processes = PM2Tracker.generateProcessMap(processList);
};


/**
 * React to a process:event from the PM2 bus. This re-emits the event as "processStateChanged"
 *  if the process status has changed (e.g. from "online" to "stopping").
 * @param {Object} event - The event to react to.
 */
PM2Tracker.prototype._handleProcessEvent = function _handleProcessEvent(event) {
	var processID = PM2Tracker.getProcessID(event.process);
	var oldState = this._processes[processID];
	var newState = new ProcessState(event.process);
	this._processes[processID] = newState;
	
	if (!oldState || !oldState.equals(newState)) {
		this.emit('processStateChanged', { processID: processID, oldState: oldState, newState: newState });
	}
};

/**
 * Start the tracker. This initializes the connection to the PM2 bus and begins listening to events.
 * The cached process list is initially populated, and is kept updated.
 * @returns {Promise} A promise that fulfills when the connection has been established, appropriate listeners installed, and the process list cache populated.
 */
PM2Tracker.prototype.start = function start() {
	var self = this;
	
	return pm2.connectAsync().then(function() {
		return pm2.launchBusAsync();
	}).then(function(bus) {
		/* when has wrapped the bus and bus socket parameters in an
		 * array
		 */
		self._bus = bus[0];
		bus[0].on('process:event', function(event) {
			self._handleProcessEvent(event);
		});
		
		return pm2.listAsync();
	}).then(function(processList) {
		self._loadProcessList(processList);
	});
};

/**
 * Disconnect from the PM2 bus and stop listening to process events.
 */
PM2Tracker.prototype.stop = function stop() {
	return pm2.disconnectAsync();
};

/**
 * Get the cached process map that includes updated process statuses.
 * Note that only statuses (online, stopped, etc. - PM2-specific) are supposed to be current -
 *  other data, such as resource usage numbers, will most likely be stale.
 * For up-to-date stats on resources, use getProcessMap().
 * @returns {Object.<string,ProcessState>}
 */
PM2Tracker.prototype.getCachedProcessMap = function getCachedProcessMap() {
	return this._processes;
};

/**
 * Get an up-to-date process map, including momentary resource usage.
 * This does not internally update the cache, which is maintained separately.
 * @returns {Promise.<Object.<string,ProcessState>>}
 */
PM2Tracker.prototype.getProcessMap = function getProcessMap() {
	return pm2.listAsync().then(function(processList) {
		return PM2Tracker.generateProcessMap(processList);
	});
};

/**
 * Get an up-to-date state of the PM2 manager daemon (PM2 process itself).
 * Note that the process' name will always be "PM2" and the restart count is set to zero.
 * The PID to query is taken from the PM2 pidfile, located in ~/$PM2_HOME (typically, ".pm2").
 * Thus, if the user is running a non-default PM2 instance they wish to monitor, it is necessary
 *  to override the PM2_HOME environment variable for both pm2 and this class.
 * @returns {Promise.<ProcessState>}
 */
PM2Tracker.prototype.getPM2State = function getPM2State() {
	// First, figure out out where to look for the PM2 pid file.
	var PM2_HOME = process.env.HOME + '/' + (process.env.PM2_HOME || '.pm2');
	var PM2PID;
	// Then, read the pid.
	return fs.readFile(PM2_HOME + '/pm2.pid', 'utf-8').then(function(pidfileContent) {
		PM2PID = Number(pidfileContent.trim());
		// We have got the PID, so now, we need to look at the process.
		return pidusage.stat(PM2PID).catch(function(error) {
			// The process may very well not exist, in which case, we are going to get a "null" or an error, which we need to turn into a synthetic "offline" status.
			if (error && error.code === 'ENOENT') {
				return null;
			}
			throw error;
		});
	}).then(function(usageInfo) {
		// If the process exists, we can report it as online and produce its usage stats.
		if (usageInfo) {
			return new ProcessState({
				name: 'PM2',
				status: 'online',
				resources: usageInfo,
				restarts: 0,
				pid: PM2PID
			});
		}
		else {
			// Otherwise, it must be offline, and, as such, it consumes zero of everything.
			return new ProcessState({
				name: 'PM2',
				status: 'offline',
				resources: { cpu: 0, memory: 0 },
				restarts: 0,
				// Since the PID is not current anyway, we send a zero to signal that fact.
				pid: 0
			});
		}
	});
};

module.exports = PM2Tracker;
