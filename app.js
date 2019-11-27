// Dependencies
const express = require("express");
const exphbd = require("express-handlebars");
const moment = require('moment-timezone');
const crypto = require("crypto");
const { check, validationResult } = require('express-validator');
const uuidv1 = require('uuid/v1');
const session = require('express-session');
const dotenv = require('dotenv');
const passport = require('passport');
const Auth0Strategy = require('passport-auth0');
const request = require("request");
const url = require('url');
const util = require('util');
const shuffle = require('shuffle-array');
var schedule = require('node-schedule');

// Project files
const databases = new require("./databases");
const packageJson = require("./package.json");

dotenv.config();
const db = new databases(process.env.DATABASE_PATH);

var app = express();
app.use(express.urlencoded());
app.use(express.json());
app.engine("handlebars", exphbd());
app.set("view engine", "handlebars");

var sess = {
    secret: process.env.SESSION_SECRET,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 14 
    },
    resave: false,
    saveUninitialized: true
};

if (app.get('env') === 'production') {
    // Use secure cookies in production (requires SSL/TLS)
    sess.cookie.secure = true;
  
    // Uncomment the line below if your application is behind a proxy (like on Heroku)
    // or if you're encountering the error message:
    // "Unable to verify authorization request state"
    // app.set('trust proxy', 1);
}

app.use(session(sess));

var strategy = new Auth0Strategy(
    {
      domain: process.env.AUTH0_DOMAIN,
      clientID: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      callbackURL:
        process.env.AUTH0_CALLBACK_URL || "http://localhost:8080/login_callback"
    },
    function (accessToken, refreshToken, extraParams, profile, done) {
      // accessToken is the token to call Auth0 API (not needed in the most cases)
      // extraParams.id_token has the JSON Web Token
      // profile has all the information from the user
      return done(null, profile);
    }
);

passport.use(strategy);

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function (user, done) {
    getUserRoles(user.id, (roles) => {
        let sessionUser = {
            "authId": user.id,
            "displayName": user.displayName,
            "email": user.email,
            "roles": roles,
            "picture": user.picture
        };

        findOrCreateUser(sessionUser, (dbUser) => {
            sessionUser.id = dbUser._id;
            sessionUser.groups = dbUser.groups;
            done(null, sessionUser);
        });
    });
});
  
passport.deserializeUser(function (user, done) {
    //console.log("Deserialize: " + JSON.stringify(user));
    //console.log("---");
    done(null, user);
});



function getNow() {
    return moment().tz(process.env.TIMEZONE);
}

function addScore(year, group, user, points, callback) {
    const query = { $and: [{"year": year}, {"user": user}, {"group": group}]};

    db.scores.findOne(query).exec((err,doc) => {
        if(err !== null) {
            console.error("Failed to load score!");
        }

        if(doc === null) {
            doc = {
                "user": user,
                "year": year,
                "group": group,
                "points": points
            };
            db.insert(doc, (err, newDoc) => {
                if(err) {
                    console.error("Failed to insert score: " + err);
                    callback();
                } else {
                    callback(newDoc);
                }
            });
        } else {
            doc.points += points;
            db.scores.update({"_id": doc,_id }, doc, {}, (err, updatedCount) => {
                if(err) {
                    console.error("Failed to update scores: " + err);
                    callback();
                } else {
                    callback(doc);
                }
            });
        }
    });
}

function getScores(year, group, callback) {
    const query = { $and: [{"year": year}, {"group": group._id}]};
    db.scores.find(query, (err,docs) => {
        if(err) {
            console.error("Failed to resolve scores:" + err);
            callback([]);
        } else {
            docs.sort((a, b) => { return b.points - a.points }); 

            callback({
                "year": year,
                "group": group,
                "scores": docs
            });
        }
    });
}

