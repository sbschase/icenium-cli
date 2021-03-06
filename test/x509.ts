///<reference path=".d.ts"/>

"use strict";

import yok = require("../lib/common/yok");
import stubs = require("./stubs");
let assert = require("chai").assert;

let certificatePem = "-----BEGIN CERTIFICATE-----\r\nMIIDGjCCAgKgAwIBAgIIG3bCVtDIRMEwDQYJKoZIhvcNAQEFBQAwTTEXMBUGA1UE\r\nAwwOU3RlZmFuIERyYWduZXYxHzAdBgkqhkiG9w0BCQEWEHRhaWxzdUBnbWFpbC5j\r\nb20xETAPBgNVBAYTCEJ1bGdhcmlhMB4XDTE0MDIxOTAwMDAwMFoXDTE1MDIxOTAw\r\nMDAwMFowTTEXMBUGA1UEAwwOU3RlZmFuIERyYWduZXYxHzAdBgkqhkiG9w0BCQEW\r\nEHRhaWxzdUBnbWFpbC5jb20xETAPBgNVBAYTCEJ1bGdhcmlhMIIBIjANBgkqhkiG\r\n9w0BAQEFAAOCAQ8AMIIBCgKCAQEA50lQLpFzW33Aob2/8WdxS8Ye210WiLx3e1AH\r\nnAIN01vqUb8S2hfaStmFJfcp8S4D3akS6CdlCp5KSkBJ6BSWRrvT1qFGTCju9RlY\r\nJJORcfHCkvBs70inAs2GpUYyQ7xy1GPPZQ29jgiHdrWiY2oiWARATPDh5dbaC6bu\r\nvXNceCuk4m4pczzUWd+GFPIAopcWmALVQoEDpe4YseTIZm3NYO6tQ52LFQGQxFJ1\r\nxLbVn5EmsmLMw02dKytLrQk3crtKtvcd5YIyodtVj6MWuCL3Oy1PsBy+65fqxN4e\r\nbd1uURK2zDj3CBKAwREM+yYgeuJf3NmjckzQuXXiFcEPdfL1uwIDAQABMA0GCSqG\r\nSIb3DQEBBQUAA4IBAQDW9riym1P0RbrneFnmZ23gctT/R4Lm+yFaymSZdkKYYkKg\r\n0PDj31t6eAa6xRPFnGBrMui5cLqlLbtY5lmuQUGPFWAV0nEClJsGPIGb+wrn/Ezq\r\nO6nhrpQTj+yiFAmGaBxdsZCbF9o0vr91FoFfCDz9k8+1k17OO7eVMmQCKT2BKuDO\r\n8+6jw0UZ0YSEYI8yc8NngPKFySFlX2aJHjH4cpRhNMOYAOtZt3C8yGLZp/6j5K9K\r\nBXhhewKcn6FfPepduH60lJ1P27YWQh9M6Vd6BaEa1yR1oFn5vlbGnN1LlQNlBDQK\r\nro61fSJYkL9xQVidEzuMaoTKB8Comkp6cE0zwLBY\r\n-----END CERTIFICATE-----";

describe("x509", () => {
	let x509 = require("../lib/x509");

	let injector = new yok.Yok();
	injector.register("logger", stubs.LoggerStub);

	let loader: IX509CertificateLoader = injector.resolve(x509.X509CertificateLoader);

	it("should parse issuer string", () => {
		let cert = loader.load(certificatePem);
		let issuerData = cert.issuerData;

		assert.equal(issuerData["CN"], "Stefan Dragnev");
	});

	it("should parse expiration date", () => {
		let cert = loader.load(certificatePem);
		let expiresOn = cert.expiresOn;

		assert.equal(expiresOn.getFullYear(), 2015);
		assert.equal(expiresOn.getMonth() + 1, 2); // The getMonth() method returns the month in the specified date according to local time, as a zero-based value
		assert.equal(expiresOn.getDate(), 19);
	});
});
