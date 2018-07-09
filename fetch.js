var https = require("https");
var fs = require("fs");

var argsDict = null;

function WriteJsonFile(filename, jsonBody, descriptor) {
    if (jsonBody === null) {
        console.log("  ***  Failed to write: " + descriptor);
        return;
    }
    if (!filename.endsWith(".json"))
        filename = filename + ".json";
    console.log("  -> Begin writing: " + filename);
    fs.writeFile(filename, jsonBody, function (err) {
        if (err)
            return console.log(err);
        console.log("  <- Finished writing: " + filename);
    });
}

function TabifyJson(inputJson, descriptor, tabSpaces) {
    console.log("  Begin tabifying: " + descriptor);
    var output = null;
    if (!tabSpaces) tabSpaces = 2;
    try {
        var tempObj = JSON.parse(inputJson);
        output = JSON.stringify(tempObj, null, tabSpaces);
        console.log("  Finish tabifying: " + descriptor);
    } catch (e) {
        console.log("  ***  Failed to stringify: " + descriptor);
        output = null;
    }

    return output;
}

function UpdateVersionNumbers(verJson) {
    console.log("  Begin version numbers");

    var versionRe = new RegExp("([0-9]+)\.([0-9]+)\.[0-9][0-9][0-9][0-9][0-9][0-9]");
    var now = new Date();
    var todaysDate = (now.getUTCFullYear()%100).toString().padStart(2, "0") + (now.getMonth()+1).toString().padStart(2, "0") + (now.getUTCDate()).toString().padStart(2, "0");
    var output = JSON.parse(verJson);
    var versions = output.sdkVersion;
    for (var i in versions) {
        var eachTempVer = versions[i];
        if (typeof(eachTempVer) !== "string") continue;
        var reMatch = eachTempVer.match(versionRe);
        if (!reMatch) continue;

        var majorVer = parseInt(reMatch[1]);
        var minorVer = parseInt(reMatch[2]);
        if (majorVer !== 0 || minorVer !== 0)
            minorVer++; // Increment the minor version here

        versions[i] = majorVer.toString() + "." + minorVer.toString() + "." + todaysDate;
    }
    
    WriteJsonFile("SdkManualNotes.json", TabifyJson(JSON.stringify(output), "SdkManualNotes", 4), "SdkManualNotes");
}

function GetFileFromUrl(inputUrl, processFileCallback) {
    console.log("-> Begin reading: " + inputUrl);
    var rawResponse = "";
    var postReq = https.get(inputUrl, function (res) {
        res.setEncoding("utf8");
        res.on("data", function (chunk) { rawResponse += chunk; });
        res.on("end", function () {
            console.log("<- Finished reading: " + inputUrl);
            processFileCallback(rawResponse);
        });
    });
}

function GetApiFile(inputUrl, outputFilename, descriptor) {
    console.log("-> Begin reading: " + inputUrl);
    var rawResponse = "";
    var postReq = https.get(inputUrl, function (res) {
        res.setEncoding("utf8");
        res.on("data", function (chunk) { rawResponse += chunk; });
        res.on("end", function () {
            console.log("<- Finished reading: " + inputUrl);
            WriteJsonFile(outputFilename, TabifyJson(rawResponse, descriptor, 2), descriptor);
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
var playFabUrl = "https://www.playfabapi.com/";
if (argsDict["playFabUrl"])
    playFabUrl = argsDict["playFabUrl"];
if (!playFabUrl.endsWith("/"))
    playFabUrl = playFabUrl + "/";

try { 

    var jsonObj = require("./TOC.json");

    for (var i = 0; i < jsonObj.documents.length; ++i) 
    {
        var apiSection = jsonObj.documents[i];
        if (apiSection.format === "LegacyPlayFabApiSpec")
        {
            GetApiFile(playFabUrl + apiSection.docKey, apiSection.relPath, apiSection.shortName);
        }
    }
} catch(err) {
    console.log("=== fetch.js failed to parse TOC.json as JSON :( ===");
    console.log(err);
}

GetApiFile(playFabUrl + "apispec/AdminAPI", "Admin.api", "Admin-Api");
GetApiFile(playFabUrl + "apispec/ClientAPI", "Client.api", "Client-Api");
GetApiFile(playFabUrl + "apispec/EntityAPI", "Entity.api", "Entity-Api");
GetApiFile(playFabUrl + "apispec/MatchmakerAPI", "Matchmaker.api", "Matchmaker-Api");
GetApiFile(playFabUrl + "apispec/ServerAPI", "Server.api", "Server-Api");

GetApiFile(playFabUrl + "apispec/PlayStreamEventModels", "PlayStreamEventModels", "Client-Api");
GetApiFile(playFabUrl + "apispec/PlayStreamCommonEventModels", "PlayStreamCommonEventModels", "Client-Api");
GetApiFile(playFabUrl + "apispec/PlayStreamProfileModel", "PlayStreamProfileModels", "Client-Api");

GetFileFromUrl("https://raw.githubusercontent.com/PlayFab/API_Specs/master/SdkManualNotes.json", UpdateVersionNumbers);
