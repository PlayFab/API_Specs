var https = require("https");
var fs = require('fs');

var argsDict = null;

function WriteApiFile(filename, body, descriptor) {
    body = TabifyJson(body, descriptor);
    if (body === null) {
        console.log("  ***  Failed to write: " + descriptor);
        return;
    }
    var fullFileName = filename + ".json";
    console.log("Begin writing: " + fullFileName);
    fs.writeFile(fullFileName, body, function (err) {
        if (err)
            return console.log(err);
        console.log("Finished writing: " + fullFileName);
    });
}

function TabifyJson(inputJson, descriptor) {
    console.log("Begin tabifying: " + descriptor);
    var output = null;
    try {
        var tempObj = JSON.parse(inputJson);
        output = JSON.stringify(tempObj, null, 2);
        console.log("Finish tabifying: " + descriptor);
    } catch (e) {
        console.log("  ***  Failed to stringify: " + descriptor);
        output = null;
    }
    
    return output;
}

function GetApiFile(inputUrl, outputFilename, descriptor) {
    console.log("Begin reading: " + inputUrl);
    var rawResponse = "";
    var postReq = https.get(inputUrl, function (res) {
        res.setEncoding("utf8");
        res.on("data", function (chunk) { rawResponse += chunk; });
        res.on("end", function () {
            console.log("Finished reading: " + inputUrl);
            WriteApiFile(outputFilename, rawResponse, descriptor)
        });
    });
}

function ExtractArgs(args) {
    var cmdArgs = args.slice(2, args.length);
    var argsByName = {};
    var activeKey = null;
    for (var i = 0; i < cmdArgs.length; i++) {
        if (cmdArgs[i].indexOf("-") === 0) {
            activeKey = cmdArgs[i].substring(1);
            argsByName[activeKey] = "";
        } else if (activeKey == null) {
            throw "Unexpected token: " + cmdArgs[i];
        } else {
            var temp = argsByName[activeKey];
            if (temp.length > 0)
                argsByName[activeKey] = temp + " " + cmdArgs[i];
            else
                argsByName[activeKey] = cmdArgs[i];
        }
    }

    // Pull from environment variables?
    // process.env.hasOwnProperty("varname")
    return argsByName;
}

var argsDict = ExtractArgs(process.argv);

GetApiFile("https://www.playfabapi.com/apispec/AdminAPI", "Admin.api", "Admin-Api");
GetApiFile("https://www.playfabapi.com/apispec/ClientAPI", "Client.api", "Client-Api");
GetApiFile("https://www.playfabapi.com/apispec/EntityAPI", "Entity.api", "Entity-Api");
GetApiFile("https://www.playfabapi.com/apispec/MatchmakerAPI", "Matchmaker.api", "Matchmaker-Api");
GetApiFile("https://www.playfabapi.com/apispec/ServerAPI", "Server.api", "Server-Api");

GetApiFile("https://www.playfabapi.com/apispec/PlayStreamEventModels", "PlayStreamEventModels", "Client-Api");
GetApiFile("https://www.playfabapi.com/apispec/PlayStreamCommonEventModels", "PlayStreamCommonEventModels", "Client-Api");
GetApiFile("https://www.playfabapi.com/apispec/PlayStreamProfileModel", "PlayStreamProfileModels", "Client-Api");
