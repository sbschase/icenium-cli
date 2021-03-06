///<reference path="../.d.ts"/>
"use strict";

import util = require("util");
import PluginsDataLib = require("./../plugins-data");

export class MarketplacePluginsService implements ICordovaPluginsService {

	constructor(private $server: Server.IServer,
		private $project: Project.IProject,
		private $projectConstants: Project.IProjectConstants) { }

	public getAvailablePlugins(): IFuture<any> {
		return this.$server.cordova.getMarketplacePluginsData(this.$project.projectData.Framework);
	}

	public createPluginData(plugin: Server.MarketplacePluginVersionsData): IMarketplacePlugin[] { // DefaultVersion, Identifier, Versions
		return _.map(plugin.Versions, (pluginVersionData) => new PluginsDataLib.MarketplacePluginData(plugin, pluginVersionData, this.$project, this.$projectConstants));
	}
}
$injector.register("marketplacePluginsService", MarketplacePluginsService);