/**
 * The PM2 Zabbix Monitor is a class which provides constant overwatch of a PM2 instance.
 * It does this by sending periodic updates to Zabbix via the passed data provider object,
 *  and also issuing intermediate status updates as soon as possible when a process's status changes.
 * The monitor is meant to be constructed, started and left running,
 * @constructor
 * @param {PM2Tracker} tracker - A tracker instance to use. It should not be started when passing it. Used for obtaining the process list and listening to status changes.
 * @param {ZabbixDataProvider} dataProvider - The interface to Zabbix. Used for sending data items. It is also populated with discovery data (the process list) initially (at start time), even if monitor mode is off.
 * @param {Object} [options] - Settings for configuring the run-time behaviour of the monitor.
 * @param {boolean} [options.monitor=false] - Whether updates should be listened to and sent periodically. By default, only the initial state is loaded and the discovery data is populated (i.e. no data gets actually sent to Zabbix). The "non-monitor" mode may be used for building one-time discovery scripts.
 * @param {boolean} [options.debug] - Whether log messages should be printed to the console.
 * @param {number} [options.processListInterval=15000] - The interval (ms) between sending entire process lists to Zabbix. This does not impact process status change updates, which are sent immediately. Meaningless if "monitor" is not enabled.
 * @param {number} [options.processManagerInterval=15000] - The interval (ms) between sending the PM2 supervisor process status to Zabbix. Does nothing when monitor is off.
 */
function PM2ZabbixMonitor(tracker, dataProvider, options) {
	this._tracker = tracker;
	this._dataProvider = dataProvider;
	this._options = options || {};
	// Apply some sane defaults:
	this._options.processListInterval = this._options.processListInterval || 15000;
	this._options.processManagerInterval = this._options.processManagerInterval || 15000;
	
	// If monitor mode is on, register a process state change handler:
	if (this._options.monitor) {
		this._initListeners();
	}
	
}

/**
 * Log an occurence. This currently uses console.log().
 * @param {string} message - The message to log. May contain placeholders for console.log, such as %s.
 * @param {...*} values - Additional values to log. These are appended at the end, unless placeholders are present.
 */
PM2ZabbixMonitor.prototype._log = function _log() {
	// Guard clause: if debugging is disabled, do not actually "log" anything.
	if (!this._options.debug) {
		return;
	}
	
	console.log.apply(console, arguments);
};

/**
 * Initialize the process state change listeners. This enables sending "status" data items to Zabbix
 *  whenever the tracker reports that a process's state has changed.
 */
PM2ZabbixMonitor.prototype._initListeners = function _initListeners() {
	var self = this;
	
	// Notify Zabbix of every state change immediately.
	self._tracker.on('processStateChanged', function(changeEvent) {
		// Construct a key name appropriate for this data item.
		var statusKey = self.getDataKey(changeEvent.processID, changeEvent.newState, 'status');
		var statusObject = {};
		statusObject[statusKey] = changeEvent.newState.status;
		self._dataProvider.send(statusObject).done(function() {
			self._log('[ OK ] Real-time status update sent for process %s...', changeEvent.processID);
		}, function(error) {
			self._log('[ ERR ] Real-time update sending failed for process %s:', changeEvent.processID, error);
		});
	});
};

/**
 * Get the string key for information on a PM2-managed process that data should be sent to Zabbix under.
 * This corresponds to the "item name" ("observable"?) on the Zabbix side.
 * @param {string} processID - Synthetic ID of the process. Something like "Application-0".
 * @param {ProcessState} processState - A description of the process's state.
 * @param {string} dataItem - Which aspect of information about the process's state should be provided. Separate keys are supposed to exist server-side for the CPU usage, memory, status, etc.
 * @returns {string} The item key to send the data to Zabbix with.
 */
PM2ZabbixMonitor.prototype.getDataKey = function getDataKey(processID, processState, dataItem) {
	return 'pm2.processes[' + processID + ',' + dataItem + ']';
};

/**
 * Get the string key for information on the PM2 daemon process itself that data should be sent to Zabbix as.
 * @param {string} dataItem - The aspect of the daemon process that is concerned, e.g. "memory", "status", "pid".
 * @returns {string} The item key.
 */
PM2ZabbixMonitor.prototype.getManagerKey = function getManagerKey(dataItem) {
	return 'pm2.' + dataItem;
};

/**
 * Start the monitor. This starts the tracker, populates the discovery table of the Zabbix data provider,
 *  and optionally sets up periodic sending of process list and PM2 status to Zabbix, if monitor mode
 *  is enabled via the options constructor parameter.
 * @returns {Promise} A promise which fulfills when the monitor has started.
 */
PM2ZabbixMonitor.prototype.start = function start() {
	var self = this;
	
	return self._tracker.start().then(function() {
		// Load the process list and add them as discovery items.
		var processMap = self._tracker.getCachedProcessMap();
		Object.keys(processMap).forEach(function registerProcessForDiscovery(processID) {
			self._dataProvider.addDiscoveryItem({
				'{#PROCESS_ID}': processID,
				'{#PROCESS_NAME}': processMap[processID].name
			});
		});
	}).then(function() {
		if (self._options.monitor) {
			setInterval(function() {
				self.sendProcessList().done(function() {
					self._log('[ OK ] Periodic sending of process list succeeded');
				}, function(error) {
					self._log('[ ERR ] Periodic sending of process list error:', error);
				});
			}, self._options.processListInterval);
			setInterval(function() {
				self.sendPM2Status().done(function() {
					self._log('[ OK ] Periodic sending of PM2 status succeeded');
				}, function(error) {
					self._log('[ ERR ] Periodic sending of PM2 status failed:', error);
				});
			}, self._options.processManagerInterval);
		}
	});
};

/**
 * Send the complete process list of PM2-managed Node processes to Zabbix.
 * This is also done automatically if the "monitor" option has been set to true.
 * @returns {Promise} A Promise which fulfills if sending the entire process list has succeeded, or rejects if at least one data item has not reached Zabbix or was rejected by it.
 */
PM2ZabbixMonitor.prototype.sendProcessList = function sendProcessList() {
	var self = this;
	
	return self._tracker.getProcessMap().then(function(processMap) {
		var dataObject = {};
		Object.keys(processMap).forEach(function(processID) {
			var processState = processMap[processID];
			dataObject[self.getDataKey(processID, processState, 'status')] = processState.status;
			dataObject[self.getDataKey(processID, processState, 'cpu')] = processState.resources.cpu;
			dataObject[self.getDataKey(processID, processState, 'memory')] = processState.resources.memory;
			dataObject[self.getDataKey(processID, processState, 'restarts')] = processState.restarts;
		});
		
		return self._dataProvider.send(dataObject);
	});
};

/**
 * Send the status of the PM2 daemon to Zabbix. This provides the process status, CPU, memory usage and the current PM2 God Daemon's process PID (if alive).
 * This is also done automatically at an interval in monitor mode.
 * @returns {Promise} A Promise which fulfills when all data about the PM2 daemon has been accepted and processed by Zabbix.
 */
PM2ZabbixMonitor.prototype.sendPM2Status = function sendPM2Status() {
	var self = this;
	
	return self._tracker.getPM2State().then(function(processState) {
		var dataObject = {};
		dataObject[self.getManagerKey('status')] = processState.status;
		dataObject[self.getManagerKey('cpu')] = processState.resources.cpu;
		dataObject[self.getManagerKey('memory')] = processState.resources.memory;
		dataObject[self.getManagerKey('pid')] = processState.pid;
		
		return self._dataProvider.send(dataObject);
	});
};

module.exports = PM2ZabbixMonitor;
