module.exports = (sequelize, DataTypes) => {
  var TribeMember = sequelize.define('TribeMember');
  TribeMember.associate = function(models) {
    models.TribeMember.belongsTo(models.Player);
    models.TribeMember.belongsTo(models.Tribe)
  };

  return TribeMember;
};
