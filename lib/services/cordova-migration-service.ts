///<reference path="../.d.ts"/>
"use strict";

import Future = require("fibers/future");
import path = require("path");
import helpers = require("./../helpers");

class RenamedPlugin {
	constructor(public version: string,
		public oldName: string,
		public newName: string) {
	}
}

class MigrationData {
	constructor(public renamedPlugins: RenamedPlugin[],
		public supportedVersions: string[],
		public integratedPlugins: { [version: string]: string[] }) {
	}
}

export class FrameworkVersion implements Server.FrameworkVersion {
	constructor(public DisplayName: string,
		public Version: string) { }
}

export class CordovaMigrationService implements ICordovaMigrationService {
	private _migrationData: MigrationData;
	private minSupportedVersion: string = "3.0.0";
	private removedPluginsCache: string[] = [];
	private cordovaMigrationFile: string = path.join(__dirname, "../../resources/Cordova", "cordova-migration-data.json");

	constructor(private $fs: IFileSystem,
		private $server: Server.IServer,
		private $errors: IErrors,
		private $logger: ILogger,
		private $loginManager:ILoginManager,
		private $mobileHelper: Mobile.IMobileHelper,
		private $pluginsService: IPluginsService,
		private $project: Project.IProject,
		private $projectConstants: Project.IProjectConstants,
		private $projectPropertiesService: IProjectPropertiesService,
		private $prompter: IPrompter,
		private $resources: IResourceLoader) {
	}

	private get migrationData(): IFuture<MigrationData> {
		return (() => {
			if(!this._migrationData) {
				this._migrationData = this.$fs.readJson(this.cordovaMigrationFile).wait();
			}

			return this._migrationData;
		}).future<MigrationData>()();
	}

	public getDisplayNameForVersion(version: string): IFuture<string> {
		return ((): string => {
			let framework = _.find(this.getSupportedFrameworks().wait(), (fw: Server.FrameworkVersion) => fw.Version === version);
			if(framework) {
				return framework.DisplayName;
			}

			this.$errors.fail("Cannot find version %s in the supported versions.", version);
		}).future<string>()();
	}

	public getSupportedFrameworks(): IFuture<Server.FrameworkVersion[]> {
		return (() => {
			this.$loginManager.ensureLoggedIn().wait();

			let cliSupportedVersions: Server.FrameworkVersion[] = [];
			_.each(this.$server.cordova.getCordovaFrameworkVersions().wait(), (fw: Server.FrameworkVersion) => {
				let version = this.parseMscorlibVersion(fw.Version);
				if(helpers.versionCompare(version, this.minSupportedVersion) >= 0) {
					cliSupportedVersions.push(new FrameworkVersion(fw.DisplayName, version));
				}
			});

			return cliSupportedVersions;
		}).future<Server.FrameworkVersion[]>()();
	}

	public getSupportedVersions(): IFuture<string[]> {
		return (() => {
			return this.migrationData.wait().supportedVersions;
		}).future<string[]>()();
	}

	public pluginsForVersion(version: string): IFuture<string[]> {
		return (() => {
			return this.migrationData.wait().integratedPlugins[version] || [];
		}).future<string[]>()();
	}

	public migratePlugins(plugins: string[], fromVersion: string, toVersion: string): IFuture<string[]> {
		return (() => {
			let isUpgrade = helpers.versionCompare(fromVersion, toVersion) < 0;
			let smallerVersion = isUpgrade ? fromVersion : toVersion;
			let biggerVersion = isUpgrade ? toVersion : fromVersion;

			let renames = _.select(this.migrationData.wait().renamedPlugins, (renamedPlugin: RenamedPlugin) => {
				return helpers.versionCompare(smallerVersion, renamedPlugin.version) <= 0 && helpers.versionCompare(renamedPlugin.version, biggerVersion) <= 0
			}).sort((a, b) => helpers.versionCompare(a.version, b.version) * (isUpgrade ? 1 : -1));

			let transitions = _.map(renames, rename => isUpgrade ? { from: rename.oldName, to: rename.newName } : { from: rename.newName, to: rename.oldName });

			plugins = _.map(plugins, plugin => {
				_.each(transitions, transition => {
					if(transition.from == plugin) {
						plugin = transition.to;
					}
				});

				return plugin;
			});

			let supportedPlugins = this.pluginsForVersion(toVersion).wait();
			plugins = _.filter(plugins, plugin => {
				if (plugin.indexOf('@') > -1) {
					let pluginBasicInfo = this.$pluginsService.getPluginBasicInformation(plugin);
					if (this.$pluginsService.isPluginSupported(pluginBasicInfo.name, pluginBasicInfo.version, toVersion)) {
						return true;
					} else if (!_.find(this.removedPluginsCache, p => plugin)) {
						this.promptUserForInvalidPluginAction(plugin, toVersion);
					}
				}

				return _.contains(supportedPlugins, plugin) ? true : this.promptUserForInvalidPluginAction(plugin, toVersion).wait()
			});
			return plugins;
		}).future<string[]>()();
	}

