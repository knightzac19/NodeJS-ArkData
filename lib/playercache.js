/*jshint esversion: 6 */
var fs = require('fs');
var parser = require("./parse.js");
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.cached.Database('./players.sqlite');
var Steam = require('steam-webapi');
var Promise = require('bluebird');
var chunk = require('chunk');
var start = Date.now();
var sprintf = require("sprintf-js").sprintf,
    vsprintf = require("sprintf-js").vsprintf;
const path = require('path');
const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
const server_settings = settings.server_config;


console.log("Player DB....");
var steamlist = [];

function initTable(cb) {
    db.serialize(function() {
        db.run("drop table if exists players");
        db.run('CREATE TABLE players (Id INTEGER  NOT NULL UNIQUE, TribeId INT NULL, Level INT NOT NULL, Engrams INT NOT NULL, SteamId VARCHAR NOT NULL UNIQUE, Admin bool NOT NULL  DEFAULT false, CharacterName VARCHAR NULL,	SteamName VARCHAR NULL,ProfileUrl VARCHAR NULL,	AvatarUrl VARCHAR NULL,	CommunityBanned INT NULL,	VACBanned INT NULL,	NumberOfVACBans INT NULL,	NumberOfGameBans INT NULL,	DaysSinceLastBan INT NULL,  "Banned" bool NOT NULL  DEFAULT false,	FileUpdated DATETIME NULL, FileCreated DATETIME NULL)', function(e) {
            if (e) {
                console.fatal("INIT error!", e);
            } else {
                cb();
            }
        });
    });

}

function getId(data) {
    return parser.getUInt64('PlayerDataID', data);
}

function getSteamId(data) {
    data = new Buffer(data);
    var type = 'UniqueNetIdRepl';
    var bytes1 = data.indexOf(type);
    if (bytes1 == -1) {
        return false;
    }
    var start = bytes1 + type.length + 9;
    var end = start + 17;
    return data.slice(start, end).toString();
}

function checkId(id, cb) {
    db.get("SELECT id from players where Id = " + id, (err, row) => {
        // console.log(row);
        cb(row);
    });
}


