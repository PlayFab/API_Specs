var https = require("https");
var fs = require("fs");

var argsDict = null;

function WriteJsonFile(jsonBody, options) {
    if (!jsonBody) {
        console.log("  ***  Failed to write: " + options.description);
        return false;
    }

    if (!options.outputFilename.endsWith(".json"))
        options.outputFilename = options.outputFilename + ".json";
    console.log("  -> Begin writing " + jsonBody.length + " bytes: " + options.description);
    fs.writeFile(options.outputFilename, jsonBody, function (err) {
        if (err)
            return console.log(err);
        console.log("  <- Finished writing: " + options.outputFilename);
    });

    return true;
}

function TabifyJson(inputJson, options) {
    // console.log("  Begin tabifying: " + options.description);

    if (!inputJson)
        return null;

    var output = null;
    var tabSpaces = options.jsonTabSpaces;
    if (!tabSpaces) tabSpaces = 2;
    try {
        var tempObj = JSON.parse(inputJson);
        output = JSON.stringify(tempObj, null, tabSpaces);
        // console.log("  Finish tabifying: " + options.description);
    } catch (e) {
        console.log("  ***  Failed to stringify: " + options.description);
        output = null;
    }

    return output;
}

function UpdateVersionNumbers(rawResponse, options) {
    console.log("  Begin version numbers");

    var versionRe = new RegExp("([0-9]+)\.([0-9]+)\.[0-9][0-9][0-9][0-9][0-9][0-9]");
    var now = new Date();
    var todaysDate = (now.getUTCFullYear()%100).toString().padStart(2, "0") + (now.getMonth()+1).toString().padStart(2, "0") + (now.getUTCDate()).toString().padStart(2, "0");
    var output = JSON.parse(rawResponse);
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

    var processedResponse = TabifyJson(JSON.stringify(output), options);
    if (processedResponse) {
        return WriteJsonFile(processedResponse, options);
    }
    return false;
}

function GetFileFromUrl(inputUrl, options, retry = 0) {
    if (retry == 10) {
        var msg = "  !!!!!!!!!!  Aborting GetFileFromUrl, failed " + retry + " times: " + inputUrl;
        console.log(msg); return; // throw Error(msg);
    }

    console.log("-> Begin reading: " + inputUrl);
    var rawResponse = "";
    var postReq = https.get(inputUrl, function (res) {
        res.setEncoding("utf8");
        res.on("data", function (chunk) { rawResponse += chunk; });
        res.on("end", function () {
            console.log("<- Finished reading " + rawResponse.length + " bytes: " + inputUrl);
            var processedResponse = rawResponse;
            if (options.expectJson) {
                processedResponse = TabifyJson(rawResponse, options);
            }
            var callbackSuccess = options.onFileDownload(processedResponse, options);
            if (!callbackSuccess) {
                console.log("  !!!  Failed to GetFileFromUrl (retry: " + retry + "): " + inputUrl);
                GetFileFromUrl(inputUrl, options, retry + 1)
            }
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

function GetPlayFabUrl() {
    var argsDict = ExtractArgs(process.argv);
    var playFabUrl = "https://www.playfabapi.com/";
    if (argsDict["playFabUrl"])
        playFabUrl = argsDict["playFabUrl"];
    if (!playFabUrl.endsWith("/"))
        playFabUrl = playFabUrl + "/";
    return playFabUrl;
}

function UpdateApiFilesFromToc() {
    var playFabUrl = GetPlayFabUrl();
    try {
        var jsonObj = require("./TOC.json");

        for (var i = 0; i < jsonObj.documents.length; ++i) {
            var apiSection = jsonObj.documents[i];
            if (apiSection.format === "LegacyPlayFabApiSpec" || apiSection.format === "Swagger") {
                var eachApiOpt = {
                    description: apiSection.relPath,
                    expectJson: true,
                    jsonTabSpaces: 2,
                    outputFilename: apiSection.relPath,
                    onFileDownload: WriteJsonFile
                }
                GetFileFromUrl(playFabUrl + apiSection.pfurl, eachApiOpt);
            }
        }
    } catch(err) {
        console.log("=== fetch.js failed to parse TOC.json as JSON :( ===");
        console.log(err);
    }
}

function UpdateSdkManualNotes() {
    var versionOpt = {
        description: "SdkManualNotes",
        expectJson: true,
        jsonTabSpaces: 4,
        outputFilename: "SdkManualNotes.json",
        onFileDownload: UpdateVersionNumbers
    }
    GetFileFromUrl("https://raw.githubusercontent.com/PlayFab/API_Specs/master/SdkManualNotes.json", versionOpt);
}

function DoWork() {
    UpdateApiFilesFromToc();
    UpdateSdkManualNotes();
}
DoWork();