function addYell(user, groupId, callback) {
    const now = getNow();
    const year = now.year();
    const date = now.format("YYYY-MM-DD");
    const time = now.format();
    const userId = user.id;
    const query = { $and: [ { "user.id": userId }, { "group": groupId }, { "year": Number(year) }, { "date": date } ]};

    db.yells.findOne(query, (err,doc) => {
        if(err) {
            console.error("Failed to add/update yell: " + err);
            return;
        } else if(doc) {
            doc.time = time;
            doc.ignoredYells.push(doc.time);
            db.yells.update({ "_id": doc._id }, { $set: { "time" : doc.time, "ignoredYells" : doc.ignoredYells } }, (err, numReplaced) => {
                if(err) {
                    console.error("Failed to update yell: " + err);
                    callback();
                } else {
                    callback(doc);
                }
            });
        } else {
            doc = {
                "user": {
                    "id": userId,
                    "name": user.displayName,
                    "picture": user.picture
                },
                "group": groupId,
                "year": Number(year),
                "date": date,
                "time": time,
                "ignoredYells": []
            };
            db.yells.insert(doc, (err, newDoc) => {
                if(err) {
                    console.error("Failed to add yell: " + err);
                    callback();
                } else {
                    callback(newDoc);
                }
            });
        }
    });

}

function findUserWithId(id, callback) {
    return db.users.findOne({"_id": id}, (err, doc) => {
        if(err) {
            console.error("Failed to load user");
        } else {
            callback(doc);
        }
    });
}

function findOrCreateUser(sessionUser, callback) {
    findUserWithAuthId(sessionUser.authId, (user) => {
        const now = getNow().format();
        if(user) {
            user.lastLogin = now;
            db.users.update({ "_id": user._id }, { $set: { "lastLogin" : user.lastLogin } }, (err, numReplaced) => {
                if(err) {
                    console.error("Failed to update user");
                    callback();
                } else {
                    callback(user);
                }
            });
        } else {
            user = {
                "authIds": [ sessionUser.authId ],
                "name": sessionUser.displayName,
                "email": sessionUser.email,
                "picture": sessionUser.picture,
                "groups": [],
                "createdAt": now,
                "lastLogin": now,
                "public": true
            }
            db.users.insert(user, (err, newDoc) => {
                if(err) {
                    console.error("Failed to insert new user");
                    callback();
                } else {
                    callback(newDoc);
                }
            });
        }
    });
}

function findUserWithAuthId(authId, callback) {
    const query = { "authIds": authId };
    db.users.find(query).exec((err,docs) => {
        if(err) {
            console.error("Failed to query user");
            callback();
        } else if(docs === undefined || docs.length === 0) {
            callback();
        } else if(docs.length !== 1) {
            console.error("Found wrong amount of users " + docs.length);
            callback();
        } else {
            callback(docs.pop());
        }
    });
}

function addGroup(userId, name, callback) {
    db.groups.find({"name": name}, (err, docs) => {
        if(err) {
            console.error("Failed to check if group exists");
            callback();
        } else if(docs.length != 0) {
            console.error("Group already exists");
            callback();
        } else {
            let doc = {
                "name": name,
                "public": true,
                "createdAt": getNow().format,
                "createdBy": userId 
            }
            db.groups.insert(doc, (err, newDoc) => {
                if(err) {
                    console.error("Failed to add group");
                    callback();
                } else {
                    callback(newDoc);
                }
            });
        }
    });
}

function getGroupWithName(name, callback) {
    db.groups.find({ "name": name }, (err, docs) => {
        if(err) {
            console.error("Failed to load group with name");
            callback();
        } else if(docs.length != 1) {
            console.error("Failed to find group with name: '" + name + "'");
            callback();
        } else {
            callback(docs.pop());
        }
    });
}

function getGroupWithId(id, callback) {
    db.groups.findOne({ "_id": id }, (err, doc) => {
        if(err) {
            console.error("Failed to load group with id");
            callback();
        } else {
            callback(doc);
        }
    });
}

function getAllGroups(callback) {
    db.groups.find({ "public": true }, (err, docs) => {
        if(err) {
            console.error("Failed to load groups");
            callback();
        } else {
            callback(docs);
        }
    });
}

function getAllUsers(callback) {
    db.users.find({ "public": true }, (err, docs) => {
        if(err) {
            console.error("Failes to load users");
            callback();
        } else {
            callback(docs);
        }
    });
}

function getAllUsersAndGroups(callback) {
    getAllGroups((groups) => {
        getAllUsers((users) => {
            callback(users, groups);
        });
    });
}

function parseUserForTemplates(req) {
    if(req.session && req.session.passport && req.session.passport.user) {
        //Deep copy with JSON trick to avoid modifications to source
        const json = JSON.stringify(req.session.passport.user);
        let user = JSON.parse(json);
        user.admin = user.roles.includes("admin");
        return user;
    } else {
        return undefined;
    }
}

