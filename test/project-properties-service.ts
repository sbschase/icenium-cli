///<reference path=".d.ts"/>
"use strict";

import Future = require("fibers/future");
import chai = require("chai");
import fs = require("fs");
import path = require("path");
import stubs = require("./stubs");
import yok = require("../lib/common/yok");
import cordovaMigrationService = require("../lib/services/cordova-migration-service");
let assert: chai.Assert = chai.assert;

let projectPropertiesServiceFile = require("../lib/services/project-properties-service");
let resourceLoaderFile = require("../lib/resource-loader");
import projectConstantsLib = require("../lib/project/project-constants");

function createTestInjector(): IInjector {
	let testInjector = new yok.Yok();
	testInjector.register("injector", yok.Yok);
	testInjector.register("frameworkProjectResolver", stubs.FrameworkProjectResolver);
	testInjector.register("jsonSchemaValidator", stubs.JsonSchemaValidator);
	testInjector.register("projectConstants", projectConstantsLib.ProjectConstants);
	testInjector.register("fs", stubs.FileSystemStub);
	testInjector.register("resources", resourceLoaderFile.ResourceLoader);
	testInjector.register("errors", stubs.ErrorsStub);
	testInjector.register("logger", stubs.LoggerStub);
	testInjector.register("projectPropertiesService", projectPropertiesServiceFile.ProjectPropertiesService);

	return testInjector;
}

class SampleProject implements Project.IFrameworkProject {
	public completeProjectePropertiesResult = false;
	name: string;
	capabilities: IProjectCapabilities;
	defaultProjectTemplate: string;
	liveSyncUrl: string;
	requiredAndroidApiLevel: number;
	configFiles: Project.IConfigurationFile[];
	startPackageActivity: string;
	getTemplateFilename(name: string): string {
		return "";
	}
	getValidationSchemaId(): string {
		return "";
	}
	getProjectFileSchema(): IDictionary<any> {
		return null;
	}
	getProjectTargets(projectDir: string): IFuture<string[]> {
		return null;
	}
	projectTemplatesString(): IFuture<string> {
		return null;
	}
	alterPropertiesForNewProject(properties: any, projectName: string): void {}
	completeProjectProperties(properties: any): boolean {
		return this.completeProjectePropertiesResult;
	}
	adjustBuildProperties(buildProperties: any, projectInformation?: Project.IProjectInformation): any {
		return null;
	}
	ensureAllPlatformAssets(projectDir: string, frameworkVersion: string): IFuture<void> {
		return Future.fromResult();
	}
}

describe("projectPropertiesService", () => {
	describe("completeProjectProperties", () => {
		it("sets projectVersion to number 1 when it is not part of properties", () => {
			let properties: any = {};
			let testInjector = createTestInjector();
			let service: IProjectPropertiesService = testInjector.resolve("projectPropertiesService");
			service.completeProjectProperties(properties, new SampleProject());
			assert.strictEqual(properties["projectVersion"], 1, "projectVersion must be set to 1 when it is not part of the project properties.");
		});

		it("returns true when projectVersion is changed", () => {
			let properties: any = {};
			let testInjector = createTestInjector();
			let service: IProjectPropertiesService = testInjector.resolve("projectPropertiesService");
			let result = service.completeProjectProperties(properties, new SampleProject());
			assert.isTrue(result, "completeProjectProperties must return true, when it changes projectPropertiesService");
		});

		it("returns false when nothing is changed", () => {
			let properties: any = {
				"projectVersion": 1
			};
			let testInjector = createTestInjector();
			let service: IProjectPropertiesService = testInjector.resolve("projectPropertiesService");
			let result = service.completeProjectProperties(properties, new SampleProject());
			assert.isFalse(result, "completeProjectProperties must return false, when there's no changes");
		});

		it("returns true when frameworkProject completeProjectProperties returns true", () => {
			let properties: any = {
				"projectVersion": 1
			};
			let testInjector = createTestInjector();
			let service: IProjectPropertiesService = testInjector.resolve("projectPropertiesService");
			let sampleProject = new SampleProject();
			sampleProject.completeProjectePropertiesResult = true;
			let result = service.completeProjectProperties(properties, sampleProject);
			assert.isTrue(result, "completeProjectProperties must return true, when frameworkProject's completeProjectProperties returns true.");
		});
	});
});