/*jshint esversion: 6 */
var fs = require('fs');
var parser = require("./parse.js");
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.cached.Database('./players.sqlite');
var Steam = require('steam-webapi');
var Promise = require('bluebird');
var chunk = require('chunk');

var sprintf = require("sprintf-js").sprintf,
    vsprintf = require("sprintf-js").vsprintf;
const path = require('path');
const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
const server_settings = settings.server_config;



var steamlist = [];
var initialized = false;

function initTable() {
    return new Promise(function(resolve, reject) {
        if (initialized) {
            resolve();
            return false;
        }

        db.serialize(function() {
            db.run("drop table if exists players");
            db.run('CREATE TABLE if not exists players (Id INTEGER  NOT NULL UNIQUE, TribeId INT NULL, Level INT NOT NULL, Engrams INT NOT NULL, SteamId VARCHAR NOT NULL UNIQUE, Admin bool NOT NULL  DEFAULT false, CharacterName VARCHAR NULL,	SteamName VARCHAR NULL,ProfileUrl VARCHAR NULL,	AvatarUrl VARCHAR NULL,	CommunityBanned INT NULL,	VACBanned INT NULL,	NumberOfVACBans INT NULL,	NumberOfGameBans INT NULL,	DaysSinceLastBan INT NULL,  "Banned" bool NOT NULL  DEFAULT false,	FileUpdated DATETIME NULL, FileCreated DATETIME NULL)', function(e) {
                if (e) {
                    console.error("INIT error!", e);
                    reject();
                } else {
                    initialized = true;
                    resolve();
                }
            });
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
    db.get("SELECT id from players where Id = ?", id, (err, row) => {
        cb(row);
    });
}


function savePlayers(data) {

    return new Promise(function(r, rj) {
        db.run("BEGIN", function(err) {
            if (err) {
                console.log("Error at savePlayers transaction!");
                console.log(err);
            }
        });
        let reqs = data.map((item) => {
            return new Promise((resolve) => {
                checkId(item.Id, function(d) {
                    if (d === undefined && item.Id !== false) {
                        db.parallelize(function() {
                            db.run("INSERT INTO players (id,steamid,charactername,level,engrams,tribeid,banned,fileupdated,filecreated) VALUES (?,?,?,?,?,?,?,?,?)", [item.Id, item.SteamId, item.CharacterName, item.Level, item.TotalEngramPoints, item.TribeId, item.Banned, item.FileUpdated, item.FileCreated], function(err, sql) {
                                if (err) {
                                    db.run("Delete from players where steamid = ?", item.SteamId);
                                    console.log("LINE 55:", err, "\n Will attempt to fix broken cache record...");
                                    db.run("INSERT INTO players (id,steamid,charactername,level,engrams,tribeid,fileupdated,banned,filecreated) VALUES (?,?,?,?,?,?,?,?,?)", [item.Id, item.SteamId, item.CharacterName, item.Level, item.TotalEngramPoints, item.TribeId, item.Banned, item.FileUpdated, item.FileCreated], function(err, sql) {
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
            r();
        });
    });

}


function loadSteam(list) {

    return new Promise(function(r, rj) {
        steamAPIKey = server_settings.steam_key;
        Steam.ready(steamAPIKey, Promise.coroutine(function*(err) {
            if (err) {
                return cb(err);
            }
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
                db.run("BEGIN", function(err) {
                    if (err) {
                        console.log("loadsteam error!");
                    }

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
                        db.run("BEGIN", function(err) {
                            if (err) {
                                console.log("loadsteam error!");
                            }

                        });
                        linkSteamBans(data, function() {
                            console.log("Steam bans are done updating!");
                            r();
                            db.run("COMMIT");
                        });
                    }).catch(function(e) {
                        console.log(e);
                        rj('Steam failed to update cache!');
                    });
                });

            }).catch(function(e) {
                console.log(e);
                rj('Steam failed to update cache!');
            });
        }));
    });

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
        return new Promise((resolves, rejects) => {
            let reqss = item.players.map((subItem) => {
                return new Promise((resolve, reject) => {
                    db.parallelize(function() {
                        db.run(qry, [subItem.CommunityBanned, subItem.VACBanned, subItem.NumberOfVACBans, subItem.NumberOfGameBans, subItem.DaysSinceLastBan, subItem.SteamId], (err) => {
                            if (err) {
                                reject(err);
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
var readFilePromisified = Promise.promisify(require("fs").readFile);
var readDirPromisified = Promise.promisify(require("fs").readdir);

function setupPlayerFiles() {
    return new Promise(function(resolve, reject) {
        var players = [];
        var playerData = {};
        var banplayers = {};
        steamlist = [];
        qrylist = [];
        var banData;
        var adminData;
        readFilePromisified(path.join(path.normalize(server_settings.ark_path), "ShooterGame", "Binaries", "Linux", "BanList.txt"), "utf-8")
            .then((data) => {
                banData = data;
            })
            .catch((err) => {
                console.log("Doesn't look like bans are in the Linux Folder, going to try the Windows location...");
            })
            .then(() => readFilePromisified(path.join(path.normalize(server_settings.ark_path), "ShooterGame", "Binaries", "Win64", "BanList.txt"), "utf-8"))
            .then((data) => {
                banData = data;
            }).catch((err) => {
                if (banData === undefined) {
                    console.log("No ban file found, not loading server bans...");
                }
            })
            .then(() => readFilePromisified(path.join(path.normalize(server_settings.ark_path), "ShooterGame", "Saved", "AllowedCheaterSteamIDs.txt"), "utf-8"))
            .catch((err) => {
                console.log("No Admins Detected!");
            })
            .then((data) => {
                adminData = data;
            })
            .then(() => readDirPromisified(path.join(path.normalize(path.normalize(server_settings.ark_path)), "ShooterGame", "Saved", "SavedArks"), "utf-8"))
            .then((files) => {
                if (adminData !== undefined) {
                    var admins = adminData;
                    admins = admins.split("\r\n");
                    if (admins === undefined || admins === "" || admins === null) {
                        admins = admins.split("\n");
                    }
                }
                if (banData !== undefined) {
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
                let reqs = files.map((v) => {
                    var re = new RegExp("^.*\\.arkprofile");
                    if (re.test(v)) {
                        var data = fs.readFileSync(path.join(path.normalize(server_settings.ark_path), "ShooterGame", "Saved", "SavedArks", v));
                        playerData = {};
                        playerData.PlayerName = parser.getString("PlayerName", data);
                        playerData.Level = parser.getUInt16("CharacterStatusComponent_ExtraCharacterLevel", data) + 1;
                        playerData.TotalEngramPoints = parser.getInt("PlayerState_TotalEngramPoints", data);
                        playerData.CharacterName = parser.getString("PlayerCharacterName", data);
                        playerData.TribeId = parser.getInt("TribeID", data);
                        playerData.Id = getId(data);
                        playerData.SteamId = getSteamId(data);
                        var fdata = fs.statSync(path.join(path.normalize(server_settings.ark_path), "ShooterGame", "Saved", "SavedArks", v));
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

                });
            })
            .then(() => savePlayers(qrylist))
            .then(() => loadSteam(steamlist))
            .then(() => {
                resolve();
            });
    });
}

module.exports.setupPlayers = () => {

    console.info("Initializing Player Data...");
    return new Promise(function(r, rj) {
        initTable()
            .then(() => setupPlayerFiles())
            .then(() => {

                r();
            })
            .catch(() => rj());
    });


};