function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

function loadDays(group, year) {
    let days = [];
    const now = getNow();
    //const calendarActive = now.year() == year && now.month == 12;
    const calendarActive = true;
    const calendarDay = 13;

    for(i = 1; i < 25; ++i) {
        let holeClassname = "hole";
        let hatchClassname = "hatch";
        let holeBgImage = undefined;
        let points = undefined;
        let open = false;
        let hatchStyles = undefined;

        const today = calendarActive && calendarDay == i;
        if(today) {
            hatchClassname += " closed today";
        } else if(calendarActive && i < calendarDay) {
            holeClassname += " open";
            hatchClassname += " open";
            holeBgImage = "/images/banana.gif";
            points = randomInteger(1, 26);
            open = true;
        } else {
            hatchClassname += " closed";
        }

        if(open) {
            //transform: rotate(0.5deg) scaleX(0.2);
            const rotate = 0.5;
            const scaleX = 0.15 + 0.2 * Math.random();
            hatchStyles = "transform: rotate(" + rotate + "deg) scaleX(" + scaleX + ");";
        }

        days.push({
            "day": i,
            "winner": undefined,
            "points": points,
            "today": today,
            "holeClassname": holeClassname,
            "hatchClassname": hatchClassname,
            "hatchStyles": hatchStyles,
            "holeBgImage": holeBgImage,
            "open": open
        });
    }
    return shuffle(days);
}

function processGroupYear(user, res, group, year) {

    getScores(2019, group, (scores) => {
        let renderDataObj = getRenderObject(user);
        renderDataObj.year = year;
        renderDataObj.group = group;
        renderDataObj.scores = scores;
        renderDataObj.calendar = loadDays(group, year);
        renderDataObj.title = "JK " + group.name + " " + year; 
        res.render("group", renderDataObj);
    });
}

function getUserRoles(userId, callback) {
    const tokenOptions = { 
            method: 'POST',
            url: 'https://rye.auth0.com/oauth/token',
            headers: { 'content-type': 'application/json'
        }, body: '{"client_id":"' + process.env.AUTH0_CLIENT_ID + '","client_secret":"'
            + process.env.AUTH0_CLIENT_SECRET + '","audience":"https://'
            + process.env.AUTH0_MANAGEMENT_HOST + '/api/v2/","grant_type":"client_credentials"}' };
  
    request(tokenOptions, function (error, response, body) {
        if (error) {
            console.error("Failed to get token");
            callback();
        } else {
            const tokenResponse = JSON.parse(body);
            const rolesOptions = {
                method: 'GET',
                url: "https://" + process.env.AUTH0_MANAGEMENT_HOST + "/api/v2/users/" + userId + "/roles",
                headers: {authorization: "Bearer " + tokenResponse.access_token }
            };
              
            request(rolesOptions, function (error, response, body) {
                if (error) {
                    console.error("Failed to get roles");
                    callback();
                } else {
                    const roleResponse = JSON.parse(body);
                    // Use collect rolenames starting with "jk-"
                    const jkRoles = roleResponse.map(r => r.name)
                        .filter(n => n.startsWith("jk-"))
                        .map(n => n.substring(3));
                    callback(jkRoles);
                }
            });
        }
    });
}

function getYells(query, callback) {
    db.yells.find(query, (err, docs) => {
        if(err) {
            console.error("Failed to query yells");
            callback();
        } else {
            docs.sort((a, b) => { return a.time - b.time }); 
            callback(docs);
        }
    });
}

function getRenderObjectForRequest(req) {
    return getRenderObject(parseUserForTemplates(req));
}

function getRenderObject(user) {
    let renderObject = {
        "rootUrl": process.env.ROOT_URL,
        "user": user,
        "notHome": true,
        "timeZone": process.env.TIMEZONE
    };
    return renderObject;
}

function errorObject(message) {
    return {
        "error": {
            "message": message
        }
    };
}

app.get("/", function (req, res) {
    getAllGroups((groups) => {
        let renderDataObj = getRenderObjectForRequest(req);
        renderDataObj.notHome = false;
        renderDataObj.groups = groups;
        res.render("home", renderDataObj);
    });
});

