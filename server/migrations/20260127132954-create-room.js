"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Rooms", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      room_code: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      host_name: {
        type: Sequelize.STRING,
      },
      theme: {
        type: Sequelize.STRING,
      },
      difficulty: {
        type: Sequelize.ENUM("easy", "medium", "hard"),
      },
      max_node: {
        type: Sequelize.INTEGER,
      },
      language: {
        type: Sequelize.STRING,
      },
      status: {
        type: Sequelize.ENUM("waiting", "playing", "finished"),
        defaultValue: "waiting",
      },
      dungeon_data: {
        type: Sequelize.JSONB,
      },
      current_node_index: {
        type: Sequelize.INTEGER,
      },
      game_state: {
        type: Sequelize.JSONB,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("Rooms");
  },
};
