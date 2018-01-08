const db = require("../models/index.js");
const fs = require('fs');
const path = require('path');
const Parser = require("./parser.js");
const _ = require("lodash");
const Promise = require('bluebird');
const Steam = require('steam-webapi');
var chunk = require('chunk');
const parse = new Parser();
const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
let Player = db.Player;
let Tribe = db.Tribe;
let TribeMember = db.TribeMember;
let TribeOwner = db.TribeOwner;

class ArkCacher {
  runCache() {
    db.sequelize.sync({
      alter: true
    }).then(TribeOwner.destroy({
      truncate: true
    })).then(TribeMember.destroy({
      truncate: true
    })).then(() => {
      return refreshCache();
    });

  }
}
module.exports = ArkCacher;


let players = [];
let steamIds = [];
let tribeOwners = [];
let tribeMembers = [];
let rootPath = settings.server_config.ark_path;
let adminFilePath = path.join(rootPath, "Saved", "AllowedCheaterSteamIDs.txt");
let winBanFilePath = path.join(rootPath, "Binaries", "Win64", "BanList.txt");
let unixBanFilePath = path.join(rootPath, "Binaries", "Linux", "BanList.txt");
let playerPromises = [];

function refreshCache() {
  return new Promise((resolve, reject) => {

    fs.readdir(path.join(rootPath, "Saved", "AltSaves"), (err, files) => {
      let adminContents = fs.readFileSync(adminFilePath, {
        options: {
          encoding: 'utf-8'
        }
      }).toString();
      let adminData = adminContents.trim().replace('\r', '').split("\n");

      let banContents = fs.readFileSync(winBanFilePath, {
        options: {
          encoding: 'utf-8'
        }
      }).toString() || fs.readFileSync(unixBanFilePath, {
        options: {
          encoding: 'utf-8'
        }
      }).toString();

      let banData = banContents.trim().split("\n");
      let bans = [];
      banData.forEach(b => {
        b = b.split(",");
        bans.push(b[0]);
      });

      // console.log(adminData);
      files.forEach(f => {
        let filePath = path.join(rootPath, "Saved", "AltSaves", f);
        if (f.split(".")[1] == "arkprofile") {
          let contents = fs.readFileSync(filePath, {
            options: {
              encoding: "utf-8"
            }
          });
          let playerObject = {
            playerName: parse.getString("PlayerName", contents).replace(/\u0000/g, ''),
            level: parse.getUInt16("CharacterStatusComponent_ExtraCharacterLevel", contents) + 1,
            engrams: parse.getInt("PlayerState_TotalEngramPoints", contents) || 0,
            characterName: parse.getString("PlayerCharacterName", contents).replace(/\u0000/g, ''),
            id: parse.getUInt64('PlayerDataID', contents),
            steamId: parse.getSteamId(contents),
            admin: _.indexOf(adminData, parse.getSteamId(contents).toString()) !== -1,
            banned: _.indexOf(bans, parse.getSteamId(contents).toString()) !== -1
          };
          let tribeMemberObject = {
            PlayerId: playerObject.id,
            TribeId: parse.getInt("TribeID", contents) || null
          };
          if (tribeMemberObject.TribeId !== null) {
            tribeMembers.push(tribeMemberObject);
          }

          let playerPromise = Player.find({
            where: {
              steamId: playerObject.steamId
            }
          });
          playerPromise.then(player => {
            if (player !== null) {
              player.update(playerObject);
            } else if (_.find(players, ['id', playerObject.id]) === undefined) {
              players.push(playerObject);
            }
          }, (e) => {
            console.log(e);
          });
          playerPromises.push(playerPromise);
          playerPromise = Player.findById(playerObject.id);
          playerPromise.then(player => {
            if (player !== null) {
              player.update(playerObject);
            } else if (_.find(players, ['id', playerObject.id]) === undefined) {
              players.push(playerObject);
            }
          }, (e) => {
            console.log(e);
          });

          steamIds.push(parse.getSteamId(contents));
          playerPromises.push(playerPromise);
        } else if (f.split(".")[1] == "arktribe") {
          let contents = fs.readFileSync(filePath, {
            options: {
              encoding: "utf-8"
            }
          });
          let tribeObject = {
            id: parse.getInt("TribeID", contents),
            name: parse.getString("TribeName", contents)
          };
          let tribePromise = Tribe.findOrCreate({
            where: tribeObject
          });
          tribePromise.then(tribe => {
            if (tribe[0] !== false) {
              tribe[0].update(tribeObject);
            }
          }, (e) => {
            console.log(e);
          });

          let tribeOwnerObject = {
            PlayerId: parse.getUInt32("OwnerPlayerDataID", contents),
            TribeId: tribeObject.id
          };
          tribeOwners.push(tribeOwnerObject);
        }
      });
      Promise.all(playerPromises).then(() => {
        console.log("Creating Players...");
        return Player.bulkCreate(players);
      }).then(() => {
        return loadSteam(steamIds);
      }).then(() => {
        return Player.findAll().then(dbPlayers => {
          tribeMembers.forEach(member => {
            let player = _.find(dbPlayers, ['id', member.PlayerId]);
            if (player === undefined) {
              tribeMembers = _.filter(tribeMembers, e => e != member);
            } else {
              TribeMember.find({
                where: member
              }).then(tribeMember => {
                if (tribeMember !== null) {
                  TribeMember.destroy({
                    where: {
                      PlayerId: member.PlayerId
                    }
                  });
                }
              });
            }
          });
          tribeOwners.forEach(owner => {
            let player = _.find(dbPlayers, ['id', owner.PlayerId]);
            if (player === undefined) {
              tribeOwners = _.filter(tribeOwners, e => e != owner);
            } else {
              TribeOwner.find({
                where: owner
              }).then(tribeOwner => {
                if (tribeOwner !== null) {
                  TribeOwner.destroy({
                    where: {
                      PlayerId: owner.PlayerId
                    }
                  });
                }
              });
            }
          });
        });
      }).then(() => {
        console.log("Creating TribeOwners...");
        return TribeOwner.bulkCreate(tribeOwners);
      }).then(() => {
        console.log("Creating TribeMembers...");
        return TribeMember.bulkCreate(tribeMembers);
      }).catch((d) => {
        if (d.errors) {
          console.log(d.errors, d.fields);
        } else {
          console.log(d);
        }
      });
    });
  });

}