app.get("/admin", function (req, res) {
    const user = parseUserForTemplates(req);
    if(user && user.admin) {
        getAllUsersAndGroups((users, groups) => {
            let renderDataObj = getRenderObject(user);
            renderDataObj.users = users;
            renderDataObj.groups = groups;
            renderDataObj.title = "JK Hallinta";
            res.render("admin", renderDataObj);
        });
    } else {
        console.warn("Access to admin denied!");
        res.redirect("/");
    }
});

app.get('/yells/:group/:year/:date?', [ check("year").isLength({min: 4, max: 4}) ], function (req, res) {
    const groupName = req.params["group"];
    const year = req.params["year"];
    const date = req.params["date"];

    getGroupWithName(groupName, (group) => {
        if(group) {
            let query;
            if(date) {
                query = { $and: [ { "group": group._id }, { "year": Number(year) }, { "date": date }] };
            } else {
                query = { $and: [ { "group": group._id }, { "year": Number(year) }] };
            }

            getYells(query, (yells) => {
                let resObj = {
                    "group": {
                        "id": group._id,
                        "name": group.name
                    },
                    "year": year,
                    "date": date,
                    "yells": yells
                }
                res.json(resObj);
            });
        } else {
            res.status(500).json(errorObject)
        }
    });
});

app.get('/groups/:group/:year', function (req, res) {

    const groupName = req.params["group"];
    const year = req.params["year"];
    const user =  parseUserForTemplates(req);

    getGroupWithName(groupName, (group) => {
        if(group) {
            processGroupYear(user, res, group, year);
        } else {
            res.redirect("/");
        }
    });
});

app.get('/groups/:group', function (req, res) {
    
    const year = getNow().year();
    const groupName = req.params["group"];
    const user = parseUserForTemplates(req);

    getGroupWithName(groupName, (group) => {
        if(group) {
            processGroupYear(user, res, group, year);
        } else {
            res.redirect("/");
        }
    });
});

app.get('/login', passport.authenticate('auth0', { scope: 'openid email profile' }), function (req, res) {
    console.log("Login called");
    res.redirect('/');
});

app.get('/login_callback', function (req, res, next) {
    console.log("login_callback calles");

    passport.authenticate('auth0', function (err, user, info) {
      if (err) { return next(err); }
      if (!user) { return res.redirect('/login'); }
      req.logIn(user, function (err) {
        if (err) { return next(err); }
        const returnTo = req.session.returnTo;
        delete req.session.returnTo;
        res.redirect(returnTo || '/');
      });
    })(req, res, next);
});

app.get('/logout', (req, res) => {
    console.log("Logout called");
    req.logout();
  
    var returnTo = req.protocol + '://' + req.hostname;
    var port = req.connection.localPort;
    if (port !== undefined && port !== 80 && port !== 443) {
      returnTo += ':' + port;
    }
    var logoutURL = new url.URL(
      util.format('https://%s/v2/logout', process.env.AUTH0_DOMAIN)
    );
    var searchString = querystring.stringify({
      client_id: process.env.AUTH0_CLIENT_ID,
      returnTo: returnTo
    });
    logoutURL.search = searchString;
  
    res.redirect(logoutURL);
});

app.post("/addGroup", [ check("name").isLength({min: 5}) ], (req, res) => {
    const name = req.body.name;
    const user = parseUserForTemplates(req);
    if(!user.admin) {
        res.redirect("/");
        return;
    }

    addGroup(user.id, name, (group) => {
        res.redirect("groups/" + encodeURI(group.name));
    });
});

app.post("/yell", [ check("group").isLength({min: 5}) ], (req, res) => {
    console.log("Somebody yelled!");
    const user = parseUserForTemplates(req);
    if(user == undefined) {
        console.error("Yell not allowed");
        res.status(403).json(errorObject("Please login first"));
    } else {
        const groupId = req.body.group;
        getGroupWithId(groupId, (group) => {
            addYell(user, group._id, (yell) => {
                if(yell) {
                    res.json({ "id": yell._id });
                } else {
                    res.status(500).json(errorObject("System Error"));
                }
            });
        });
    }
});

app.use(express.static("public"));

app.listen(process.env.HTTP_PORT, () => {
    console.log("Server running on port " + process.env.HTTP_PORT);
});

// Schedule timer for midnight of each day
/*
let job = schedule.scheduleJob("1 0 0 1-25 12", function(fireDate){
    console.log('This job was supposed to run at ' + fireDate + ', but actually ran at ' + new Date());
  });
  */