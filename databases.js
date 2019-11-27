const nedb = require("nedb");

module.exports = class Databases {

    constructor(path) {

        // --- Users ---
        this.users = new nedb(path + "/users.db");
        this.users.loadDatabase();
        this.users.ensureIndex({"fieldName": "authIds" }, function(err) {
            if(err) {
                console.error("Failed to index authIds on users: " + err);
            }
        });

        // --- Groups ---
        this.groups = new nedb(path + "/groups.db");
        this.groups.loadDatabase();
        this.groups.ensureIndex({"fieldName": "name", "unique": true }, function(err) {
            if(err) {
                console.error("Failed to index name on groups: " + err);
            }
        });
        this.groups.ensureIndex({"fieldName": "public" }, function(err) {
            if(err) {
                console.error("Failed to index public on groups: " + err);
            }
        });
    
        // --- Yells ---
        this.yells = new nedb(path + "/yells.db");
        this.yells.loadDatabase();
        this.yells.ensureIndex({"fieldName": "user.id"}, function(err) {
            if(err) {
                console.error("Failed to index user.id on yells: " + err);
            }
        });
        this.yells.ensureIndex({"fieldName": "year"}, function(err) {
            if(err) {
                console.error("Failed to index year on yells:" + err);
            }
        });
        this.yells.ensureIndex({"fieldName": "date"}, function(err) {
            if(err) {
                console.error("Failed to index date on yells:" + err);
            }
        });
        this.yells.ensureIndex({"fieldName": "group"}, function(err) {
            if(err) {
                console.error("Failed to index group on yells:" + err);
            }
        });

        // --- Scores ---
        this.scores = new nedb(path + "/scores.db");
        this.scores.loadDatabase();
        this.scores.ensureIndex({"fieldName": "year"}, function(err) {
            if(err) {
                console.error("Failed to index year on scores: " + err);
            }
        });
        this.scores.ensureIndex({"fieldName": "user"}, function(err) {
            if(err) {
                console.error("Failed to index username on scores: " + err);
            }
        });
        this.scores.ensureIndex({"fieldName": "group"}, function(err) {
            if(err) {
                console.error("Failed to index group on scores: " + err);
            }
        });

        // --- Targets ---
        this.targets = new nedb(path + "/targets.db");
        this.targets.loadDatabase();
        this.targets.ensureIndex({"fieldName": "year"}, function(err) {
            if(err) {
                console.error("Failed to index year on targets: " + err);
            }
        });
        this.targets.ensureIndex({"fieldName": "group"}, function(err) {
            if(err) {
                console.error("Failed to index group on targets: " + err);
            }
        });
    }
}