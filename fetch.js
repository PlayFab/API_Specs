var fs = require("fs");

const MAX_FETCH_RETRIES = 10;
const FETCH_RETRY_DELAY = 200;

async function CompareLegacyApiListWithToc(fetchedList, tocObj) {
    console.log("-> Begin CompareLegacyApiListWithToc");

    var apiList = tocObj.documents.filter(obj => obj.format === "LegacyPlayFabApiSpec" || obj.format === "LegacyPlayFabModels");
    const allElementsExist = fetchedList.every(fetchedApi => {
        const urlPart = fetchedApi.url.split("/")[4];
        const statusOk = fetchedApi.status === 200;
        const hasMatch = apiList.some(api => urlPart === api.pfurl.split("/")[1]);
        
        return statusOk && hasMatch;
    });

    if (!allElementsExist) {
        throw "Current TOC does not match Legacy List or some fetched APIs did not return status 200.";
    }

    console.log(" <- Finished CompareLegacyApiListWithToc");
    return true;
}

async function CompareSwaggerListWithToc(fetchedList, tocObj) {
    console.log("-> Begin CompareSwaggerListWithToc");

    var swaggerList = tocObj.documents.filter(obj => obj.format === "Swagger")
    const allElementsExist = fetchedList.every(fetchedApi => {
        const urlPart = fetchedApi.url.split("/")[4];
        const statusOk = fetchedApi.status === 200;
        const hasMatch = swaggerList.some(swaggerApi => urlPart === swaggerApi.pfurl.split("/")[1]);
        
        return statusOk && hasMatch;
    });

    if (!allElementsExist) {
        throw "Current TOC does not match Swagger List or some fetched APIs did not return status 200.";
    }

    console.log(" <- Finished CompareSwaggerListWithToc");
    return true;
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
    return argsByName;
}

async function FetchDataFromUrl(url) {
    console.log("-> Begin reading: " + url);

    return new Promise((resolve, reject) => {
        const attemptFetch = async (n) => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status} ${response.statusText} on ${url}`);
                }

                const result = {
                    url: url,
                    response: await response.json(),
                    status: response.status
                }
                console.log("  <- Finished reading: " + url);

                resolve(result);
            } catch (error) {
                if (n <= MAX_FETCH_RETRIES) {
                    console.warn(error);
                    console.warn(`Retrying... (${n})`);
                    setTimeout(() => attemptFetch(n + 1), backoffDelay(n));
                } else {
                    reject(error);
                }
            }
        };
        attemptFetch(1);
    });
}

async function FetchLegacyApis(playFabUrl, tocObj) {
    console.log("-> Begin FetchLegacyApis");

    var apiList = tocObj.documents.filter(obj => obj.format === "LegacyPlayFabApiSpec" || obj.format === "LegacyPlayFabModels");
    var fetchedList = [];

    for (const api of apiList) {
        try {
            const data = await FetchDataFromUrl(`${playFabUrl}${api.pfurl}`);
            fetchedList.push(data);
        } catch (error) {
            console.error("!!!!!!!!!! Aborting FetchLegacyApis, failed\n", error);
        }
    }

    console.log("<- Finished FetchLegacyApis");

    return fetchedList;
}

async function FetchSwaggerApiGroupList(swaggerApiListUrl, tocObj) {
    var swaggerList = tocObj.documents.filter(obj => obj.format === "Swagger")
    var fetchedList = [];

    for (const api of swaggerList) {
        try {
            const data = await FetchDataFromUrl(`${swaggerApiListUrl}${api.pfurl}`);
            fetchedList.push(data);
        } catch (error) {
            console.error("  !!!!!!!!!!  Aborting FetchSwaggerApiGroupList, failed\n", error);
        }
    }

    return fetchedList;
}

function GetPlayFabUrl() {
    var argsDict = ExtractArgs(process.argv);
    var verticalUrl = "www";
    var playFabUrl = "https://" + verticalUrl + ".playfabapi.com/";

    if (argsDict["playFabUrl"])
        playFabUrl = argsDict["playFabUrl"];
    if (!playFabUrl.endsWith("/"))
        playFabUrl = playFabUrl + "/";

    return playFabUrl;
}

function backoffDelay(n) {
    return Math.pow(2, n) * FETCH_RETRY_DELAY;
}

async function UpdateApiFiles(jsonToUploadList, tocObj) {
    console.log("-> Begin UpdateApiFiles");

    try {
        for (var api of jsonToUploadList) {
            const apiName = api.url.split("/")[4];
            const filepath = tocObj.documents.find(d => d.pfurl.split("/")[1] === apiName).relPath;
            await WriteFetchedData(api.response, filepath, 2);
        }
    } catch (error) {
        console.error("  !!!!!!!!!!  Aborting UpdateApiFiles, failed\n", error);
    }

    console.log("<- Finished UpdateApiFiles");
}

async function UpdateSdkManualNotes() {
    console.log("-> Begin SdkManualNotes");

    try {
        const sdkManualNotesUrl = "https://raw.githubusercontent.com/PlayFab/API_Specs/master/SdkManualNotes.json";
        var data = await FetchDataFromUrl(sdkManualNotesUrl);
        await UpdateVersionNumbers(data);
    } catch (error) {
        console.error("  !!!!!!!!!!  Aborting UpdateSdkManualNotes, failed\n", error);
    }

    console.log("<- Finished SdkManualNotes");
}

async function UpdateVersionNumbers(data) {
    console.log("-> Begin version numbers");

    var response = data.response;
    var versionRe = new RegExp("([0-9]+)\.([0-9]+)\.[0-9][0-9][0-9][0-9][0-9][0-9]");
    var now = new Date();
    var todaysDate = (now.getUTCFullYear() % 100).toString().padStart(2, "0") + (now.getMonth() + 1).toString().padStart(2, "0") + (now.getUTCDate()).toString().padStart(2, "0");
    var versions = response.sdkVersion;
    
    for (var i in versions) {
        var eachTempVer = versions[i];
        if (typeof (eachTempVer) !== "string") continue;
        var reMatch = eachTempVer.match(versionRe);
        if (!reMatch) continue;
        var majorVer = parseInt(reMatch[1]);
        var minorVer = parseInt(reMatch[2]);
        if (majorVer !== 0 || minorVer !== 0) {
            minorVer++;
        }
        versions[i] = majorVer.toString() + "." + minorVer.toString() + "." + todaysDate;
    }

    await WriteFetchedData(response, "SdkManualNotes.json", 4);
    console.log("<- Finished version numbers");
}

async function WriteFetchedData(response, filePath, spaces = 2) {
    console.log(`-> Writing: ${filePath}`);

    if (response == null) {
        console.log("Nothing to write, response is null");
        return false;
    }

    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, JSON.stringify(response, null, spaces), function (err) {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                console.log(`<- Finished writing: ${filePath}`);
                resolve(true);
            }
        });
    });
}

async function DoWork() {
    var playFabUrl = GetPlayFabUrl();
    var tocObj = require("./TOC.json");

    var fetchedLegacyApis = await FetchLegacyApis(playFabUrl, tocObj);
    await CompareLegacyApiListWithToc(fetchedLegacyApis, tocObj);
    await UpdateApiFiles(fetchedLegacyApis, tocObj);

    var fetchedSwaggerApis = await FetchSwaggerApiGroupList(playFabUrl, tocObj);
    await CompareSwaggerListWithToc(fetchedSwaggerApis, tocObj);
    await UpdateApiFiles(fetchedSwaggerApis, tocObj);

    UpdateSdkManualNotes();
}

DoWork();