	private promptUserForInvalidPluginAction(plugin: string, toVersion: string): IFuture<Boolean> {
		return (() => {
			if (_.contains(this.removedPluginsCache, plugin)) {
				return false;
			}

			let remove = `Remove ${plugin} from all configurations`;
			let cancel = 'Cancel Cordova migration';
			let choice = this.$prompter.promptForChoice(`Plugin ${plugin} is not supported for Cordova version ${toVersion} what do you want to do?`, [remove, cancel]).wait();
			if (choice === cancel) {
				this.$errors.failWithoutHelp("Cordova migration interrupted"); 
			} else {
				this.removedPluginsCache.push(plugin);
			}

			return false;
		}).future<Boolean>()();
	}

	public downloadCordovaMigrationData(): IFuture<void> {
		return (() => {
			let json = this.$server.cordova.getMigrationData().wait();
			let renamedPlugins = _.map(json.RenamedPlugins, (plugin: any) => new RenamedPlugin(
				this.parseMscorlibVersion(plugin.Version),
				plugin.OldName,
				plugin.NewName));

			let supportedVersions = _.map(json.SupportedVersions, plugin => this.parseMscorlibVersion(plugin));
			let cliSupportedVersions = _.select(supportedVersions, (version: string) => helpers.versionCompare(version, this.minSupportedVersion) >= 0);

			let integratedPlugins: { [version: string]: string[] } = {};
			_.each(cliSupportedVersions, version => {
				integratedPlugins[version] = json.IntegratedPlugins[version];
			});

			this._migrationData = new MigrationData(renamedPlugins, cliSupportedVersions, integratedPlugins)
			this.$fs.writeJson(this.cordovaMigrationFile, this._migrationData).wait();
		}).future<void>()();
	}

	public onWPSdkVersionChanging(newVersion: string): IFuture<void> {
		return ((): void => {
			if(newVersion === this.$project.projectData["WPSdk"]) {
				return;
			}

			let validWPSdks = this.getSupportedWPFrameworks().wait();
			if(!_.contains(validWPSdks, newVersion)) {
				this.$errors.failWithoutHelp("The selected version %s is not supported. Supported versions are %s", newVersion, validWPSdks.join(", "));
			}

			this.$logger.info("Migrating to WPSdk version %s", newVersion);
			if(helpers.versionCompare(newVersion, "8.0") > 0) {
				// at least Cordova 3.7 is required
				if(helpers.versionCompare(this.$project.projectData.FrameworkVersion, "3.7.0") < 0) {
					let cordovaVersions = this.getSupportedFrameworks().wait();

					// Find last framework which is not experimental.
					let selectedFramework = _.findLast(cordovaVersions, cv => cv.DisplayName.indexOf(this.$projectConstants.EXPERIMENTAL_TAG) === -1);
					if(helpers.versionCompare(selectedFramework.Version, "3.7.0") < 0) {
						// if latest stable framework version is below 3.7.0, find last 'Experimental'.
						selectedFramework = _.findLast(cordovaVersions, cv => cv.DisplayName.indexOf(this.$projectConstants.EXPERIMENTAL_TAG) !== -1 && helpers.versionCompare("3.7.0", cv.Version) <= 0);
					}

					let shouldUpdateFramework = this.$prompter.confirm(`You cannot build with the Windows Phone ${newVersion} SDK with the currently selected target version of Apache Cordova. Do you want to switch to ${selectedFramework.DisplayName}?`).wait()
					if(shouldUpdateFramework) {
						this.onFrameworkVersionChanging(selectedFramework.Version).wait();
						this.$project.projectData.FrameworkVersion = selectedFramework.Version;
					} else {
						this.$errors.failWithoutHelp("Unable to set Windows Phone %s as the target SDK. Migrate to Apache Cordova 3.7.0 or later and try again.", newVersion);
					}
				}
			}
		}).future<void>()();
	}

