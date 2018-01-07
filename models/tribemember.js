module.exports = (sequelize, DataTypes) => {
  var TribeMember = sequelize.define('TribeMember');
  TribeMember.associate = function(models) {
    TribeMember.belongsTo(models.Player);
    TribeMember.belongsTo(models.Tribe)
  };

  return TribeMember;
};
