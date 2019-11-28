import Nedb = require('nedb');
import Moment = require('moment-timezone');
import moment = require('moment-timezone');

const DATABASES_DATE_FORMAT : string = "YYYY-MM-DD";

export class Document {
    _id: string | undefined;
}

export class User extends Document {
    authIds: string[] = [];
    name: string = "";
    email: string | undefined;
    picture: string | undefined;
    groups: string[] = [];
    createdAt: string | undefined;
    lastLogin: string | undefined;
    public: boolean = true;
}

export class YellUser {
    id: string | undefined;
    name: string | undefined;
    email: string  | undefined;
    picture: string | undefined;

    constructor(id : string, name : string, email : string | undefined, picture : string | undefined) {
        this.id = id;
        this.name = name;
        this.picture = picture;
    }
}

export class Yell extends Document {
    user: YellUser;
    date: string;
    time: string;
    year: number;
    groupId: string;
    ignoredYells: string[];

    constructor(user : YellUser, groupId : string, moment : Moment.Moment) {
        super();
        this.user = user;
        this.year = moment.year();
        this.date = moment.format(DATABASES_DATE_FORMAT);
        this.time = moment.format();
        this.groupId = groupId;
        this.ignoredYells = [];
    }
}

export class Group extends Document {
    name: string | undefined;
    public: boolean = true;
    createdAt: string | undefined;
    createdBy: string | undefined;
}

export class Score extends Document {
    userId: string;
    groupId : string;
    year : number;
    points : number;

    constructor(userId : string, groupId : string, year : number, points : number) {
        super();
        this.userId = userId;
        this.groupId = groupId;
        this.year = year;
        this.points = points;
    }

}

export class Target extends Document {
    groupId : string;
    date : string;
    time : string;
    year : number;

    constructor(groupId : string, year : number, date : string, time : string) {
        super();
        this.groupId = groupId;
        this.year = year;
        this.date = date;
        this.time = time;
    }
}

export class Databases {

    path: string;
    users: Nedb<User>;
    groups: Nedb<Group>;
    yells: Nedb<Yell>;
    scores: Nedb<Score>;
    targets: Nedb<Target>;

    constructor(path : string) {

        this.path = path;

        // --- Users ---
        this.users = new Nedb<User>(path + "/users.db");
        this.users.loadDatabase();
        this.users.ensureIndex({"fieldName": "authIds" }, (err : Error) => {
            if(err) {
                console.error("Failed to index authIds on users: " + err.message);
            }
        });

        // --- Groups ---
        this.groups = new Nedb<Group>(path + "/groups.db");
        this.groups.loadDatabase();
        this.groups.ensureIndex({"fieldName": "name", "unique": true }, (err: Error) => {
            if(err) {
                console.error("Failed to index name on groups: " + err.message);
            }
        });
        this.groups.ensureIndex({"fieldName": "public" }, (err: Error) => {
            if(err) {
                console.error("Failed to index public on groups: " + err.message);
            }
        });
    
        // --- Yells ---
        this.yells = new Nedb<Yell>(path + "/yells.db");
        this.yells.loadDatabase();
        this.yells.ensureIndex({"fieldName": "user.id"}, (err : Error) => {
            if(err) {
                console.error("Failed to index user.id on yells: " + err.message);
            }
        });
        this.yells.ensureIndex({"fieldName": "year"}, (err : Error) => {
            if(err) {
                console.error("Failed to index year on yells:" + err.message);
            }
        });
        this.yells.ensureIndex({"fieldName": "date"}, (err : Error) => {
            if(err) {
                console.error("Failed to index date on yells:" + err.message);
            }
        });
        this.yells.ensureIndex({"fieldName": "groupId"}, (err : Error) => {
            if(err) {
                console.error("Failed to index group on yells:" + err.message);
            }
        });

        // --- Scores ---
        this.scores = new Nedb<Score>(path + "/scores.db");
        this.scores.loadDatabase();
        this.scores.ensureIndex({"fieldName": "year"}, (err : Error) => {
            if(err) {
                console.error("Failed to index year on scores: " + err.message);
            }
        });
        this.scores.ensureIndex({"fieldName": "user"}, (err : Error) => {
            if(err) {
                console.error("Failed to index username on scores: " + err.message);
            }
        });
        this.scores.ensureIndex({"fieldName": "group"}, (err : Error) => {
            if(err) {
                console.error("Failed to index group on scores: " + err.message);
            }
        });

        // --- Targets ---
        this.targets = new Nedb<Target>(path + "/targets.db");
        this.targets.loadDatabase();
        this.targets.ensureIndex({"fieldName": "year"}, (err : Error) => {
            if(err) {
                console.error("Failed to index year on targets: " + err.message);
            }
        });
        this.targets.ensureIndex({"fieldName": "groupId"}, (err : Error) => {
            if(err) {
                console.error("Failed to index groupId on targets: " + err.message);
            }
        });
        this.targets.ensureIndex({"fieldName": "date"}, (err : Error) => {
            if(err) {
                console.error("Failed to index date on targets: " + err.message);
            }
        });
    }

