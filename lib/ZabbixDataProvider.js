var nodefn = require('when/node');

/**
 * A ZabbixDataProvider is a class that encapsulates a ZabbixSender and a list of discoverable items.
 * It can be asked to send some keys' values to the server and queried for discovery data, which it returns in a Zabbix-compatible, JSON-stringifiable object.
 * @constructor
 * @param {external:ZabbixSender} sender - A zabbix-sender object, as obtained from the constructor exported by the zabbix-sender node module.
 * @param {Object[]} [discoveryItems=[]] - An initial list of objects which have macro-named keys, such as "#PROCID" or "#PROCNAME". These can be added later, too.
 */
function ZabbixDataProvider(sender, discoveryItems) {
	this._sender = sender;
	this._discoveryItems = (discoveryItems || []).slice();
}

/**
 * Send values for some keys to Zabbix via the underlying transport.
 * @param {Object.<string,*>} values - A map of values to send. The key corresponds directly to the Zabbix key name, and the value is the plain value to send to the monitoring system.
 * @returns {Promise} A promise which fulfills when the data has been sent.
 */
ZabbixDataProvider.prototype.send = function send(values) {
	return nodefn.call(this._sender.send.bind(this._sender), values);
};

/**
 * Get the current set of discoverable items registered with this data provider.
 * @returns {Object} An object in a Zabbix-compatible shape, with items under the "data" property.
 */
ZabbixDataProvider.prototype.getDiscoveryData = function getDiscoveryData() {
	return {
		data: this._discoveryItems
	};
};

/**
 * Add a discoverable item to the list.
 * @param {Object} item - The item to add. Should be a flat item, composed of keys that look like "{#MACRO_NAME}".
 */
ZabbixDataProvider.prototype.addDiscoveryItem = function addDiscoveryItem(item) {
	this._discoveryItems.push(item);
};

/**
 * Remove a discoverable item from the list. Comparison is made using a key-by-key flat strict equality check (all keys must === the other object's keys).
 * Equality is only checked one way - a removal specification { a: 1, b: 2 } will match list element { a: 1, b: 2, c: 3 }, but not { a: 1, d: 4 }.
 * @param {Object} removalSpecification - A key-value map to compare items against. All items whose properties match all keys' values will be removed.
 * @example provider.removeDiscoveryItems({ '{#PROCESS_ID}': 'Application-0' });
 */
ZabbixDataProvider.prototype.removeDiscoveryItems = function removeDiscoveryItems(removalSpecification) {
	this._discoveryItems = this._discoveryItems.filter(function removeMatching(discoveryItem) {
		return !Object.keys(removalSpecification).every(function(removalKey) {
			return removalSpecification[removalKey] === discoveryItem[removalKey];
		});
	});
};

module.exports = ZabbixDataProvider;