function loadSteam(list) {

  return new Promise(function(r, rj) {
    Steam.key = settings.server_config.steam_key;
    Steam.ready((err) => {
      if (err) {
        rj(err);
      }
      console.log("Caching Steam Info...");
      valueStrings = [];
      valueArgs = [];
      // // Creates an promise wielding function for every method (with Async attached at the end)
      Promise.promisifyAll(Steam.prototype);
      steamlist = chunk(list, 100);
      var steam = new Steam();
      let steamSummarries = steamlist.map((item) => {
        return steam.getPlayerSummariesAsync({
          steamids: item.toString()
        });
      });
      let steamBans = steamlist.map((item) => {
        return steam.getPlayerBansAsync({
          steamids: item.toString()
        });
      });
      Promise.all(steamSummarries).then(playerData => {
        Promise.all(steamBans).then(banData => {
          playerData.forEach((item, index) => {
            item.players.forEach(player => {
              let banPlayer = _.find(banData[index].players, ['SteamId', player.steamid]);
              Player.update({
                steamName: player.personaname,
                playerUrl: player.profileurl,
                avatarUrl: player.avatarfull,
                communityBanned: banPlayer ? banPlayer.CommunityBanned : false,
                vacBanned: banPlayer ? banPlayer.VACBanned : false,
                numberOfVacBans: banPlayer ? banPlayer.NumberOfVACBans : 0,
                daysSinceLastBan: banPlayer ? banPlayer.DaysSinceLastBan : 0
              }, {
                where: {
                  steamId: player.steamid
                }
              });
            });
          });
        }).then(r());
      }).catch(function(e) {
        console.log(e);
        rj('Steam failed to update cache!');
      });
    });
  });
}
