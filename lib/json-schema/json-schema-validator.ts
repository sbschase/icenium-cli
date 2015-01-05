///<reference path="../.d.ts"/>
"use strict";

import util = require("util");
var jsv = require("JSV").JSV;

export class JsonSchemaValidator implements IJsonSchemaValidator {
	private static ENVIRONMENT_ID = "json-schema-draft-03";
	private static DEFAULT_SCHEMA_URI = "http://json-schema.org/draft-03/schema#";
	private static INSTANCE_IS_NOT_A_REQUIRED_TYPE_ERROR_MESSAGE = "Instance is not a required type";
	private static BASE_VALIDATION_SCHEMA_NAME = "Base";

	private environment: any = null;
	private _validationSchemasCache: IDictionary<any>;
	private _validPropertiesCache: IDictionary<any>;

	constructor(private $errors: IErrors,
		private $frameworkProjectResolver: Project.IFrameworkProjectResolver,
		private $jsonSchemaLoader: IJsonSchemaLoader, // Don't delete this row, we need it
		private $jsonSchemaResolver: IJsonSchemaResolver) {
		this.environment = jsv.createEnvironment(JsonSchemaValidator.ENVIRONMENT_ID);
		this.environment.setDefaultSchemaURI(JsonSchemaValidator.DEFAULT_SCHEMA_URI);

		this._validPropertiesCache = Object.create(null);
	}

	public getValidProperties(framework: string): IStringDictionary {
		var key = util.format("%s-%s", framework);
		if(!this._validPropertiesCache[key]) {
			this._validPropertiesCache[key] = Object.create(null);
			var schema = this.tryResolveValidationSchema(framework);
			var availableProperties = _.keys(schema);

			_.each(availableProperties, (propertyName: string) => {
				this._validPropertiesCache[key][propertyName.toLowerCase()] = propertyName;
			});
		}

		return this._validPropertiesCache[key];
	}

	public validate(data: IProjectData): void {
		var validationErrors = this.getValidationErrors(data);
		if(_.keys(validationErrors).length !== 0) {
			var output = _.values(validationErrors).join("\n");
			this.$errors.fail("Schema validation failed with following errors: \n %s", output);
		}
	}

	public isValid(data: IProjectData): boolean {
		var errors = this.getValidationErrors(data);
		return _.keys(errors).length !== 0;
	}

	public tryResolveValidationSchema(framework: string): IDictionary<any> {
		var schema = this.tryResolveValidationSchemaCore(framework);
		var result: IDictionary<any> = schema.properties;
		if(schema.extends) {
			_.each(_.keys(schema.extends.properties), (key: string) => result[key] = schema.extends.properties[key]);
		}

		return result;
	}

	private getValidationErrors(data: IProjectData): IStringDictionary {
		var validationSchema = this.tryResolveValidationSchemaCore(data.Framework);
		var schema = this.environment.createSchema(validationSchema);
		var validationResult = this.environment.validate(data, schema);
		var errors = validationResult.errors;
		var result: IStringDictionary = Object.create(null);

		_.each(errors, (error: any) => {
			var schemaUri = error.schemaUri;
			var schemaUriParts = schemaUri.split("/");
			var propertyName = schemaUriParts[schemaUriParts.length - 1];
			if(error.message === JsonSchemaValidator.INSTANCE_IS_NOT_A_REQUIRED_TYPE_ERROR_MESSAGE) { // ugly hack :(
				error.details = util.format("Expected %s but got %s", error.details, data[propertyName]);
			}
			result[propertyName] = util.format("Property %s: %s. %s", propertyName, error.message, error.details);
		});

		return result;
	}

	private tryResolveValidationSchemaCore(framework: string): ISchema {
		var validationSchemaName = this.getValidationSchemaName(framework);
		var schema = this.$jsonSchemaResolver.getSchema(validationSchemaName);

		if(!schema) {
			this.$errors.fail("Unable to resolve validation schema.");
		}

		return schema;
	}

	private getValidationSchemaName(framework: string): string {
		if(!framework) {
			return JsonSchemaValidator.BASE_VALIDATION_SCHEMA_NAME;
		}

		var frameworkProject = this.$frameworkProjectResolver.resolve(framework);
		var validationSchemaName = frameworkProject.getValidationSchemaId();
		if(!validationSchemaName) {
			return JsonSchemaValidator.BASE_VALIDATION_SCHEMA_NAME;
		}

		return validationSchemaName;
	}
}
$injector.register("jsonSchemaValidator", JsonSchemaValidator);