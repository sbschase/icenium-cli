///<reference path=".d.ts"/>

"use strict";

import util = require("util");
import path = require("path");
import url = require("url");
import xopen = require("open");
import fileSrv = require("./http-server");
import options = require("./options");
import querystring = require("querystring");
import Future = require("fibers/future");

export class UserDataStore implements IUserDataStore {
	private cookie: string;
	private user: any;

	constructor(private $fs: IFileSystem) {
	}

	public getCookie(): IFuture<string> {
		return this.readAndCache(UserDataStore.getCookieFilePath(),
			() => this.cookie,
			(value: string) => this.cookie = value);
	}

	public getUser(): IFuture<any> {
		return this.readAndCache(UserDataStore.getUserStateFilePath(),
			() => this.user,
			(value: string) => this.user = JSON.parse(value));
	}

	public setCookie(cookie?: string): IFuture<void> {
		this.cookie = cookie;
		if (cookie) {
			return this.$fs.writeFile(UserDataStore.getCookieFilePath(), cookie);
		} else {
			return this.$fs.deleteFile(UserDataStore.getCookieFilePath());
		}
	}

	public setUser(user?: any): IFuture<void> {
		this.user = user;
		if (user) {
			return this.$fs.writeJson(UserDataStore.getUserStateFilePath(), user);
		} else {
			return this.$fs.deleteFile(UserDataStore.getUserStateFilePath());
		}
	}

	private readAndCache<T>(sourceFile: string, getter: () => T, setter: (value: string) => void): IFuture<T> {
		return (() => {
			if (!getter()) {
				if (!this.$fs.exists(sourceFile).wait()) {
					throw new Error("error: not logged in.");
				}

				setter(this.$fs.readText(sourceFile).wait());
			}

			return getter();
		}).future<T>()();
	}

	private static getCookieFilePath(): string {
		return path.join(options["profile-dir"], "cookie");
	}

	private static getUserStateFilePath(): string {
		return path.join(options["profile-dir"], "user");
	}
}
$injector.register("userDataStore", UserDataStore);

export class LoginManager implements ILoginManager {
	constructor(private $logger: ILogger,
		private $config: any,
		private $httpClient: Server.IHttpClient,
		private $server: Server.IServer,
		private $serviceProxy: Server.IServiceProxy,
		private $fs: IFileSystem,
		private $userDataStore: IUserDataStore) {}

	public basicLogin(userName: string, password: string): IFuture<void> {
		var loginData = {
			wrap_username: userName,
			wrap_password: password
		};

		return this.authenticate(loginData);
	}

	public logout(): IFuture<void> {
		return (() => {
			this.$logger.debug("Logging out...");

			Future.wait([
				this.$userDataStore.setCookie(null),
				this.$userDataStore.setUser(null)
			]);

			this.$logger.debug("Logout completed.");
		}).future<void>()();
	}

	public login(): IFuture<void> {
		return (() => {
			this.logout().wait();

			this.$fs.createDirectory(options["profile-dir"]).wait();

			this.loginInBrowser().wait();

			this.$logger.info("Login completed.");
		}).future<void>()();
	}

	private authenticate(loginData: any): IFuture<any> {
		return ((): any => {
			loginData.wrap_client_id = this.$config.WRAP_CLIENT_ID;

			var wrapResponse = this.$httpClient.httpRequest({
				proto: "https",
				host: this.$config.TFIS_SERVER,
				path: "/Authenticate/WRAPv0.9",
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded"
				},
				body: querystring.stringify(loginData)
			}).wait();

			var wrapData = querystring.parse(wrapResponse.body),
				wrap_access_token = wrapData.wrap_access_token;

			this.$serviceProxy.setShouldAuthenticate(false);
			var userData = this.$server.authentication.login(wrap_access_token).wait();
			this.$serviceProxy.setShouldAuthenticate(true);

			var cookies = this.$serviceProxy.getLastRequestCookies();
			var iceAuthCookie = cookies && cookies[".ASPXAUTH"];
			this.$logger.debug("Cookie is '%s'", iceAuthCookie);

			if (iceAuthCookie && userData) {
				Future.wait(
					this.$userDataStore.setCookie(iceAuthCookie),
					this.$userDataStore.setUser(userData)
				);
			} else {
				throw new Error("Login failed.");
			}

			return userData;
		}).future()();
	}

	private static serveLoginFile(relPath): (request, response) => void {
		return fileSrv.serveFile(path.join(__dirname, "../resources/login", relPath));
	}

	private loginInBrowser(): IFuture<any> {
		var future = new Future<any>();

		this.$logger.debug("Begin browser login.");

		var loginConfig:any = {
			tfisServer: "https://" + this.$config.TFIS_SERVER,
			clientId: this.$config.WRAP_CLIENT_ID,
			callbackUrl: util.format("%s://%s/Mist/Authentication/RedirectVerification", this.$config.ICE_SERVER_PROTO, this.$config.ICE_SERVER)
		};

		var localhostServer = fileSrv.createServer({
			routes: {
				"/login": LoginManager.serveLoginFile("login.html"),
				"/knockout.js": LoginManager.serveLoginFile("knockout-3.0.0.js"),
				"/style.css": LoginManager.serveLoginFile("style.css"),
				"/login-config.js": fileSrv.serveText(function() {
					return "var loginConfig = " + JSON.stringify(loginConfig);
				}, "text/javascript"),
				"/completeLogin": (request, response) => {
					LoginManager.serveLoginFile("end.html")(request, response);

					this.$logger.debug("Login complete: " + request.url);
					localhostServer.close();

					var code = url.parse(request.url, true).query.wrap_verification_code;
					this.$logger.debug("Verification code: '%s'", code);
					this.authenticate({ wrap_verification_code: code }).proxy(future);
				}
			}
		});

		localhostServer.on("listening", function() {
			var port = localhostServer.address().port;
			var host = util.format("http://localhost:%s/", port);

			loginConfig.clientState = host + "completeLogin";

			xopen(host + "login");
		});

		localhostServer.listen(0);

		return future;
	}
}
$injector.register("loginManager", LoginManager);

class LoginCommand implements Commands.ICommand<any> {
	constructor(private $loginManager: ILoginManager) {
	}

	getDataFactory():Commands.ICommandDataFactory {
		return { fromCliArguments: () => null };
	}

	canExecute(data:any):boolean {
		return true;
	}

	execute(data:any):void {
		this.$loginManager.login().wait();
	}
}
$injector.registerCommand("login", LoginCommand);

class LogoutCommand implements Commands.ICommand<any> {
	constructor(private $loginManager: ILoginManager) {
	}

	getDataFactory():Commands.ICommandDataFactory {
		return { fromCliArguments: () => null };
	}

	canExecute(data:any):boolean {
		return true;
	}

	execute(data:any):void {
		this.$loginManager.logout().wait();
	}
}
$injector.registerCommand("logout", LogoutCommand);

class TelerikLoginCommandData {
	constructor(public user:string, public password:string) {}
}

class TelerikLoginCommand implements Commands.ICommand<TelerikLoginCommandData> {
	constructor(private $loginManager: ILoginManager) {
	}

	getDataFactory():Commands.ICommandDataFactory {
		return { fromCliArguments: (args: string[]) => new TelerikLoginCommandData(args[0], args[1]) };
	}

	canExecute(data:TelerikLoginCommandData):boolean {
		return true;
	}

	execute(data:TelerikLoginCommandData):void {
		this.$loginManager.basicLogin(data.user, data.password).wait();
	}
}
$injector.registerCommand("telerik-login", TelerikLoginCommand);