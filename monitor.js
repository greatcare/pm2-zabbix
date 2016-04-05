#!/usr/bin/env node

var PM2Tracker = require('./lib/PM2Tracker');
var ZabbixDataProvider = require('./lib/ZabbixDataProvider');
var PM2ZabbixMonitor = require('./lib/PM2ZabbixMonitor');

var ZabbixSender = require('zabbix-sender');
var minimist = require('minimist');
var os = require('os');

var argv = minimist(process.argv.slice(2));
var hostname = os.hostname();

if (argv.help || argv.usage) {
	console.log('# PM2 monitoring tool for Zabbix');
	console.log('');
	console.log('Usage: node monitor.js [options]');
	console.log('Options:');
	console.log('\t--monitor - enable sending of updates to Zabbix via zabbix_sender');
	console.log('\t--discover - instead of running constantly, print JSON in Zabbix discovery format and exit');
	console.log('\t  (This is typically used as the command part for the pm2.processes UserParameter.)');
	console.log('\t--hostname=<hostname> - Use <hostname> instead of the system\'s hostname');
	console.log('\t--server=<server> - Connect to Zabbix at <server> instead of the default 127.0.0.1');
	console.log('\t--debug - Enable printing of console messages at runtime');
	process.exit(0);
}

var sender = new ZabbixSender({
	hostname: argv.hostname || hostname,
	server: argv.server || undefined
});
var tracker = new PM2Tracker();
var provider = new ZabbixDataProvider(sender);
var monitor = new PM2ZabbixMonitor(tracker, provider, {
	monitor: argv.monitor,
	debug: argv.debug
});

monitor.start().done(function() {
	if (argv.discover) {
		var discoveryData = provider.getDiscoveryData();
		process.stdout.write(JSON.stringify(discoveryData, null, '\t'));
		process.exit(0);
		return;
	}
	
	console.log('* Client running (monitor mode: %s)', argv.monitor ? 'on' : 'off');
});
