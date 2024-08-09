var https = require("https");
var fs = require("fs");

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
            var callbackSuccess = res.statusCode == 200;
            if (callbackSuccess && options.onFileDownload) {
                callbackSuccess = options.onFileDownload(processedResponse, options);
            }
            if (!callbackSuccess) {
                console.log("  !!!  Failed to GetFileFromUrl (retry: " + retry + ", " + res.statusCode + "): " + inputUrl );
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
    var verticalUrl = "www";
    var playFabUrl = "https://"+verticalUrl+".playfabapi.com/";
    if (argsDict["playFabUrl"])
        playFabUrl = argsDict["playFabUrl"];
    if (!playFabUrl.endsWith("/"))
        playFabUrl = playFabUrl + "/";
    return playFabUrl;
}

function UpdateApiFilesFromToc(playFabUrl, tocObj) {
    try {
        for (var i = 0; i < tocObj.documents.length; ++i) {
            var apiSection = tocObj.documents[i];
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

// Find Api Groups from the TOC or legacy Api list, which don't exist in the other
function CheckLegacyApiGroupList(playFabUrl, tocObj, isAzure) {
    var legacyApiListUrl;
    var description;

    if (isAzure) {
        legacyApiListUrl = playFabUrl + "azure/apispec/";
        description = "azureLegacyApiList";
    } else {
        legacyApiListUrl = playFabUrl + "apispec/";
        description = "legacyApiList";
    }

    var apiList = tocObj.documents.filter(obj =>
        obj.format === "LegacyPlayFabApiSpec" || obj.format === "LegacyPlayFabModels"
    )

    var options = {
        description: description,
        expectJson: true,
        jsonTabSpaces: 0,
        tocRef: apiList,
        onFileDownload: CompareApiListWithToc
    };
    GetFileFromUrl(legacyApiListUrl, options);
}

function CompareApiListWithToc(apis, options) {
    var apiList = JSON.parse(apis);
    // Check if all elements from the incoming API list exist in the TOC
    var allElementsExist = apiList.every(element => 
        options.tocRef.some(obj => obj.docKey === element)); // The incoming API name is a subset of the TOC.document.name
    if(!allElementsExist) {
        throw "Current TOC does not match API List.\n TOC: " + JSON.stringify(options.tocRef, apiListReplacer, 2) + "\n API List: " + apis;
    }
    return true;
}

function apiListReplacer(key, value) {
    if (key === "" || key === "docKey") {
      return value;
    }
    if (typeof value === "object" && value !== null) {
        return { docKey: value.docKey };
    }
    return undefined;
}

// Find Api Groups from the TOC or swagger Api list, which don't exist in the other
function CheckSwaggerApiGroupList(playFabUrl, tocObj, isAzure) {
    var swaggerApiListUrl;
    var description;
    
    if (isAzure) {
        swaggerApiListUrl = playFabUrl + "azure/swagger/";
        description = "azureLegacySwaggerList";
    } else {
        swaggerApiListUrl = playFabUrl + "swagger/";
        description = "legacySwaggerList";
    }

    var swaggerList = tocObj.documents.filter(obj => obj.format === "Swagger")

    var options = {
        description: description,
        expectJson: true,
        jsonTabSpaces: 0,
        tocRef: swaggerList,
        onFileDownload: CompareSwaggerListWithToc
    };
    GetFileFromUrl(swaggerApiListUrl, options);
}

function CompareSwaggerListWithToc(swagger, options) {
    var swaggerList = JSON.parse(swagger);
    // Check if all elements from the incoming Swagger list exist in the TOC
    var allElementsExist = swaggerList.every(element =>
       options.tocRef.some(obj => element.includes(obj.pfurl.split("/")[1]))); // TOC.document.pfurl is a subset the incoming Swagger entry
    if(!allElementsExist) {
        throw "Current TOC does not match Swagger List. \nTOC: " + JSON.stringify(options.tocRef, swaggerListReplacer, 2) + "\n Swagger: " + swagger;
    }
    return true;
}

function swaggerListReplacer(key, value) {
    if (key === "" || key === "pfurl") {
      return value;
    }
    if (typeof value === "object" && value !== null) {
        return { pfurl: value.pfurl.split("/")[1] };
    }
    return undefined;
}

function DoWork() {
    var playFabUrl = GetPlayFabUrl();
    var tocObj = require("./TOC.json");

    UpdateApiFilesFromToc(playFabUrl, tocObj);
    UpdateSdkManualNotes();
    CheckLegacyApiGroupList(playFabUrl, tocObj);
    CheckSwaggerApiGroupList(playFabUrl, tocObj);
    
    // TODO: Some kind of final global report, with an errors list from all threads
}
DoWork();
