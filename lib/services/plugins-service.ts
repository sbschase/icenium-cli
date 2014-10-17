///<reference path="../.d.ts"/>
"use strict";

import os = require("os");
import util = require("util");
import options = require("./../options");

export class PluginsService implements IPluginsService {
	private static MESSAGES = ["Core Plugins", "Advanced Plugins", "Marketplace Plugins"];

	constructor(private $cordovaPluginsService: ICordovaPluginsService,
		private $marketplacePluginsService: ICordovaPluginsService,
		private $errors: IErrors,
		private $logger: ILogger,
		private $project: Project.IProject) {
		this.$project.ensureProject();
	}

	public getInstalledPlugins(): IFuture<IPlugin[]> {
		return (() => {
			return _.union(this.$cordovaPluginsService.getInstalledPlugins().wait(), this.$marketplacePluginsService.getInstalledPlugins().wait());
		}).future<IPlugin[]>()();
	}

	public getAvailablePlugins(): IFuture<IPlugin[]> {
		return (() => {
			return _.union(this.$cordovaPluginsService.getAvailablePlugins().wait(), this.$marketplacePluginsService.getAvailablePlugins().wait());
		}).future<IPlugin[]>()();
	}

	public addPlugin(pluginName: string): IFuture<void> {
		return (() => {
			if(!pluginName) {
				this.$errors.fail("No plugin name specified");
			}

			if(this.isPluginInstalled(pluginName).wait()) {
				this.$errors.fail("Plugin %s already exists", pluginName);
			}

			var plugin = this.getPluginByName(pluginName).wait();
			this.$project.projectData.CorePlugins.push(plugin.toProjectDataRecord());
			this.$project.saveProject().wait();
			this.$logger.out("Plugin %s was successfully added", pluginName);
		}).future<void>()();
	}

	public removePlugin(pluginName: string): IFuture<void> {
		return (() => {
			if(!pluginName) {
				this.$errors.fail("No plugin name specified.");
			}

			if(!this.isPluginInstalled(pluginName).wait()) {
			 	this.$errors.fail("Could not find plugin with name %s.", pluginName);
			}

			var plugin = this.getPluginByName(pluginName).wait();
			this.$project.projectData.CorePlugins = _.without(this.$project.projectData.CorePlugins, plugin.toProjectDataRecord());
			this.$project.saveProject().wait();
			this.$logger.out("Plugin %s was successfully removed", pluginName);
		}).future<void>()();
	}

	public printPlugins(plugins: IPlugin[]): void {
		var groups = _.groupBy(plugins, (plugin: IPlugin) => plugin.type);
		var outputLines:string[] = [];

		_.each(Object.keys(groups), (group: string) => {
			outputLines.push(util.format("%s:%s======================", PluginsService.MESSAGES[group], os.EOL));

			var sortedPlugins = _.sortBy(groups[group], (plugin: IPlugin) => plugin.name);
			_.each(sortedPlugins, (plugin: IPlugin) => {
				outputLines.push(plugin.pluginInformation.join(os.EOL));
			});
		});

		this.$logger.out(outputLines.join(os.EOL + os.EOL));
	}

	private getPluginByName(pluginName: string): IFuture<IPlugin> {
		return (() => {
			var plugins = this.getAvailablePlugins().wait();
			var toLowerCasePluginName = pluginName.toLowerCase();
			if(!_.any(plugins, (plugin: IPlugin) => plugin.name.toLowerCase() === toLowerCasePluginName)) {
				this.$errors.fail("Invalid plugin name: %s", pluginName);
			}

			return _.find(plugins, (plugin) => plugin.name.toLowerCase() === toLowerCasePluginName);
		}).future<IPlugin>()();
	}

	private isPluginInstalled(pluginName: string): IFuture<boolean> {
		return (() => {
			pluginName = pluginName.toLowerCase();
			return _.any(this.getInstalledPlugins().wait(), (plugin) => plugin.name.toLowerCase() === pluginName);
		}).future<boolean>()();
	}
}
$injector.register("pluginsService", PluginsService);