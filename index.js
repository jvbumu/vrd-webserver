let express = require('express');
let app = express();
let http = require('http').createServer(app);
let io = require('socket.io')(http);
let fileUpload = require('express-fileupload');
const { spawn } = require('child_process');

app.use(express.static('../client/dist'));
app.use(fileUpload());

var clients = [];

app.post('/upload', function(req, res) {
	res.set("Access-Control-Allow-Origin", "*");
	if (Object.keys(req.files).length == 0) {
		return res.status(400).send('No files were uploaded.');
	}

	req.files.file.mv('./uploads/'+req.files.file.name, function(err) {
		console.log(err);
	});

	res.send("OK");
});


io.on('connection', function(socket) {
	
	console.log('a user connected '+socket.id);
	let client = {
		socket: socket,
		filename: null
	};
	clients.push(client);

	socket.on('disconnect', function() {
		console.log('user disconnected');
	});

	socket.on('upload message', function(filename) {
		client.filename = filename;
		console.log("Client "+client.socket.id+" is now associated with file "+filename);
		
		thGen(client);
	});
});

function thGen(client) {
	client.socket.emit("status message", {
		code: "thGen",
		title: "Extracting fingerprints",
		desc: "Generating thumbnail fingerprints from video."
	});

	const childProcess = spawn('python', ['-u', 'VRD/vrd.py', 'thGen', '--input uploads/'+client.filename], {
		shell: true
	});
	//const childProcess = spawn('ls ../uploads/'+filename);
	
	childProcess.stdout.on('data', (data) => {
		client.socket.emit("status message", {
			code: "thGenTask",
			title: `${data}`,
			desc: ""
		});
		console.log(`child stdout:\n${data}`);
	});
	
	childProcess.stderr.on('data', (data) => {
		console.error(`child stderr:\n${data}`);
	});

	childProcess.on('exit', function (code, signal) {
		client.socket.emit("status message", {
			code: "thGenTasksDone",
			title: "",
			desc: ""
		});
		console.log('child process exited with ' + `code ${code} and signal ${signal}`);

		thMatch(client);
	});
}

function thMatch(client) {
	client.socket.emit("status message", {
		code: "thMatch",
		title: "Matching fingerprints",
		desc: "Finding similar video fragments based on comparison of thumbnails."
	});

	const childProcess = spawn('python', ['-u', 'VRD/vrd.py', 'thMatch', '--input '+client.filename], {
		shell: true
	});

	childProcess.stdout.on('data', (data) => {
		dataStr = data.toString();
		if(dataStr.substring(0, 7) == "output:") {

			let json = dataStr.substring(7);
			json = json.substr(0, json.indexOf("\n")-1);

			client.socket.emit("status message", {
				code: "thMatchReport",
				matches: JSON.parse(json)
			});
			console.log(`child stdout:\n${data}`);
		}

		if(dataStr.substring(0, 17) == "Processed videos:") {
			client.socket.emit("status message", {
				code: "thMatchProgress",
				processedVideos: dataStr.substring(17, dataStr.indexOf("\n")-1)
			});
		}
		
	});
	
	childProcess.stderr.on('data', (data) => {
		console.error(`child stderr:\n${data}`);
	});

	childProcess.on('exit', function (code, signal) {
		client.socket.emit("status message", {
			code: "thMatchDone",
			title: "",
			desc: ""
		});
		console.log('child process exited with ' + `code ${code} and signal ${signal}`);
	});
}

http.listen(4000, function() {
	console.log('Listening on *:4000');
});
