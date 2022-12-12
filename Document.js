const { Schema, model } = require("mongoose");

module.exports = model(
	"Document",
	Schema({
		uid: String,
		ownerId: String,
		data: Object,
		name: String,
		createdAt: String,
	})
);
