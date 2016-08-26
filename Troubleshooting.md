# Troubleshooting

Several users have encountered issues while trying to run `pm2-zabbix`. Problems spotted in the wild and their resolutions are presented below:

## zabbix_sender exit code 2
This is a general error code saying that the zabbix sender binary (shipped with Zabbix Agent and external to this project) could not save some data items on the server, because the server actively refused to process them. This usually indicates a configuration error. Check:
* Has the discovery process completed successfully? Are your processes listed in the Zabbix Web UI for the host that you're sending from?
* Does the hostname configured on the server match the hostname that the client is presenting itself as? In particular, compare the output of `hostname` with the Zabbix Server's notion of your monitored machine's hostname (if using the default `HostnameItem` setting).
* If the above does not explain the failure: can you send any data item manually, using zabbix_sender from the CLI?
