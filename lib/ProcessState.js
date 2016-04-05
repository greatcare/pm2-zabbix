/**
 * ProcessState is a container type that holds run-time information about a process.
 * @constructor
 * @param {Object} processObject - The source data to populate the container with.
 * @param {string} processObject.name - The process name.
 * @param {string} processObject.status - The text description of the process status. Typically, one of [ 'online', 'stopping', 'stopped', 'offline' ].
 * @param {Object} processObject.resources - The momentary resource usage numbers of the process.
 * @param {number} processObject.resources.cpu - CPU usage in percent.
 * @param {number} processObject.resources.memory - Allocated memory (RSS) in bytes.
 * @param {number} processObject.restarts - The number of restarts since first starting the process. Note that some operations, such as a manual stop-start cycle, may not count as restarts under PM2.
 * @param {number} processObject.pid - The PID of the process. For now, this is only populated for the PM2 master process, not for Node processes managed by it.
 */
function ProcessState(processObject) {
	this.name = processObject.name;
	this.status = processObject.status;
	this.resources = processObject.resources;
	this.restarts = processObject.restarts;
	this.pid = processObject.pid;
}

/**
 * Check whether a process state is roughly equivalent to another.
 * This compares the status to determine if the process's condition is qualitatively the same.
 * @param {anotherState} - Another state object to compare this state to.
 * @returns {Boolean}
 */
ProcessState.prototype.equals = function equals(anotherState) {
	return anotherState && anotherState.status === this.status;
};

module.exports = ProcessState;
