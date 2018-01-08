'use strict';
module.exports = (sequelize, DataTypes) => {
  var Tribe = sequelize.define('Tribe', {
    name: DataTypes.STRING
  });
  Tribe.associate = function(models) {
    models.Tribe.hasMany(models.TribeMember);
  };

  return Tribe;
};
