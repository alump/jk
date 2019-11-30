function yell(event, url, groupId) {
    console.log("Yelling at " + groupId);
    let request = {
        "group": groupId
    };

    fetch(url, {
        method: 'POST',
        body: JSON.stringify(request),
        headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => response.json())
    .then(data => {
        if(data.error) {
            console.error(data.error.message);
        } else if(data.id) {
            event.target.classList.add("yelled");
            console.log("yelled " + data.id);
        } else {
            console.error("What went wrong?");
        }
    })
    .catch(error => console.error(error.message));
}

function createCell(parent, type, innerText) {
    let header = document.createElement(type);
    header.innerText = innerText;
    parent.appendChild(header);
    return header;
}

function showYells(targetId, data) {
    let target = document.getElementById(targetId);

    while (target.firstChild) {
        target.firstChild.remove();
    }

    let infoText = data.group.name + " (" + data.year + ")";
    if(data.date) {
        infoText += " " + data.date;
        if(data.target) {
            infoText += " " + moment(data.time).format("LTS");
        }
    }
    infoText += ":";
    let infoElement = document.createElement("div");
    infoElement.className = "info";
    infoElement.innerText = infoText;
    target.appendChild(infoElement);

    let table = document.createElement("table");
    table.className = "log";
    target.appendChild(table);

    let headerRow = document.createElement("tr");
    createCell(headerRow, "th", "Päivä");
    createCell(headerRow, "th", "Aika");
    if(!data.date) {
        createCell(headerRow, "th", "Kohde");
    }
    createCell(headerRow, "th", "Ero");
    createCell(headerRow, "th", "Huutaja");
    createCell(headerRow, "th", "Huutoja");
    table.appendChild(headerRow);


    data.yells.forEach(yell => {
        let row = document.createElement("tr");
        if(yell.winning) {
            row.className = "winner";
        }
        let mtime = moment(yell.time);
        let ttime = yell.target ? moment(yell.target) : undefined;
        let diff = ttime ? ("" + ttime.diff(mtime, "seconds") + " s") : "n/a";
        let ttimepres = ttime ? ttime.format("LTS") : "n/a";

        createCell(row, "td", mtime.format("L"));
        createCell(row, "td", mtime.format("LTS"));
        if(!data.date) {
            createCell(row, "td", ttimepres);
        }
        createCell(row, "td", diff);
        createCell(row, "td", yell.user.name);
        createCell(row, "td", 1 + yell.ignoredYells.length);
        table.appendChild(row);
    });

    target.style.display = "block";
}

function loadYesterdaysYells(targetId, url) {
    const date = moment().subtract(1, 'days').format("YYYY-MM-DD");
    loadYells(targetId, url + "/" + date);
}

function loadYells(targetId, url) {
    console.log("Loading yells...");

    fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    })
    .then(response => response.json())
    .then(data => {
        if(data.error) {
            window.alert("FAIL: " + data.error.message);
            console.error(data.error.message);
        } else if(data.yells) {
            showYells(targetId, data);
        } else {
            window.alert("MULTI FAIL!");
            console.error("What went wrong?");
        }
    })
    .catch(error => console.error(error.message));
}