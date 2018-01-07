module.exports = (sequelize, DataTypes) => {
  var TribeOwner = sequelize.define('TribeOwner');
  TribeOwner.associate = function(models) {
    TribeOwner.belongsTo(models.Player);
    TribeOwner.belongsTo(models.Tribe);
  };

  return TribeOwner;
};
