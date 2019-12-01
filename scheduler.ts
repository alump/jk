import moment = require('moment-timezone');
import nodeSchedule = require('node-schedule');
import { Databases, Yell, Group, TargetsForYear } from './databases';

export class Scheduler {

    targetTimezone : string;
    db : Databases;
    debugMode : boolean;

    _beforeMidnightJob :nodeSchedule.Job;
    _pastMidnightJob : nodeSchedule.Job;

    constructor(targetTimezone : string, db : Databases, debugMode : boolean) {

        this.targetTimezone = targetTimezone;
        this.db = db;
        this.debugMode = debugMode;

        const nowInTarget = moment.tz(targetTimezone);

        const beforeMidnightInTarget = moment.tz(nowInTarget.year() + "-11-30 23:55:00", targetTimezone);
        const pastMidnightInTarget = moment.tz(nowInTarget.year() + "-12-01 00:00:01", targetTimezone);
        const systemTimezone = moment.tz.guess();

        const beforeMidnightInSystem = beforeMidnightInTarget.tz(systemTimezone);
        const postMidnightInSystem = pastMidnightInTarget.tz(systemTimezone);

        // --- Before midnight to update targets
        let beforeMidnightScheduling = 
            beforeMidnightInSystem.seconds()
            + " " + beforeMidnightInSystem.minutes()
            + " " + beforeMidnightInSystem.hours()
            + " * 11-12 *";
        //if(debugMode) {
        //    console.warn("Override scheduling with debug mode");
        //    beforeMidnightScheduling = "0 58 * * * *";
        //}

        // --- Past midnight to find winners ---
        let pastMidnightScheduling = 
            postMidnightInSystem.seconds()
            + " " + postMidnightInSystem.minutes()
            + " " + postMidnightInSystem.hours()
            + " * 11-12 *";
        //if(debugMode) {
        //    console.warn("Override scheduling with debug mode");
        //    pastMidnightScheduling = "1 0 * * * *";
        //}

        const that = this;

        console.log("Scheduling before midnight checks to: " + beforeMidnightScheduling);
        this._beforeMidnightJob = nodeSchedule.scheduleJob(beforeMidnightScheduling, (fireDate) => that.beforeMidnightCheck());
        
        console.log("Scheduling past midnight checks to: " + pastMidnightScheduling);
        this._pastMidnightJob = nodeSchedule.scheduleJob(pastMidnightScheduling, (fireDate) => that.afterMidnightCheck());
    }

    _getNow() : moment.Moment {
        return moment.tz(this.targetTimezone);
    }

    _randomInteger(min : number, max : number) : number {
        return Math.floor(Math.random() * (max - min)) + min;
    }

    _randomTime(today : moment.Moment) : moment.Moment {
        let random = today.clone();
        // Generate todays target
        let randomTimeProcessed = this._randomInteger(1, 60 * 60 * 24 - 2);
        const randomSeconds = randomTimeProcessed % 60;
        randomTimeProcessed = Math.floor(randomTimeProcessed / 60);
        const randomMinutes = randomTimeProcessed % 60;
        randomTimeProcessed = Math.floor(randomTimeProcessed / 60);
        const randomHours = randomTimeProcessed;
        return random.hour(randomHours).minutes(randomMinutes).second(randomSeconds);
    }

    _yellArrayToDates(yells : Yell[]) : string[] {
        let dates : string[] = [];

        yells.map(y => y.date).forEach(date => {
            if(!dates.includes(date)) {
                dates.push(date);
            }
        });

        return dates;
    }

    _yellArrayToUserIds(yells : Yell[]) : string[] {
        let userIds : string[] = [];

        yells.map(y => y.user.id).forEach(userId => {
            if(userId && !userIds.includes(userId)) {
                userIds.push(userId);
            }
        });

        return userIds;
;
    }

    _secondDiffToPoints(seconds : number) {
        return Math.floor(seconds / 60 / 60) + 1;
    }

    _findWinnerForDay(yells : Yell[], target : string, callback: (userId : string, points : number) => void) {
        let bestDiff = 60 * 60 * 25;
        let points = 0;
        let leader : string | undefined;
        let winningYellId : string | undefined;
        const targetMoment = moment.tz(target);

        yells.forEach(yell => {
            let yellMoment = moment().tz(yell.time);
            let yellDiff = Math.abs(yellMoment.diff(targetMoment, "seconds"));
            if(yellDiff < bestDiff) {
                bestDiff = yellDiff;
                points = this._secondDiffToPoints(yellDiff);
                leader = yell.user.id;
                winningYellId = yell._id;
            }
        });

        if(leader) {
            if(winningYellId) {
                this.db.updateYell(winningYellId, true, points);
            }
            callback(leader, points);
        }
    }

    _convertToScores(year : number, group : Group, targetsForYear : TargetsForYear, yells : Yell[]) {
        const groupId = group._id;
        const todayString = this.db.formatDate(this._getNow());

        if(groupId) {
            let dates = this._yellArrayToDates(yells);

            let userIdToPoints : any = {};
            this._yellArrayToUserIds(yells).forEach(userId => userIdToPoints[userId] = 0);

            dates.filter(d => d < todayString).forEach(date => {
                const targetOfTheDay = targetsForYear.findTimeForDate(date);
                if(targetOfTheDay) {
                    let yellsOfTheDay = yells.filter(y => y.date == targetOfTheDay);

                    this._findWinnerForDay(yellsOfTheDay, targetOfTheDay, (winnerUserId, winnerPoints) => {
                        userIdToPoints[winnerUserId] += winnerPoints;
                    });

                } else {
                    console.error("Failed to locate target for day with yells! " + group._id + " " + date);
                }
            });

            Object.keys(userIdToPoints).forEach(userId => {
                this.db.updateScore(userId, groupId, year, userIdToPoints[userId], (score) => {
                });
            });
        }
    }

    recalculateScores() {
        const now = this._getNow();
        const year = now.year();

        this.db.findAllGroups((groups) => {
            groups.forEach(group => {
                if(group._id) {
                    const groupId : string = group._id;
                    this.db.findTargetsForYear(year, groupId, (yearTargets) => {
                        this.db.findYellsForGroup(year, groupId, (yells) => {
                            this._convertToScores(year, group, yearTargets, yells);
                        });
                    });
                }
            });
        });
    }

    beforeMidnightCheck() {
        console.log("Before midnight check at " + this._getNow().format());

        const today = moment.tz(this.targetTimezone);
        const tomorrow = today.add(1, "days");

        this.db.findAllGroups((groups) => {
            groups.forEach(group => {
                let randomTime = this._randomTime(tomorrow);

                if(group._id) {
                    this.db.addTarget(group._id, randomTime, (target) => {
                        if(target) {
                            console.log("Target created for " + group.name + " @ " + target.date);
                        } else {
                            console.error("Failed to create target for " + group._id + " " + randomTime.format());
                        }
                    });
                }
            });
        });
    }

    afterMidnightCheck() {
        console.log("After midnight check at " + this._getNow().format());
        this.recalculateScores();
    }
}