function savePlayers(data, cb) {
    db.run("BEGIN",function(err){
		console.trace("saveplayer error!");
	});
    let reqs = data.map((item) => {
        return new Promise((resolve) => {
            checkId(item.Id, function(d) {
                if (d === undefined && item.Id !== false) {
                    db.parallelize(function() {
                        db.run("INSERT INTO players (id,steamid,charactername,level,engrams,tribeid,banned,fileupdated,filecreated) VALUES (?,?,?,?,?,?,?,?,?)", [item.Id, item.SteamId, item.PlayerName, item.Level, item.TotalEngramPoints, item.TribeId, item.Banned, item.FileUpdated, item.FileCreated], function(err, sql) {
                            if (err) {
                                db.run("Delete from players where steamid = ?", item.SteamId);
                                console.log("LINE 55:", err, "\n Will attempt to fix broken cache record...");
                                db.run("INSERT INTO players (id,steamid,charactername,level,engrams,tribeid,fileupdated,banned,filecreated) VALUES (?,?,?,?,?,?,?,?,?)", [item.Id, item.SteamId, item.PlayerName, item.Level, item.TotalEngramPoints, item.TribeId, item.Banned, item.FileUpdated, item.FileCreated], function(err, sql) {
                                    if (err === undefined || err === null) {
                                        console.log("Cache record fixed successfully!");
                                    } else {
                                        console.log("Failed to fix cache record for steamid: " + item.steamId);
                                    }
                                });

                            }
                        });
                        // cn++;
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        });
    });

    Promise.all(reqs).then(() => {
        db.run("COMMIT");
        cb();
    });
}


function loadSteam(list, cb) {

    steamAPIKey = server_settings.steam_key;
    Steam.ready(steamAPIKey, Promise.coroutine(function*(err) {
        if (err) return console.log(err);
        console.log("Caching Steam Info...");
        valueStrings = [];
        valueArgs = [];
        // Creates an promise wielding function for every method (with Async attached at the end)
        Promise.promisifyAll(Steam.prototype);
        steamlist = chunk(list, 100);
        var steam = new Steam({
            key: steamAPIKey
        });
        let profreqs = steamlist.map((item) => {
            return new Promise((resolve) => {
                resolve(steam.getPlayerSummariesAsync({
                    steamids: item.toString()
                }));
            });
        });
        Promise.all(profreqs).then((data) => {
            db.run("BEGIN",function(err){
				console.trace("loadsteam error!");
			});
            linkSteamProfiles(data, function() {
                console.log("Profiles are done updating!");
                db.run("COMMIT");
                let banreqs = steamlist.map((item) => {
                    return new Promise((resolve) => {
                        resolve(steam.getPlayerBansAsync({
                            steamids: item.toString()
                        }));
                    });
                });
                Promise.all(banreqs).then((data) => {
                    db.run("BEGIN",function(err){
						console.trace("loadsteam error!");
					});
                    linkSteamBans(data, function() {
                        console.log("Bans are done updating!");
                        cb();
                        db.run("COMMIT");
                    });
                });
            });

        });
    }));
}
// { SteamId: '76561198243647060',
//        CommunityBanned: false,
//        VACBanned: false,
//        NumberOfVACBans: 0,
//        DaysSinceLastBan: 0,
//        NumberOfGameBans: 0,
//        EconomyBan: 'none' },


// { steamid: '76561198257402425',
// 	  communityvisibilitystate: 3,
// 	  profilestate: 1,
// 	  personaname: 'EL_LOKO_CUBA',
// 	  lastlogoff: 1467194055,
// 	  profileurl: 'http://steamcommunity.com/profiles/76561198257402425/',
// 	  avatar: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/7a/7aae8b8bce433f23de6fc16dbd2434316cfe39f1.jpg',
// 	  avatarmedium: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/7a/7aae8b8bce433f23de6fc16dbd2434316cfe39f1_medium.jpg',
// 	  avatarfull: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/7a/7aae8b8bce433f23de6fc16dbd2434316cfe39f1_full.jpg',
// 	  personastate: 0,
// 	  realname: 'EL_LOKO_',
// 	  primaryclanid: '103582791434995702',
// 	  timecreated: 1445981532,
// 	  personastateflags: 0,
// 	  loccountrycode: 'CU',
// 	  locstatecode: '11' },
function linkSteamProfiles(data, cb) {
    var qry = "Update players set steamname = ?,profileurl = ?,avatarurl = ? where steamid = ?";

    let reqs = data.map((item) => {
        return new Promise((resolves) => {
            let reqss = item.players.map((itemm) => {
                return new Promise((resolve) => {
                    db.parallelize(function() {
                        // setupList("(?,?,?)",[item.personaname,item.profileurl,item.avatarfull], resolve);
                        db.run(qry, [itemm.personaname, itemm.profileurl, itemm.avatarfull, itemm.steamid], (err) => {
                            if (err) {
                                console.log(err);
                                // console.log("Steam profile cache had trouble updating...");
                                return false;
                            }
                            resolve();
                            return true;
                        });
                    });
                });
            });
            Promise.all(reqss).then(() => {
                resolves();
            });
        });
    });
    Promise.all(reqs).then(() => {
        cb();
    });
}

function linkSteamBans(data, cb) {
    var qry = "Update players set communitybanned = ?,vacbanned = ?,numberofvacbans = ?,numberofgamebans = ?, dayssincelastban = ? where steamid = ?";

    let reqs = data.map((item) => {

        return new Promise((resolves) => {
            let reqss = item.players.map((itemm) => {
                return new Promise((resolve) => {
                    db.parallelize(function() {
                        db.run(qry, [itemm.CommunityBanned, itemm.VACBanned, itemm.NumberOfVACBans, itemm.NumberOfGameBans, itemm.DaysSinceLastBan, itemm.SteamId], (err) => {
                            if (err) {
                                console.log(err);
                                return false;
                            }
                            resolve();
                            return true;
                        });
                    });
                });
            });
            Promise.all(reqss).then(() => {
                resolves();
            });
        });
    });
    Promise.all(reqs).then(() => {
        cb();
    });

}

var c = 0;
var qrylist = [];
module.exports.setupPlayers = (cb) => {

    initTable(function() {

        var players = [];
        var playerData = {};
        var banplayers = {};
		var banData;
        fs.readdir(path.join(path.normalize(server_settings.ark_path), "ShooterGame", "Saved", "SavedArks"), (err, files) => {
            try {
                banData = fs.readFileSync(path.join(server_settings.ark_path, "ShooterGame", "Binaries", "Win64", "BanList.txt"), "utf-8");

                var adminData = fs.readFileSync(path.join(server_settings.ark_path, "ShooterGame", "Saved", "AllowedCheaterSteamIDs.txt"), "utf-8");
                var admins = adminData;
                admins = admins.split("\r\n");
                if (admins === undefined || admins === "" || admins === null) {
                    admins = admins.split("\n");
                }
            } catch (err) {
                //Must be a linux binary path
                try {
					banData = fs.readFileSync(path.join(server_settings.ark_path, "ShooterGame", "Binaries", "Linux", "BanList.txt"), "utf-8");
					if (banData) {
						banData = banData.split("\r\n");
						if (banData === undefined || banData === "" || banData === null) {
							banData = bans.split("\n");
						}
						banData.forEach(function(elem, i) {
							var a = elem.split(",");
							if (banData[i] === "") {
								banData.splice(i);
								return true;
							}
							banplayers[a[0]] = true;
						});
					}
				}
				catch (err){
					console.log("No banfile detected.");
				}

            }

            let reqs = files.map((v) => {
                return new Promise(function(resolve) {
                    var re = new RegExp("^.*\\.arkprofile");
                    if (re.test(v)) {
                        var data = fs.readFileSync(path.join(server_settings.ark_path, "ShooterGame", "Saved", "SavedArks", v));
                        playerData = {};
                        if (err) {
                            cb(false);
                            return console.log(err);
                        }
                        playerData.PlayerName = parser.getString("PlayerName", data);
                        playerData.Level = parser.getUInt16("CharacterStatusComponent_ExtraCharacterLevel", data) + 1;
                        playerData.TotalEngramPoints = parser.getInt("PlayerState_TotalEngramPoints", data);
                        playerData.CharaacterName = parser.getString("PlayerCharacterName", data);
                        playerData.TribeId = parser.getInt("TribeID", data);
                        playerData.Id = getId(data);
                        playerData.SteamId = getSteamId(data);
                        var fdata = fs.statSync(path.join(server_settings.ark_path, "ShooterGame", "Saved", "SavedArks", v));
                        playerData.FileCreated = new Date(fdata.birthtime);
                        playerData.FileCreated = playerData.FileCreated.toISOString().slice(0, 19).replace('T', ' ');
                        playerData.FileUpdated = new Date(fdata.mtime);
                        playerData.FileUpdated = playerData.FileUpdated.toISOString().slice(0, 19).replace('T', ' ');
                        playerData.Banned = banplayers[playerData.SteamId] ? banplayers[playerData.SteamId] : false;
                        if (playerData.SteamId !== false || playerData.SteamId !== undefined || playerData.SteamId !== 0) {
                            steamlist.push(playerData.SteamId);
                            qrylist.push(playerData);
                        }
                    }
                    resolve();
                });
            });
            Promise.all(reqs).then(() => {
                savePlayers(qrylist, function() {
                    // cb();
                    console.log("Save Done...\r\nLoading Steam...");
                    loadSteam(steamlist, function() {
                        cb();
                        console.log("Time to start: ", Math.round((Date.now() - start) / 1000, 2) + "s");
                    });
                });
            });
        });

    });

};
