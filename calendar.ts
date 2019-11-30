import { Databases, Yell, YellUser } from "./databases";
import moment = require('moment-timezone');
import shuffle = require('shuffle-array');

export class CalendarDay {
    day : number;
    date: string;
    winner : string | undefined;
    points : number | undefined;
    today : boolean;
    holeClassname: string;
    hatchClassname: string;
    hatchStyles: string;
    holeBgImage: string | undefined;
    open: boolean;

    constructor(year: number, month: number, day: number) {
        this.day = day;
        this.date = this._createDateString(year, month, day);
        this.points = 0;
        this.today = false;
        this.holeClassname = "hole";
        this.hatchClassname = "hatch";
        this.hatchStyles = "";
        this.holeBgImage = undefined;
        this.open = false;
    }

    setOpen(winner : string | undefined, points : number) {
        this.open = true;
        this.winner = winner;
        this.points = points;
    }

    _twoDigits(number : number) {
        if(number == 0) {
            return "00";
        } else if(number < 10) {
            return "0" + number;
        } else {
            return number;
        }
    }

    _createDateString(year : number, month : number, day : number) {
        return year + "-" + this._twoDigits(month) + "-" + this._twoDigits(day);
    }
}

export class Calendar {

    db : Databases;
    timezone : string;
    debugMode : boolean;

    constructor(db : Databases, timezone : string, debugMode : boolean) {

        this.db = db;
        this.timezone = timezone;
        this.debugMode = debugMode;

    }

    _getNow() {
        return moment.tz(this.timezone);
    }

    _generateDays(year : number, groupId : string, winningYells : Yell[], todaysYell : Yell | undefined) : CalendarDay[] {
        let days = [];
        const now = this._getNow();
        let calendarActive = (now.year() == year);
        calendarActive = calendarActive && (this.debugMode || now.month() == 12);
        const calendarDay = now.date();
        const daysInCalendar = this.debugMode ? 31 : 24;
        const month = this.debugMode ? now.month() : 12;
    
        for(let i = 1; i <= daysInCalendar; ++i) {
            let day = new CalendarDay(year, month, i);
    
            day.today = calendarActive == true && (calendarDay == i);
            if(day.today) {
                day.hatchClassname += " closed today";
                if(todaysYell) {
                    day.hatchClassname += " yelled";
                }
            } else if(calendarActive == true && (i < calendarDay)) {

                let winningYell = winningYells.find(yell => yell.date);
                if(winningYell) {
                    day.points = winningYell.points;
                    day.winner = winningYell.user.id;
                    if(winningYell.user.picture) {
                        day.holeBgImage = winningYell.user.picture;
                    }
                }

                day.holeClassname += " open";
                day.hatchClassname += " open";

                day.open = true;
            } else {
                day.hatchClassname += " closed";
            }
    
            if(day.open) {
                //transform: rotate(0.5deg) scaleX(0.2);
                const rotate = 0.5;
                const scaleX = 0.15 + 0.2 * Math.random();
                day.hatchStyles = "transform: rotate(" + rotate + "deg) scaleX(" + scaleX + ");";
            }
            
            days.push(day);
        }

        return shuffle(days);
    }

    loadCalendar(year : number, groupId : string, userId : string, callback: (days : CalendarDay[]) => void ) {
        const todayDate = this.db.formatDate(this._getNow());
        this.db.findYellForDate(year, userId, groupId, todayDate, (todaysYell) => {
            this.db.findWinningYells(year, groupId, (yells) => {
                const days = this._generateDays(year, groupId, yells, todaysYell);
                callback(days);
            });
        });
    }

    _randomInteger(min : number, max : number) {
        return Math.floor(Math.random() * (max - min)) + min;
    }
}