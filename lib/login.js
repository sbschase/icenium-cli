"use strict";

(function(){
	var util = require("util"),
		path = require("path"),
		url = require("url"),
		fs = require("fs"),
		Q = require("q"),
		xopen = require("open"),
		server = require("./server"),
		fileSrv = require("./http-server"),
		log = require("./log"),
		options = require("./options"),
		querystring = require("querystring"),
		config = require("./config"),
		iceAuthCookie;

	function prepareUserDirectory() {
		var profileDir = options["profile-dir"];
		if (!fs.existsSync(profileDir)) {
			fs.mkdirSync(profileDir);
		}
	}

	function logout(callback) {
		log.debug("Logging out...");
		var cookieFilePath = getCookieFilePath();

		fs.unlink(cookieFilePath, function(err) {
			log.debug("Logout completed.");
			callback();
		});
	}

	function getCookieFilePath() {
		return path.join(options["profile-dir"], "cookie");
	}

	function getCookie() {
		if (!iceAuthCookie) {
			var cookieFilePath = getCookieFilePath();

			if (!fs.existsSync(cookieFilePath)) {
				throw new Error("error: not logged in.");
			}

			iceAuthCookie = fs.readFileSync(cookieFilePath);
		}

		return iceAuthCookie;
	}

	function serveLoginFile(relPath) {
		return fileSrv.serveFile(path.join(path.join(__dirname, "..\\resources\\login"), relPath));
	}

	function loginInBrowser(callback) {
		log.debug("Begin browser login.");

		var loginConfig = {
			tfisServer: "https://" + config.TFIS_SERVER,
			clientId: "uri:ice",
			callbackUrl: util.format("%s://%s/Mist/Authentication/RedirectVerification", config.ICE_SERVER_PROTO, config.ICE_SERVER),
		};

		var localhostServer = fileSrv.createServer({
			routes: {
				"/login": serveLoginFile("login.html"),
				"/knockout.js": serveLoginFile("knockout-3.0.0.js"),
				"/style.css": serveLoginFile("style.css"),
				"/login-config.js": fileSrv.serveText(function() {
					return "var loginConfig = " + JSON.stringify(loginConfig);
				}, "text/javascript"),
				"/completeLogin": function (request, response) {
					serveLoginFile("end.html")(request, response);

					log.debug("Login complete: " + request.url);
					localhostServer.close();

					var code = url.parse(request.url, true).query.wrap_verification_code;
					log.debug("Verification code: '%s'", code);
					server.authenticate({ wrap_verification_code: code }, callback);
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
	}

	function loginCommand() {
		Q.nfcall(logout)
			.then(function() {
				return Q.nfcall(loginInBrowser);
			})
			.then(function(auth) {
				log.debug("Cookie is '%s'", auth);

				if (!auth) {
					log.fatal("Login failed.");
					return;
				}

				if (auth) {
					iceAuthCookie = auth;
				}

				prepareUserDirectory();
				fs.writeFileSync(getCookieFilePath(), auth);
			})
			.done();
	}

	function telerikLogin(userName, password) {
		server.basicLogin(userName, password, function(err) {
			if (err) {
				throw err;
			}
			log.info("Login completed.");
		});
	}

	exports.getCookie = getCookie;
	exports.loginCommand = loginCommand;
	exports.telerikLogin = telerikLogin;
})();