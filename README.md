# PM2 monitoring tool for Zabbix

## What it is
This is a Node.js-powered daemon and utility that monitors a [PM2](https://github.com/Unitech/pm2) instance and sends status updates to the Zabbix server monitoring solution.

### Features
* Automatically discovers processes managed by PM2
* Reports Node.js process status, CPU usage, memory usage and restart count
* Monitors the PM2 God Daemon itself for status, resource usage and PID changes
* Provides a Zabbix item template for easy installation

### Architecture

pm2-zabbix operates in two ways: as a script called by the Agent used for item discovery, and by a stand-alone executable that runs in the background and periodically sends updates for data items using zabbix_sender. If all relevant items already exist on the server and no automatic discovery (LLD) is required, integration with the Agent via UserParameters is optional.

## Installation

### Prerequisites

This module relies on having the `zabbix_sender` binary installed, and on `/etc/zabbix/zabbix_agentd.conf` being present on the system. Both typically come with a `zabbix-agent` package for your Linux distribution (some repositories may split this into two separate packages - `zabbix-agent` and `zabbix-sender`). It has been tested with Zabbix 3.0.

### Installing

Begin by installing the module (as root) on the server that you run PM2 on:
```
# npm install -g pm2-zabbix
```

This installs a `pm2-zabbix` executable in your **$PATH**. Alternatively, you can choose a directory to your liking and perform a local install there, or clone this repository - the relevant script is `monitor.js`.

### Testing discovery

To see if the tool can detect your running PM2 processes, switch to the user that runs PM2 and then:
```
$ pm2-zabbix --discover
```

This should print a JSON with a familiar-looking list of processes such as this one:

```json
{
        "data": [
                {
                        "{#PROCESS_ID}": "index-0",
                        "{#PROCESS_NAME}": "index"
                },
                {
                        "{#PROCESS_ID}": "index-1",
                        "{#PROCESS_NAME}": "index"
                }
        ]
}
```
(If the list is empty, inspect `pm2 l` and see if your processes are really there.)

The above is a JSON object compatible with the Zabbix LLD protocol. It tells us that two items (in our case, processes) have been discovered - two instances of the same index.js application launched with PM2. An appropriate template installed on the Zabbix server may use this information to automatically create items.

### Testing Zabbix connectivity

The asynchronous background monitoring protocol uses `zabbix_sender` to send data items to the server. By default, configuration parameters are taken from `/etc/zabbix/zabbix_agentd.conf`, including the server address and the authentication credentials. The monitoring mode can be started using:
```
$ pm2-zabbix --monitor
```
(add --debug for additional logging)

The above launches a process that connects to the current user's PM2 instance (or launches a new one if necessary) and starts sending updates in the background.


### Running the monitoring daemon

`pm2-zabbix` is just a Node.js script, which could be launched from pm2. However, this setup is not recommended, since the monitoring tool also monitors the status of the pm2 God Daemon itself. Instead, it is best to install a proper start-up script, specific for your distro's init system, and launch the daemon in parallel to pm2.

An example sysvinit script and a systemd unit file are provided in the `install/init/` directory of this repository. These most likely need to be customized for your local install - in particular, the user name will have to be changed to match the system user that you run pm2 as.

### Configuring the Zabbix Agent

For the monitoring server to know what processes exist on the PM2 host, it needs to perform [Low-Level Discovery](https://www.zabbix.com/documentation/3.0/manual/discovery/low_level_discovery). A special data item is appointed that the Zabbix Agent will query. On the target host, the item must be defined as a `UserParameter`. An example configuration file that accomplishes this is provided in the `install/zabbix-agent/` directory - install it as `/etc/zabbix/zabbix_agentd.d/pm2-zabbix.conf`.

### Configuring the Zabbix Server

A template needs to be installed (and assigned to a host) that tells Zabbix of the possible items to monitor, and establishes a default set of triggers and discovery rules for dynamically finding processes.

The default template file can be found in `install/zabbix-server/` - upload it via the Zabbix management  web UI and assign it to the hosts that you intend to be monitoring PM2 on. Appropriate keys will be created automatically.

## Troubleshooting

If you run into any trouble, be sure to check the [Troubleshooting guide](Troubleshooting.md) as well the issue tracker.

## License
MIT - see the `LICENSE` file.
