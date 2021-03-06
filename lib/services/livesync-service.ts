///<reference path="../.d.ts"/>
"use strict";

import util = require("util");
import path = require("path");
let options: any = require("../common/options");
let gaze = require("gaze");
import helpers = require("./../helpers");
import AppIdentifier = require("../common/mobile/app-identifier");
import constants = require("../common/mobile/constants");

interface IProjectFileInfo {
	fileName: string;
	onDeviceName: string;
	shouldIncludeFile: boolean;
}

export class LiveSyncService implements ILiveSyncService {
	private excludedProjectDirsAndFiles = [
		"app_resources",
		"plugins",
		".*.tmp"
	];

	constructor(private $devicesServices: Mobile.IDevicesServices,
		private $logger: ILogger,
		private $fs: IFileSystem,
		private $errors: IErrors,
		private $project: Project.IProject,
		private $projectFilesManager: Project.IProjectFilesManager,
		private $dispatcher: IFutureDispatcher,
		private $mobileHelper: Mobile.IMobileHelper) { }

	public livesync(platform: string): IFuture<void> {
		return (() => {
			this.$project.ensureProject();
			this.$devicesServices.initialize({ platform: platform, deviceId: options.device }).wait();
			platform = this.$devicesServices.platform;

			if(!this.$mobileHelper.getPlatformCapabilities(platform).companion && options.companion) {
				this.$errors.fail("The AppBuilder Companion app is not available on %s devices.", platform);
			}

			if(!this.$devicesServices.hasDevices) {
				this.$errors.fail({ formatStr: constants.ERROR_NO_DEVICES, suppressCommandHelp: true });
			}

			if(!this.$project.capabilities.livesync && !options.companion) {
				this.$errors.fail("Use $ appbuilder livesync cloud to sync your application to Telerik Nativescript Companion App. You will be able to LiveSync %s based applications in a future release of the Telerik AppBuilder CLI.", this.$project.projectData.Framework);
			}

			if(!this.$project.capabilities.livesyncCompanion && options.companion) {
				this.$errors.fail("You will be able to LiveSync %s based applications to the Companion app in a future release of the Telerik AppBuilder CLI.", this.$project.projectData.Framework);
			}

			let projectDir = this.$project.getProjectDir().wait();

			let appIdentifier = AppIdentifier.createAppIdentifier(platform,
				this.$project.projectData.AppIdentifier, options.companion);

			if(options.file) {
				this.$fs.tryExecuteFileOperation(options.file, () => this.sync(appIdentifier, projectDir, [path.resolve(options.file)]),  util.format("The file %s does not exist.", options.file));
			} else {
				let projectFiles = this.$project.enumerateProjectFiles(this.excludedProjectDirsAndFiles).wait();

				this.sync(appIdentifier, projectDir, projectFiles).wait();

				if(options.watch) {
					this.liveSyncDevices(platform, projectDir, appIdentifier);
					helpers.exitOnStdinEnd();
					this.$dispatcher.run();
				}
			}
		}).future<void>()();
	}

	private getProjectFileInfo(fileName: string): IProjectFileInfo {
		let platforms = this.$mobileHelper.platformNames;
		let parsed = this.parseFile(fileName, platforms, this.$devicesServices.platform);
		if(!parsed) {
			parsed = this.parseFile(fileName, ["debug", "release"], "debug");
		}

		return parsed || {
			fileName: fileName,
			onDeviceName: fileName,
			shouldIncludeFile: true
		};
	}

	private parseFile(fileName: string, validValues: string[], value: string): any {
		let regex = util.format("^(.+?)[.](%s)([.].+?)$", validValues.join("|"));
		let parsed = fileName.match(new RegExp(regex, "i"));
		if(parsed) {
			return {
				fileName: fileName,
				onDeviceName: parsed[1] + parsed[3],
				shouldIncludeFile: parsed[2].toLowerCase() === value.toLowerCase()
			};
		}

		return undefined;
	}

	private sync(appIdentifier: Mobile.IAppIdentifier, projectDir: string, projectFiles: string[]): IFuture<void> {
		let projectFilesInfo: IProjectFileInfo[] = [];

		_.each(projectFiles,(projectFile: string) => {
			let projectFileInfo = this.getProjectFileInfo(projectFile);
			if(projectFileInfo.shouldIncludeFile) {
				projectFilesInfo.push(projectFileInfo);
			}
		});

		return this.syncCore(appIdentifier, projectDir, projectFilesInfo);
	}

	private syncCore(appIdentifier: Mobile.IAppIdentifier, projectDir: string, projectFiles: IProjectFileInfo[]): IFuture<void> {
		return (() => {
			let action = (device: Mobile.IDevice): IFuture<void> => {
				return (() => {
					let platformSpecificProjectPath = appIdentifier.deviceProjectPath;
					let localDevicePaths = this.getLocalToDevicePaths(projectDir, projectFiles, platformSpecificProjectPath);
					device.sync(localDevicePaths, appIdentifier, this.$project.getLiveSyncUrl()).wait();
				}).future<void>()();
			};

			this.$devicesServices.execute(action).wait();
		}).future<void>()();
	}

	private getLocalToDevicePaths(localProjectPath: string, projectFiles: IProjectFileInfo[], deviceProjectPath: string): Mobile.ILocalToDevicePathData[] {
		let localToDevicePaths = _.map(projectFiles,(projectFileInfo: IProjectFileInfo) => {
			let relativeToProjectBasePath = helpers.getRelativeToRootPath(localProjectPath, projectFileInfo.onDeviceName);
			let devicePath = path.join(deviceProjectPath, relativeToProjectBasePath);
			return this.$mobileHelper.generateLocalToDevicePathData(projectFileInfo.fileName, helpers.fromWindowsRelativePathToUnix(devicePath), relativeToProjectBasePath);
		});

		return localToDevicePaths;
	}

	private liveSyncDevices(platform: string, projectDir: string, appIdentifier: Mobile.IAppIdentifier): void {
		let _this = this;

		gaze(projectDir + "/**/*", function(err: any, watcher: any) {
			this.on('changed',(filePath: string) => {
				if(!_this.$projectFilesManager.isProjectFileExcluded(projectDir, filePath, _this.excludedProjectDirsAndFiles)) {
					_this.batchLiveSync(filePath, projectDir, appIdentifier);
				}
			});
		});
	}

	private timer: NodeJS.Timer = null;
	private syncQueue: string[] = [];
	private batchLiveSync(filePath: string, projectDir: string, appIdentifier: Mobile.IAppIdentifier): void {
		if(!this.timer) {
			this.timer = setInterval(() => {
				let filesToSync = this.syncQueue;
				if(filesToSync.length > 0) {
					this.syncQueue = [];
					this.$logger.trace("Syncing %s", filesToSync.join(", "));
					this.$dispatcher.dispatch(() => this.sync(appIdentifier, projectDir, filesToSync));
				}
			}, 500);
		}
		this.syncQueue.push(filePath);
	}
}
$injector.register("liveSyncService", LiveSyncService);