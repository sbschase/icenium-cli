///<reference path="../.d.ts"/>

"use strict";
import util = require("util");
import path = require("path");
import helpers = require("../helpers");
import unzip = require("unzip");
let options:any = require("../common/options");

export class RemoteProjectService implements IRemoteProjectService {
	private clientSolutions: Server.TapSolutionData[];

	constructor(private $server: Server.IServer,
				private $userDataStore: IUserDataStore,
				private $serviceProxy: Server.IServiceProxy,
				private $errors: IErrors) { }

	public  makeTapServiceCall<T>(call: () => IFuture<T>): IFuture<T> {
		return (() => {
			let user = this.$userDataStore.getUser().wait();
			let tenantId = user.tenant.id;
			this.$serviceProxy.setSolutionSpaceName(tenantId);
			try {
				return call().wait();
			} finally {
				this.$serviceProxy.setSolutionSpaceName(null);
			}
		}).future<T>()();
	}

	public getProjectName(projectId: string): IFuture<string> {
		return ((): string => {
			let clientSolutions = this.getProjects().wait();

			let result = helpers.findByNameOrIndex(projectId, clientSolutions, (clientSolution: Server.TapSolutionData) => clientSolution.name);
			if(!result) {
				this.$errors.fail("Could not find project named '%s' or was not given a valid index. List available projects with 'cloud list' command", projectId);
			}

			return result.name;
		}).future<string>()();
	}

	public getProjects(): IFuture<Server.TapSolutionData[]> {
		return (() => {
			if (!this.clientSolutions) {
				let existingClientSolutions = this.makeTapServiceCall(() => this.$server.tap.getExistingClientSolutions()).wait();
				this.clientSolutions = _.sortBy(existingClientSolutions, (clientSolution: Server.TapSolutionData) => clientSolution.name);
			}

			return this.clientSolutions;
		}).future<Server.TapSolutionData[]>()();
	}

	public getProjectProperties(projectName: string): IFuture<any> {
		return (() => {
			let solutionData = this.getSolutionData(projectName).wait();
			let properties = (<any>solutionData.Items[0])["Properties"];
			properties.ProjectName = projectName;
			return properties;
		}).future()();
	}

	private getSolutionData(projectName: string): IFuture<Server.SolutionData> {
		return this.makeTapServiceCall(() => this.$server.projects.getSolution(projectName, true));
	}
}
$injector.register("remoteProjectService", RemoteProjectService);