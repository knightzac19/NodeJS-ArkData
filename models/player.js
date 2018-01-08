'use strict';

module.exports = (sequelize, DataTypes) => {
  var Player = sequelize.define('Player', {
    level: DataTypes.INTEGER,
    engrams: DataTypes.INTEGER,
    steamId: DataTypes.STRING,
    admin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    characterName: DataTypes.STRING,
    playerName: DataTypes.STRING,
    steamName: DataTypes.STRING,
    playerUrl: DataTypes.STRING,
    avatarUrl: DataTypes.STRING,
    communityBanned: DataTypes.BOOLEAN,
    vacBanned: DataTypes.BOOLEAN,
    numberOfVacBans: DataTypes.INTEGER,
    daysSinceLastBan: DataTypes.INTEGER,
    banned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    indexes: [{
      unique: true,
      fields: ['id', 'steamId']
    }]
  });
  Player.associate = function(models) {
    models.Player.hasOne(models.TribeMember);
    models.Player.hasOne(models.TribeOwner);
  };
  return Player;
};
