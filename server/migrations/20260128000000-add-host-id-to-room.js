"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Rooms", "host_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "Players",
        key: "id",
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Rooms", "host_id");
  },
};
