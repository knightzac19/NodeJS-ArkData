/*jshint esversion: 6 */
var fs = require('fs');
var parser = require("./parse.js");
var sqlite3 = require('sqlite3').verbose();
var Promise = require('bluebird');
var db = new sqlite3.cached.Database('./players.sqlite');
const path = require('path');
const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
const server_settings = settings.server_config;

function initTable() {
    return new Promise((r, rj) => {
        db.run('CREATE TABLE IF NOT EXISTS tribes ( Id INTEGER  NOT NULL UNIQUE,Name VARCHAR NOT NULL,OwnerId INT NULL,	FileCreated DATETIME NULL,FileUpdated DATETIME NULL)', (err, sql) => {
            r();
        });
    });

}

function checkId(id) {
    return new Promise((r, rj) => {
        db.get("SELECT id from tribes where id = " + id, (err, row) => {
            // console.log(row);
            r(row);
        });
    });

}

function saveTribes(data) {
    console.log("Setting up Tribes...");
    return new Promise((r, rj) => {
        db.run("BEGIN");
        let reqs = data.map((item) => {
            return new Promise((resolve) => {
                checkId(item.Id)
                    .then((d) => {
                        if (d === undefined && item.Id !== false) {
                            db.parallelize(function() {
                                db.run("INSERT INTO tribes (Id,Name,OwnerId,FileCreated,FileUpdated) VALUES (?,?,?,?,?)", [item.Id, item.Name, item.OwnerId, item.FileCreated, item.FileUpdated],
                                    function(err, sql) {
                                        if (err) {
                                            console.log("LINE 24:", err);
                                            rj();
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
            db.run("COMMIT", () => {
                r();
            });
        });
    });

}
var qrylist = [];

var readFilePromisified = Promise.promisify(require("fs").readFile);
var readDirPromisified = Promise.promisify(require("fs").readdir);
module.exports.setupTribes = function() {
    return new Promise((r, rj) => {
        initTable()
            .then(() => readDirPromisified(path.join(path.normalize(server_settings.ark_path), "ShooterGame", "Saved", "SavedArks"), "utf-8"))
            .then((files) => {
                var players = [];
                var tribeData = {};
                qrylist = [];
                let reqs = files.map((v) => {
                    return new Promise(function(resolve) {
                        var re = new RegExp("^.*\\.arktribe");
                        if (re.test(v)) {
                            var data = fs.readFileSync(path.join(path.normalize(server_settings.ark_path), "ShooterGame", "Saved", "SavedArks", v));
                            tribeData = {};
                            tribeData.Name = parser.getString("TribeName", data);
                            tribeData.OwnerId = parser.getUInt32("OwnerPlayerDataID", data);
                            tribeData.Id = parser.getInt("TribeID", data);
                            var fdata = fs.statSync(path.join(server_settings.ark_path, "ShooterGame", "Saved", "SavedArks", v));
                            tribeData.FileCreated = new Date(fdata.birthtime);
                            tribeData.FileUpdated = new Date(fdata.mtime);
                            tribeData.FileCreated = tribeData.FileCreated.toISOString().slice(0, 19).replace('T', ' ');
                            tribeData.FileUpdated = tribeData.FileUpdated.toISOString().slice(0, 19).replace('T', ' ');
                            qrylist.push(tribeData);
                        }
                        resolve();
                    });

                });
                Promise.all(reqs)
                    .then(() => saveTribes(qrylist))
                    .then(() => r());
            }).catch(() => rj());
    });

};
