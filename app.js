#!/usr/bin/env node
const express    = require ( "express" );
const prometheus = require ( "express-prometheus-middleware" )
const path       = require ( "path" );
const fs         = require ( "fs" );
const bodyparser = require ( "body-parser" );
const tokens     = require ( "./btoken.json" );
const cookparser = require ( "cookie-parser" );
const uuid       = require ( "uuid/v4" );
const mso        = require ( "./mso.js" )({time: 300000});

const config = { PORT: 3000 };
const kpath  = path.resolve(__dirname,"./.keys");
const kbpath = path.resolve(__dirname,"./ksv/");
//fs.mkdirSync(kbpath, {recursive: true});

const log   = (s) => { console.log(JSON.stringify(s)) };
const error = (s) => { console.log(JSON.stringify(s)) };

let temp = {};

async function genSessionId(permissions, req) {
    let id = uuid();
    let logmessage = { message: "New SessionId", sessionId: id, perms: permissions, ip: req.connection.remoteAddress };
    log ( logmessage );
    mso.SET(id, permissions);
    //temp[id] = permissions;
    return id;
}

async function sessionValid(sessionId, req) {
    let logmessage = { sessionId: sessionId, ip: req.connection.remoteAddress };
    if ( mso.EXISTS(sessionId) ) {
	logmessage.message = "Session Valid";
	mso.EXPIRE(sessionId); //Update the timeout
	log ( logmessage );
	return mso.GET(sessionId);
    } else {
	logmessage.message = "Session Invalid/Expired";
	error ( logmessage );
	return -1;
    }
}

let app = express();
app.use(prometheus({
    metricsPath: "/metrics",
    collectDefaultMetrics: true,
    requestDurationBuckets: [0.1, 0.5, 1, 1.5]
}));
app.use(cookparser());
app.use(bodyparser.raw({type: ()=>{return true;}}));

const perms = {
    "GET" : 2,
    "PUT" : 4,
    "POST": 1
}

// Apply appropriate headers, and respond to any OPTIONS requests
app.use ( ( req, res, next ) => {
    res.header("Access-Control-Allow-Origin", "http://localhost:3000");
    res.header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
    res.header("Access-Control-Allow-Credentials", true);
    if ( req.method === "OPTIONS" ) {
        res.sendStatus ( 200 );
    } else {
	next();
    }
});
// Check the permissions of the user before continuing
app.use( async (req,res,next)=>{
    if ( req.method == 'POST' ) {
	return next();
    }
    let perm = perms[req.method] || 0;
    let logmessage = { ip: req.connection.remoteAddress };
    if ( ! req.cookies.sessionId ) {
	logmessage.message = "No sessionId sent";
	log ( logmessage );
	res.status(401).send({message: "No sessionId sent"});
    } else {
	logmessage.sessionId = req.cookies.sessionId;
	let _perm = await sessionValid(req.cookies.sessionId, req);
	if ( _perm < 0 ) {
	    logmessage.message = "Unrecognized sessionId";
	    error ( logmessage );
	    res.status(400).send({message:"sessionId not recognized"});
	}
	if ( perm & _perm ) {
	    next();
	} else {
	    logmessage.message = "Permissions do not match up";
	    error ( logmessage );
	    res.sendStatus(403);
	}
    }
});
// Route for an application to provide their token, sent as the body of the message, in raw bytes
app.post ( "/token", async (req, res) => {
    let body = req.body.toString('utf8');
    let logmessage = { message: "Token Received", token: body, ip: req.connection.remoteAddress };
    log ( logmessage );
    
    // Handle the presence of a session token (if it exists)
    if ( req.cookies.sessionId && await sessionValid(req.cookies.sessionId, req) ) {
	logmessage.message = "Already had valid sessionId";
	log ( logmessage );
	res.sendStatus(200);
	return;
    }

    //Make sure they have a body
    if ( 0 === body.length ) {
	logmessage.message = "No token provided";
	log ( logmessage );
	res.status(400).send({ error: "No Token Sent" });
    } else {
	// Make sure the token is valid
	let perms = tokens[body];
	if ( perms === undefined ) {
	    logmessage.message = "Unrecognized token";
	    error ( logmessage );
	    res.status(400).send({ error: "Token Not Recognized" });
	} else {
	    // Generate a new sessionid with their permissions
	    let id = await genSessionId(perms, req);
	    res.cookie("sessionId", id).sendStatus(200);
	}
    }
});

app.get ( "/", async (req, res) => {
    let logmessage = { message: "File retrieved", sessionId: req.cookies.sessionId, ip: req.connection.remoteAddress};
    log ( logmessage );
    res.sendFile(kpath, {dotfiles: "allow"});
});

app.put ( "/", async (req, res) => {
    let body = req.body;
    let logmessage = { message: "File updating", sessionId: req.cookies.sessionId, ip: req.connection.remoteAddress};
    log ( logmessage );
    let nfile = `${Date.now()}.keys`;
    fs.copyFile(kpath, path.join(kbpath,nfile) , (err)=>{
	if ( err ) {
	    error ( err );
	    res.status(500).send({message: "Failed to backup old key file"});
	}
	fs.writeFile(".keys", body, (err)=>{
	    if ( err ) {
		error ( err );
		res.status(500).send({message: "Failed to write new key file"});
	    } else {
		res.sendStatus(200);
	    }
	});
    });
    // To do (I have no idea how to do this right now)
});

app.use ( "*", async ( req, res ) => {
    res.sendStatus(404);
});

app.listen ( config.PORT, () => {
    console.log ( `Server running on http://localhost:${config.PORT}` )
});
