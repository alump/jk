import moment = require('moment-timezone');
import nodeSchedule = require('node-schedule');
import { Databases } from './databases';

export class Scheduler {

    targetTimezone : string;
    db : Databases;
    _job : nodeSchedule.Job;

    constructor(targetTimezone : string, db : Databases) {

        this.targetTimezone = targetTimezone;
        this.db = db;

        const nowInTarget = moment.tz(targetTimezone);
        const compareDate = nowInTarget.year() + "-12-01 00:00:01";
        const midnightInTarget = moment.tz(compareDate, targetTimezone);
        console.log("Target time: " + midnightInTarget.format());
        const systemTimezone = moment.tz.guess();
        const midnightInSystem = midnightInTarget.tz(systemTimezone);
        console.log("System time: " + midnightInSystem.format());

        const scheduleString =
            midnightInSystem.seconds()
            + " " + midnightInSystem.minutes()
            + " " + midnightInSystem.hours()
            + " * 11-12 *";

        console.log("Scheduling midnight checks to: " + scheduleString);

        const that = this;
        this._job = nodeSchedule.scheduleJob(scheduleString, (fireDate) => that.afterMidnightCheck());
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
        return random.hour(randomHours).min(randomMinutes).second(randomSeconds);
    }

    afterMidnightCheck() {
        const today = moment.tz(this.targetTimezone);
        const yesterday = today.add(-1, "days");

        console.log("Yesterday: " + yesterday.format());
        console.log("Today: " + today.format());

        const todayYear = today.year();
        const todayDate = this.db.formatDate(today);


        this.db.findAllGroups((groups) => {
            groups.forEach(group => {
                let randomTime = this._randomTime(today);

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
}