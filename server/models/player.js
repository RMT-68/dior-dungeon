"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Player extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      Player.belongsTo(models.Room, { foreignKey: "room_id" });
    }
  }
  Player.init(
    {
      username: DataTypes.STRING,
      socket_id: DataTypes.STRING,
      room_id: DataTypes.INTEGER,
      is_ready: DataTypes.BOOLEAN,
      character_data: DataTypes.JSONB,
      current_hp: DataTypes.INTEGER,
      current_stamina: DataTypes.INTEGER,
      is_alive: DataTypes.BOOLEAN,
    },
    {
      sequelize,
      modelName: "Player",
    },
  );
  return Player;
};