	public onFrameworkVersionChanging(newVersion: string): IFuture<void> {
		return ((): void => {
			if(newVersion === this.$project.projectData.FrameworkVersion) {
				return;
			}

			this.$project.ensureAllPlatformAssets().wait();

			if(this.$project.projectData.WPSdk && helpers.versionCompare(this.$project.projectData.WPSdk, "8.0") > 0 && helpers.versionCompare(newVersion, "3.7.0") < 0) {
				let shouldUpdateWPSdk = this.$prompter.confirm(`You cannot build with the Windows Phone ${this.$project.projectData.WPSdk} SDK with the currently selected target version of Apache Cordova. Do you want to switch to Windows Phone 8.0 SDK?`).wait();
				if(shouldUpdateWPSdk) {
					this.onWPSdkVersionChanging("8.0").wait();
					this.$project.projectData.WPSdk = "8.0";
				} else {
					this.$errors.failWithoutHelp("Unable to set %s as the target Apache Cordova version. Set the target Windows Phone SDK to 8.0 and try again.", newVersion);
				}
			}

			let versionDisplayName = this.getDisplayNameForVersion(newVersion).wait();
			this.$logger.info("Migrating to Cordova version %s", versionDisplayName);
			let oldVersion = this.$project.projectData.FrameworkVersion;

			_.each(this.$project.configurations, (configuration: string) => {
				let oldPluginsList = this.$project.getProperty("CorePlugins", configuration);
				let newPluginsList = this.migratePlugins(oldPluginsList, oldVersion, newVersion).wait();
				this.$logger.trace("Migrated core plugins to: ", helpers.formatListOfNames(newPluginsList, "and"));
				this.$project.setProperty("CorePlugins", newPluginsList, configuration);
			});

			let backedUpFiles: string[] = [],
				backupSuffix = ".backup";
			try {
				_.each(this.$mobileHelper.platformNames, (platform) => {
					this.$logger.trace("Replacing cordova.js file for %s platform ", platform);
					let cordovaJsFileName = path.join(this.$project.getProjectDir().wait(), `cordova.${platform}.js`.toLowerCase());
					let cordovaJsSourceFilePath = this.$resources.buildCordovaJsFilePath(newVersion, platform);
					this.$fs.copyFile(cordovaJsFileName, cordovaJsFileName + backupSuffix).wait();
					backedUpFiles.push(cordovaJsFileName);
					this.$fs.copyFile(cordovaJsSourceFilePath, cordovaJsFileName).wait();
				});
			} catch(error) {
				_.each(backedUpFiles, file => {
					this.$logger.trace("Reverting %s", file);
					this.$fs.copyFile(file + backupSuffix, file).wait();
				});
				this.$errors.failWithoutHelp(error.message);
			}
			finally {
				_.each(backedUpFiles, file => {
					this.$fs.deleteFile(file + backupSuffix).wait();
				});
			}

			this.$logger.info("Successfully migrated to version %s", versionDisplayName);
		}).future<void>()();
	}

	public getSupportedPlugins(): IFuture<string[]> {
		return (() => {
			let version: string;
			if(this.$project.projectData) {
				version = this.$project.projectData.FrameworkVersion;
			} else {
				let selectedFramework = _.last(_.select(this.getSupportedFrameworks().wait(), (sv: Server.FrameworkVersion) => sv.DisplayName.indexOf(this.$projectConstants.EXPERIMENTAL_TAG) === -1));
				version = selectedFramework.Version;
			}

			return this.pluginsForVersion(version).wait();
		}).future<string[]>()();
	}

	private getSupportedWPFrameworks(): IFuture<string[]>{
		return ((): string[]=> {
			let validValues: string[] = [];
			let projectSchema = this.$project.getProjectSchema().wait();
			if(projectSchema) {
				validValues = this.$projectPropertiesService.getValidValuesForProperty(projectSchema["WPSdk"]).wait();
			}

			return validValues;
		}).future<string[]>()();
	}

	private parseMscorlibVersion(json: any): string {
		return [json._Major, json._Minor, json._Build].join('.');
	}
}
$injector.register("cordovaMigrationService", CordovaMigrationService);

