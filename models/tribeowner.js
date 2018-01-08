module.exports = (sequelize, DataTypes) => {
  var TribeOwner = sequelize.define('TribeOwner');
  TribeOwner.associate = function(models) {
    models.TribeOwner.belongsTo(models.Player);
    models.TribeOwner.belongsTo(models.Tribe);
  };

  return TribeOwner;
};
