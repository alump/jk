// Dependencies
const dotenv = require('dotenv').config();
const express = require("express");
const exphbd = require("express-handlebars");
const moment = require('moment-timezone');
const { check, validationResult } = require('express-validator');
const session = require('express-session');
const passport = require('passport');
const Auth0Strategy = require('passport-auth0');
const request = require("request");
const url = require('url');
const util = require('util');
const fs = require('fs');

// Project files
const Databases = require("./dist/databases.js").Databases;
const scheduler = require("./dist/scheduler.js").Scheduler;
const Calendar = require("./dist/calendar.js").Calendar;
const packageJson = require("./package.json");

const db = new Databases(process.env.DATABASE_PATH);
const calendar = new Calendar(db, process.env.TIMEZONE, process.env.DEBUG_MODE);

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
    saveUninitialized: true,
    store: db.getSessionsStore()
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

        db.findOrCreateUser(sessionUser.authId, sessionUser.displayName, sessionUser.email, sessionUser.picture, (dbUser) => {
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


function processGroupYear(user, res, group, year) {

    db.findScores(2019, group._id, (scores) => {
        db.findTargetsForGroup(group._id, year, (targets) => {
            const userId = user ? user.id : undefined;
            calendar.loadCalendar(year, group._id, userId, (calendar) => {
                loadRules((rules) => {
                    let renderDataObj = getRenderObject(user);
                    renderDataObj.year = year;
                    renderDataObj.group = group;
                    renderDataObj.scores = scores;
                    renderDataObj.calendar = calendar;
                    renderDataObj.title = "JK " + group.name + " " + year;
                    renderDataObj.rules = rules;
                    res.render("group", renderDataObj);
                });
            });
        });
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

function getRenderObjectForRequest(req) {
    return getRenderObject(parseUserForTemplates(req));
}

function getRenderObject(user) {
    let renderObject = {
        "rootUrl": process.env.ROOT_URL,
        "user": user,
        "notHome": true,
        "timeZone": process.env.TIMEZONE,
        "debug": process.env.DEBUG_MODE
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

function loadRules(callback) {
    fs.readFile('public/html/rules.html', function(err, data) {
        if(err) {
            console.error("Failed to read rules");
            callback();
        } else {
            callback(data);
        }
    });
}

app.get("/", function (req, res) {
    db.findAllGroups((groups) => {
        let renderDataObj = getRenderObjectForRequest(req);
        renderDataObj.notHome = false;
        renderDataObj.groups = groups;

        if(renderDataObj.user) {
            db.findUsersGroups(renderDataObj.user.id, (userGroups) => {
                renderDataObj.userGroups = userGroups;
                res.render("home", renderDataObj);
            });
        } else {
            res.render("home", renderDataObj);
        }
    });
});

app.get("/admin", function (req, res) {
    const user = parseUserForTemplates(req);
    if(user && user.admin) {
        db.findAllUsersAndGroups((users, groups) => {
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
    //TODO: make sure date is in the past
    const todayString = db.formatDate(getNow());

    db.findGroupWithName(groupName, (group) => {
        if(group) {
            db.findTargetsForYear(year, group._id, (targetsForYear) => {
                let query;
                if(date) {
                    query = { $and: [ { "groupId": group._id }, { "year": Number(year) }, { "date": date }] };
                } else {
                    query = { $and: [ { "groupId": group._id }, { "year": Number(year) }] };
                }

                db.queryYells(query, (yells) => {
                    let filteredYells = yells.filter(y => (y.date !== todayString));
                    filteredYells.forEach(y => y.target = targetsForYear.findTimeForDate(y.date));

                    let resObj = {
                        "group": {
                            "id": group._id,
                            "name": group.name
                        },
                        "year": year,
                        "date": date,
                        "yells": filteredYells
                    }

                    if(date) {
                        resObj.target = targetsForYear.findTimeForDate(date);
                    }

                    res.json(resObj);
                });
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

    db.findGroupWithName(groupName, (group) => {
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
    var searchString = JSON.stringify({
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

    db.addGroup(user.id, name, (group) => {
        res.redirect("groups/" + encodeURI(group.name));
    });
});

app.post("/yell", [ check("group").isLength({min: 5}) ], (req, res) => {
    const today = getNow();
    if(today.month() != 12) {
        res.status(400).json(errorObject("Ei ole vielä joulukuu!"));
        return;
    } else if(today().date() > 24) {
        res.status(400).json(errorObject("Joulu meni jo!"));
        return;
    }

    const user = parseUserForTemplates(req);
    if(user == undefined) {
        console.error("Yell not allowed");
        res.status(403).json(errorObject("Please login first"));
    } else {
        const groupId = req.body.group;
        db.findGroupWithId(groupId, (group) => {
            db.addYell(user.id, group._id, getNow(), (yell) => {
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
const schedule = new scheduler(process.env.TIMEZONE, db, process.env.DEBUG_MODE);