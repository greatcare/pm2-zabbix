#!/usr/bin/env node

var PM2Tracker = require('./lib/PM2Tracker');
var ZabbixDataProvider = require('./lib/ZabbixDataProvider');
var PM2ZabbixMonitor = require('./lib/PM2ZabbixMonitor');

var ZabbixSender = require('zabbix-sender');
var minimist = require('minimist');
var os = require('os');
var bunyan = require('bunyan');

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

// If we're going to output JSON, we don't want to mix it with log output.
// This means we need to push the logs elsewhere.
var usesOutputMode = (argv.discover);
var logger = bunyan.createLogger({
	name: 'pm2-zabbix',
	level: process.env.LOG_LEVEL || 'warn',
	// Use stderr if writing JSON to stdout - otherwise, normal stdout is fine.
	stream: usesOutputMode ? process.stderr : process.stdout
});

var sender = new ZabbixSender({
	hostname: argv.hostname || hostname,
	server: argv.server || undefined,
	logger: logger
});
var tracker = new PM2Tracker();
var provider = new ZabbixDataProvider(sender);
var monitor = new PM2ZabbixMonitor(tracker, provider, {
	monitor: argv.monitor,
	debug: argv.debug,
	logger: logger
});

monitor.start().done(function() {
	if (argv.discover) {
		var discoveryData = provider.getDiscoveryData();
		process.stdout.write(JSON.stringify(discoveryData, null, '\t'));
		process.exit(0);
		return;
	}
});