    _handleSingleError<T>(query : any, error: Error, message: string, callback: (doc: T | undefined) => void) {
        console.error(message);
        console.error(error.message);
        if(query) {
            console.error(JSON.stringify(query));
        }
        callback(undefined);
    }

    _handleArrayError<T>(query : any, error: Error, message: string, callback: (docs: T[]) => void) {
        console.error(message);
        console.error(error.message);
        if(query) {
            console.error(JSON.stringify(query));
        }
        callback([]);
    }

    _queryDocs<T>(db: Nedb<T>, docType : string, query : any, callback: (docs : T[]) => void) {
        db.find(query, (err : Error, docs : T[]) => {
            if(err) {
                this._handleArrayError(query, err, "Failed to load " + docType, callback);
            } else {
                callback(docs);
            }
        });
    }

    _queryDoc<T>(db: Nedb<T>, docType : string, query : any, callback: (docs : T | undefined) => void) {
        db.findOne(query, (err : Error, doc : T) => {
            if(err) {
                this._handleSingleError(query, err, "Failed to load a score", callback);
                console.error(err.message);
                console.error("Failed to load " + docType + " for: " + JSON.stringify(query));
                callback(undefined);
            } else {
                callback(doc);
            }
        });
    }

    _getNow() : string {
        return Moment.tz().format();
    }

    queryTargets(query : any, callback: (docs : Target[]) => void) {
        this._queryDocs<Target>(this.targets, "targets", query, callback);
    }

    queryGroups(query: any, callback: (docs: Group[]) => void) {
        this._queryDocs<Group>(this.groups, "groups", query, callback);
    }

    queryUsers(query: any, callback: (docs: User[]) => void) {
        this._queryDocs<User>(this.users, "users", query, callback);
    }

    queryScores(query: any, callback: (docs: Score[]) => void) {
        this._queryDocs<Score>(this.scores, "scores", query, callback);
    }

    queryYell(query: any, callback: (doc: Yell | undefined) => void) {
        this._queryDoc(this.yells, "yells", query, callback);
    }

    queryYells(query : any, callback: (docs: Yell[]) => void) {
        this._queryDocs<Yell>(this.yells, "yells", query, callback);
    }

    queryGroup(query: any, callback: (doc: Group | undefined) => void) {
        this._queryDoc(this.groups, "groups", query, callback);
    }

    queryUser(query: any, callback: (doc: object | undefined) => void) {
        this._queryDoc(this.users, "users", query, callback);
    }

    queryScore(query: any, callback: (doc: Score | undefined) => void) {
        this._queryDoc(this.scores, "scores", query, callback);
    }

    queryTarget(query: any, callback: (doc: Target | undefined) => void) {
        this._queryDoc(this.targets, "targets", query, callback);
    }

    findTargetsForGroup(groupId : string, year : number, callback : (docs: object[]) => void) {
        const query = { $and: { "groupId" : groupId, "year" : year } };
        this.queryTargets(query, callback);
    }

    findTarget(groupId : string, year : number, date : string, callback : (doc: Target | undefined) => void) {
        const query = { $and: { "groupId" : groupId, "year" : year, "date": date } };
        this.queryTarget(query, callback);
    }

    findAllGroups(callback: (callback: Group[]) => void) {
        const query = {};
        this.queryGroups(query, callback);
    };

    findAllPublicGroups(callback: (callback: Group[]) => void) {
        const query = { "public": true };
        this.queryGroups(query, callback);
    };

    findGroupWithName(name : string, callback: (doc : Group | undefined) => void) {
        const query = { "name": name };
        this.queryGroup(query, callback);
    }
    
    findGroupWithId(id : string, callback: (doc : object | undefined) => void) {
        const query = { "_id": id };
        this.queryGroup(query, callback);
    }

    findAllUsers(callback: (docs: object[]) => void) {
        const query = { "public": true };
        this.queryUsers(query, callback);
    }
    
    findAllUsersAndGroups(callback: (users: object[], groups: object[]) => void) {
        this.findAllGroups((groups : object[]) => {
            this.findAllUsers((users: object[]) => {
                callback(users, groups);
            });
        });
    }

    findUserWithId(id : string, callback: (users: User | undefined) => void) {
        const query = { "_id": id };
        this._queryDoc<User>(this.users, "users", query, callback);
    }

    findUserWithAuthId(authId : string, callback: (users: User | undefined) => void) {
        const query = { "authIds": authId };
        this._queryDoc<User>(this.users, "users", query, callback);
    }

    findYellWithId(id : string, callback: (yell: Yell | undefined) => void) {
        const query = { "_id": id };
        this._queryDoc<Yell>(this.yells, "users", query, callback);
    }

    addGroup(userId : string, name : string, callback: (doc: Group | undefined) => void) {
        this.findGroupWithName(name, (doc) => {
            if(!doc) {
                callback(undefined);
            } else {
                let doc = new Group();
                doc.name = name;
                doc.createdAt = this._getNow();
                doc.createdBy = userId;
                this.groups.insert(doc, (err, finalDoc) => {
                    if(err) {
                        callback(undefined);
                    } else {
                        callback(finalDoc);
                    }
                })
            }
        });
    }

