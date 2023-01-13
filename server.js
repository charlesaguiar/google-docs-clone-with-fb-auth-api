/* REQUIRES */
require("dotenv").config();

const mongoose = require("mongoose");
const http = require("http");
const express = require("express");
const cors = require("cors");
const sio = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const Document = require("./Document");
/* ------ */

const dataDefaultValue = "";

const app = express();
const server = http.createServer(app);

const io = sio(server, {
	cors: {
		origin: "*",
		method: ["GET", "POST"],
	},
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

mongoose.connect(process.env.MONGODB_CONNECTION_STRING);

app.get("/documents", async (req, res) => {
	const { ownerId } = req.query;

	if (!ownerId) {
		return res
			.status(400)
			.send({ message: "Must provide ownerId to get documents" });
	}

	const documents = await Document.find({ ownerId, active: true });
	res.status(200).send({ documents });
});

app.get("/document/:uid", async (req, res) => {
	const { uid } = req.params;

	if (!uid) {
		return res.status(400).send({ message: "Must provide document uid" });
	}

	const document = await Document.findOne({ uid });
	res.status(200).send({ document });
});

app.post("/document", async (req, res) => {
	const { ownerId, name, data } = req.body;

	if (!ownerId || !name) {
		return res
			.status(400)
			.send({ message: "Must provide document name and ownerId" });
	}

	if (await Document.findOne({ name, active: true })) {
		return res
			.status(400)
			.send({ message: `Document: "${name}" already exists` });
	}

	const document = await Document.create({
		uid: uuidv4(),
		data: data || dataDefaultValue,
		ownerId,
		name,
		createdAt: new Date().toISOString(),
		active: true,
	});
	res
		.status(201)
		.send({ message: "Document created successfully.", data: { document } });
});

app.post("/clone-document", async (req, res) => {
	const { ownerId, name, data } = req.body;

	if (!ownerId || !name) {
		return res
			.status(400)
			.send({ message: "Must provide document name and ownerId" });
	}

	const document = await Document.create({
		uid: uuidv4(),
		data: data || dataDefaultValue,
		ownerId,
		name: `${name} - ${uuidv4()}`,
		createdAt: new Date().toISOString(),
		cloned: true,
		active: true,
	});

	res
		.status(201)
		.send({ message: "Document cloned successfully.", data: { document } });
});

app.patch("/document", async (req, res) => {
	const { uid, name } = req.body;

	if (!uid || !name) {
		return res
			.status(400)
			.send({ message: "Must provide document name and uid" });
	}

	const filter = { uid };
	const update = { name };

	await Document.findOneAndUpdate(filter, update);

	res.status(204).send();
});

app.delete("/document/:uid", async (req, res) => {
	const { uid } = req.params;

	if (!uid) {
		return res.status(400).send({ message: "Must provide document uid" });
	}

	const filter = { uid };
	const update = { active: false };

	await Document.findOneAndUpdate(filter, update);

	res.status(204).send();
});

app.delete("/document/h/:uid", async (req, res) => {
	const { uid } = req.params;

	if (!uid) {
		return res.status(400).send({ message: "Must provide document uid" });
	}

	const filter = { uid };

	await Document.deleteOne(filter);

	res.status(204).send();
});

io.on("connection", (socket) => {
	socket.on("get-document", async (documentId, ownerId, name) => {
		/* GET/GET&CREATE DOCUMENT FROM/IN DB */
		const document = await findOrCreateDocument(documentId, ownerId, name);

		/* SETS UP A ROOM BASSED ON THE DOCUMENT ID */
		socket.join(documentId);

		/* SENDS THE PROPER DOCUMENT TO CLIENTS */
		socket.emit("load-document", document.data);

		/* BROADCAST CHANGES ONLY TO THE ROOM */
		socket.on("send-changes", (delta) => {
			socket.broadcast.to(documentId).emit("receive-changes", delta);
		});

		/* SAVES DOCUMENT INTO DB */
		socket.on("save-document", async (data) => {
			await Document.findOneAndUpdate({ uid: documentId }, { $set: { data } });
		});
	});
});

async function findOrCreateDocument(id, ownerId, name) {
	if (!id) return;

	const document = await Document.findOne({ uid: id, ownerId });
	if (document) return document;

	return await Document.create({
		uid: id,
		ownerId,
		data: dataDefaultValue,
		name,
		active: true,
	});
}

server.listen(process.env.PORT || 3001, (err) => {
	if (err) console.error(err);
	console.log("[SERVER] OK");
});
