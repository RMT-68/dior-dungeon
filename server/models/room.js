"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Room extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // Room has many Players
      Room.hasMany(models.Player, { foreignKey: "room_id" });
      // Room has one host Player
      Room.belongsTo(models.Player, { foreignKey: "host_id", as: "host" });
    }
  }
  Room.init(
    {
      room_code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      host_name: DataTypes.STRING,
      host_id: DataTypes.INTEGER,
      theme: DataTypes.STRING,
      difficulty: DataTypes.ENUM("easy", "medium", "hard"),
      max_node: DataTypes.INTEGER,
      language: DataTypes.STRING,
      status: {
        type: DataTypes.ENUM("waiting", "playing", "finished"),
        defaultValue: "waiting",
      },
      dungeon_data: DataTypes.JSONB,
      current_node_index: DataTypes.INTEGER,
      game_state: DataTypes.JSONB,
    },
    {
      sequelize,
      modelName: "Room",
    },
  );
  return Room;
};
