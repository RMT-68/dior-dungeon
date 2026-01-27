"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Players", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      username: {
        type: Sequelize.STRING,
      },
      socket_id: {
        type: Sequelize.STRING,
      },
      room_id: {
        type: Sequelize.INTEGER,
        references: {
          model: "Rooms",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      is_ready: {
        type: Sequelize.BOOLEAN,
      },
      character_data: {
        type: Sequelize.JSONB,
      },
      current_hp: {
        type: Sequelize.INTEGER,
      },
      current_stamina: {
        type: Sequelize.INTEGER,
      },
      is_alive: {
        type: Sequelize.BOOLEAN,
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
    await queryInterface.dropTable("Players");
  },
};