    updateScore(userId : string, groupId : string, year : number, pointDiff : number, callback: (score : Score | undefined) => void) {
        const scoreQuery = { $and: { "groupId": groupId, "userId": userId, "year": year } };
        this.queryScore(scoreQuery, (score) => {
            if(score) {
                score.points += pointDiff;
                this.scores.update({ "_id": score._id }, { $set: { "points": score.points }}, {}, (err, updated) => {
                    if(err) {
                        this._handleSingleError(undefined, err, "Failed to update a score", callback);
                    } else {
                        callback(score);
                    }
                });
            } else {
                let newScore = new Score(userId, groupId, year, pointDiff);
                this.scores.insert(newScore, (err, newDoc) => {
                    if(err) {
                        this._handleSingleError(newScore, err, "Failed to insert a score", callback);
                    } else {
                        callback(newScore);
                    }
                });
            }
        });
    }

    findOrCreateUser(authId: string, name: string, email: string, picture: string, callback: (user: User | undefined) => void) {
        this.findUserWithAuthId(authId, (oldUser) => {
            const now = this._getNow();
            if(oldUser) {
                oldUser.lastLogin = now;
                this.users.update({ "_id": oldUser._id }, { $set: { "lastLogin" : oldUser.lastLogin } }, {}, (err, numReplaced, upsert) => {
                    if(err) {
                        this._handleSingleError(undefined, err, "Failed to update user", callback);
                    } else {
                        callback(oldUser);
                    }
                });
            } else {
                let newUser = new User();
                newUser.authIds.push(authId);
                newUser.name = name;
                newUser.email = email;
                newUser.picture = picture;
                newUser.createdAt = now;
                newUser.lastLogin = now;
                this.users.insert(newUser, (err, storedUser) => {
                    if(err) {
                        this._handleSingleError(newUser, err, "Failed to insert user", callback);
                    } else {
                        callback(storedUser);
                    }
                });
            }
        });
    }

    addYell(userId : string, groupId : string, now : Moment.Moment, callback: (yell: Yell | undefined) => void) {
        const year = now.year();
        const date = this.formatDate(now);
        const time = now.format();
        const yellQuery = { $and: [ { "user.id" : userId }, { "groupId" : groupId }, { "year" : year }, { "date" : date } ]};

        this.queryYell(yellQuery, (oldYell) => {
            if(oldYell) {
                if(oldYell.time) {
                    oldYell.ignoredYells.push(oldYell.time);
                }
                oldYell.time = time;
                this.yells.update({ "_id": oldYell._id }, { $set: { "time" : oldYell.time, "ignoredYells" : oldYell.ignoredYells } },
                    {}, (err, numReplaced) => {

                    if(err) {
                        this._handleSingleError(null, err, "Failed to update yell", callback);
                    } else {
                        callback(oldYell);
                    }
                });
            } else {
                this.findUserWithId(userId, (user) => {
                    if(!user) {
                        console.error("Failed to find user with id " + userId);
                        callback(undefined);
                    } else {
                        let yellUser = new YellUser(userId, user.name, user.email, user.picture);
                        let newYell = new Yell(yellUser, groupId, now);
                        this.yells.insert(newYell, (err, newYell) => {
                            if(err) {
                                this._handleSingleError(newYell, err, "Failed to insert new yell", callback);
                            } else {
                                callback(newYell);
                            }
                        });
                    }        
                })
            }
        });
    
    }

    findScores(year : number, groupId : string, callback: ( scores : Score[]) => void) {
        const query = { $and: [{ "year" : year}, { "groupId" : groupId}]};
        this.queryScores(query, callback);
    }

    addTarget(groupId : string, moment : moment.Moment, callback: (target : Target | undefined) => void) {
        const year = moment.year();
        const date = this.formatDate(moment);
        const time = moment.format();

        const query = { $and: [{ "year" : year}, { "groupId" : groupId}, { "date": date }]};
        this.queryTarget(query, (oldTarget) => {
            if(oldTarget) {
                console.warn("Updating existing target: " + oldTarget._id);
                oldTarget.time = time;
                this.targets.update({ "_id": oldTarget._id }, { $set: { "time": oldTarget.time }}, {}, (err, nou, ups) => {
                    if(err) {
                        this._handleSingleError(null, err, "Failed to insert score", callback);
                    } else {
                        callback(oldTarget);
                    }
                });
            } else {
                let newTarget = new Target(groupId, year, date, time);
                this.targets.insert(newTarget, (err, newTarget) => {
                    if(err) {
                        this._handleSingleError(newTarget, err, "Failed to insert target", callback);
                    } else {
                        callback(newTarget);
                    }
                });
            }
        })
    }


    formatDate(moment : moment.Moment) : string {
        return moment.format(DATABASES_DATE_FORMAT);
    }
}