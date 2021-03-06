///<reference path="../.d.ts"/>
"use strict";

import util = require("util");
import path = require("path");
import helpers = require("../helpers");
import unzip = require("unzip");
let options: any = require("../common/options");
import temp = require("temp");

class ProjectIdCommandParameter implements ICommandParameter {
	constructor(private $remoteProjectService: IRemoteProjectService) { }
	mandatory = true;

	validate(validationValue?: string): IFuture<boolean> {
		return (() => {
			if(validationValue) {
				let realProjectName = this.$remoteProjectService.getProjectName(validationValue.toString()).wait();
				if(realProjectName) {
					return true;
				}
			}

			return false;
		}).future<boolean>()();
	}
}

export class CloudListProjectsCommand implements ICommand {
	constructor(private $logger: ILogger,
		private $remoteProjectService: IRemoteProjectService) { }

	allowedParameters: ICommandParameter[] = [];

	private printProjects(projects: any) {
		this.$logger.out("Projects:");
		projects.forEach((project: any, index: number) => {
			this.$logger.out("%s: '%s'", (index + 1).toString(), project.name);
		});
	}

	execute(args: string[]): IFuture<void> {
		return (() => {
			let data = this.$remoteProjectService.getProjects().wait();
			this.printProjects(data);
		}).future<void>()();
	}
}
$injector.registerCommand("cloud|*list", CloudListProjectsCommand);

export class CloudExportProjectsCommand implements ICommand {
	constructor(private $errors: IErrors,
		private $fs: IFileSystem,
		private $logger: ILogger,
		private $project: Project.IProject,
		private $projectConstants: Project.IProjectConstants,
		private $remoteProjectService: IRemoteProjectService,
		private $server: Server.IServer) { }

	allowedParameters: ICommandParameter[] = [new ProjectIdCommandParameter(this.$remoteProjectService)];

	execute(args: string[]): IFuture<void> {
		return (() => {
			let name = this.$remoteProjectService.getProjectName(args[0]).wait();
			this.doExportRemoteProject(name).wait();
		}).future<void>()();
	}

	private doExportRemoteProject(remoteProjectName: string): IFuture<void> {
		return (() => {
			let projectDir = path.join(this.$project.getNewProjectDir(), remoteProjectName);
			if(this.$fs.exists(projectDir).wait()) {
				this.$errors.fail("The folder %s already exists!", projectDir);
			}
			if (this.$project.projectData) {
				this.$errors.failWithoutHelp("Cannot create project in this location because the specified directory is part of an existing project. Switch to or specify another location and try again.");
			}

			temp.track();
			let projectZipFilePath = temp.path({prefix: "appbuilder-cli-", suffix: '.zip'});
			let unzipStream = this.$fs.createWriteStream(projectZipFilePath);
			this.$remoteProjectService.makeTapServiceCall(() => this.$server.projects.getExportedSolution(remoteProjectName, false, unzipStream)).wait();
			this.$fs.unzip(projectZipFilePath, projectDir).wait();

			try {
				// if there is no .abproject when exporting, we must be dealing with a cordova project, otherwise everything is set server-side
				let projectFile = path.join(projectDir, this.$projectConstants.PROJECT_FILE);
				if(!this.$fs.exists(projectFile).wait()) {
					let properties = this.$remoteProjectService.getProjectProperties(remoteProjectName).wait();
					this.$project.createProjectFile(projectDir, properties).wait();
				}
			}
			catch(e) {
				this.$logger.warn("Couldn't create project file: %s", e.message);
			}

			this.$logger.info("%s has been successfully exported to %s", remoteProjectName, projectDir);
		}).future<void>()();
	}
}
$injector.registerCommand("cloud|export", CloudExportProjectsCommand);
