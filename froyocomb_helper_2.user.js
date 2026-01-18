// ==UserScript==
// @name         Froyocomb Helper (Extended)
// @namespace    https://dobby233liu.neocities.org
// @version      v1.1.12b_Reimu_3
// @description  Tool for speeding up the process of finding commits from before a specific date (i.e. included with a specific build). Developed for Froyocomb, the Android pre-release source reconstruction project.
// @author       Liu Wenyuan & Froyocomb Team & Reimu & AI
// @match        https://android.googlesource.com/*
// @match        https://chromium.googlesource.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/RYuhMine/Android-Weird-Builds-Reconstruction-Project/blob/main/froyocomb_helper_2.user.js
// @updateURL    https://raw.githubusercontent.com/RYuhMine/Android-Weird-Builds-Reconstruction-Project/blob/main/froyocomb_helper_2.user.js
// @supportURL   https://github.com/RYuhMine/Android-Weird-Builds-Reconstruction-Projec
// ==/UserScript==

"use strict";

const SITE = location.hostname.split(".").reverse()[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- NEW STYLES FOR BUILD_ID ---
GM_addStyle(`
.fch-BuildId {
    display: inline-block;
    font-family: 'Roboto Mono', monospace;
    font-size: 11px;
    background-color: #e8f0fe;
    color: #1a73e8;
    border: 1px solid #d2e3fc;
    border-radius: 4px;
    padding: 0 4px;
    margin-left: 8px;
    min-width: 40px;
    text-align: center;
    vertical-align: middle;
}
.fch-BuildId.loading { color: #5f6368; background-color: #f1f3f4; border-color: #dadce0; }
.fch-BuildId.not-found { opacity: 0.5; background-color: #eee; color: #999; display: none; }

/* Hide functionality controlled by toggle */
body.fch-hide-builds .fch-BuildId { display: none !important; }

/* Toggle Button Style */
#fch-toggle-container {
    position: fixed;
    top: 10px;
    left: 10px;
    z-index: 9999;
    background: #ffdb00;
    padding: 5px 10px;
    border-radius: 4px;
    font-family: sans-serif;
    font-size: 12px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    opacity: 0.9;
}
#fch-toggle-container:hover { opacity: 1; }
`);

// --- NEW TOGGLE LOGIC ---
function setupToggle() {
    const container = document.createElement("label");
    container.id = "fch-toggle-container";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    // Default to true if not set
    checkbox.checked = GM_getValue("show_build_ids", true);

    // Initial state apply
    if (!checkbox.checked) {
        document.body.classList.add("fch-hide-builds");
    }

    checkbox.addEventListener("change", () => {
        GM_setValue("show_build_ids", checkbox.checked);
        if (checkbox.checked) {
            document.body.classList.remove("fch-hide-builds");
        } else {
            document.body.classList.add("fch-hide-builds");
        }
    });

    container.appendChild(checkbox);
    container.appendChild(document.createTextNode("Show BUILD_ID"));
    document.body.appendChild(container);
}

// JANK
function getForCurrentSite(config, defaultValue) {
    return GM_getValue(SITE + "." + config, defaultValue);
}
function setForCurrentSite(config, value) {
    return GM_setValue(SITE + "." + config, value);
}

if (!getForCurrentSite("referenceTag"))
    setForCurrentSite("referenceTag", SITE == "android" ? GM_getValue("referenceTag", "android-4.0.1_r1") : "TAG");
if (!getForCurrentSite("referenceBranch"))
    setForCurrentSite("referenceBranch", SITE == "android" ? GM_getValue("referenceBranch", "ics-mr0-release") : "main");
if (!getForCurrentSite("referenceTime"))
    setForCurrentSite("referenceTime", (SITE == "android" ? GM_getValue("referenceTime") : null) ?? +(new Date("0")));
if (SITE == "android") {
    GM_deleteValue("referenceTag");
    GM_deleteValue("referenceBranch");
    GM_deleteValue("referenceTime");
}

const createElement = document.createElement.bind(document);

let floatingPanelStylesPresent = false;
function createFloatingPanel(variant) {
    if (!floatingPanelStylesPresent) {
        GM_addStyle(`
.fch-FloatingPanel {
    position: fixed;

    padding: 8px;
    background: #ffdb00ee;
}
.fch-FloatingPanel-bottom {
    left: 50%; bottom: 0;
    transform: translate3d(-50%, 0, 0);
}
.fch-FloatingPanel-right {
    right: 0; top: 3em;
    transform: translate3d(0, 0, 0);
}

.fch-FloatingPanel button {
    font: inherit;
}
`);
        floatingPanelStylesPresent = true;
    }

    const panel = document.body.insertAdjacentElement("afterBegin", createElement("div"));
    panel.classList.add("fch-FloatingPanel");
    panel.classList.add("fch-FloatingPanel-" + (variant ?? "bottom"));
    panel.tabindex = 0;
    return panel;
}

function addListItem(list, content) {
    const item = list.appendChild(createElement("li"));
    if (content)
        item.appendChild(content);
    return content;
}

function generateButton(text, onClick) {
    const button = createElement("button");
    button.type = "button";
    button.innerText = text;
    if (onClick)
        button.addEventListener("click", onClick);
    return button;
}

let copyButtonStylePresent = false;
function createCopyButtonFactory(title) {
    if (!copyButtonStylePresent) {
        GM_addStyle(`
.fch-CopyButton {
    font: inherit;
    position: relative;
    margin-left: 2px;
    margin-right: 3px;
}

@keyframes fch-CopyButton-Toast-Anim {
    from, 33.333% {
        opacity: 1;
    }
    to {
        opacity: 0;
        bottom: calc(100% + 1em);
    }
}

.fch-CopyButton-Toast {
    position: absolute;
    left: 50%;
    transform: translate3d(-50%, 0, 0);
    bottom: calc(100% + 0.3em);
    z-index: 10;

    width: max-content;
    padding: 2px 6px;
    background: #ffdb00f0;
    border: #ffe54755 2px solid;
    border-radius: 6px;
    opacity: 0;
}
.fch-CopyButton-Toast > * {
    pointer-events: none;
}

.fch-CopyButton-Toast-Done, .fch-CopyButton-Toast-Error {
    animation: fch-CopyButton-Toast-Anim 1s ease-in-out;
}

.fch-CopyButton-Toast-Error {
    background-color: #ff0004f0;
    border-color: #ff474755;
}
`);
        copyButtonStylePresent = true;
    }

    const button = generateButton("\u{1F4CB}");
    button.classList.add("fch-CopyButton");
    button.title = title ? title : "Copy";
    const toast = button.appendChild(createElement("div"));
    toast.classList.add("fch-CopyButton-Toast");
    toast.style.display = "none";

    return function(text, copyCb) {
        const newButton = button.cloneNode(true);

        const newToast = newButton.querySelector(".fch-CopyButton-Toast");
        newToast.addEventListener("animationend", function(ev) {
            if (ev.animationName == "fch-CopyButton-Toast-Anim")
                ev.target.style.display = "none";
        });
        newToast.addEventListener("click", function(ev) {
            // prevent toast from triggering copy
            ev.stopPropagation();
        });

        newButton.addEventListener("click", function(ev) {
            (async function(ev) {
                let ok = true;
                try {
                    await navigator.clipboard.writeText(text);
                } catch (ex) {
                    console.error("[FCH] Copy to clipboard failed", ex);
                    ok = false;
                }

                if (typeof copyCb == "function")
                    copyCb(text);

                if (!newToast) return;
                newToast.classList.remove("fch-CopyButton-Toast-Done");
                newToast.classList.remove("fch-CopyButton-Toast-Error");
                requestAnimationFrame(() => {
                    newToast.style.display = "";
                    void(newToast.offsetWidth); // crime
                    if (ok) {
                        newToast.classList.add("fch-CopyButton-Toast-Done");
                        newToast.innerText = "Copied!";
                    } else {
                        newToast.classList.add("fch-CopyButton-Toast-Error");
                        newToast.innerText = "Copy failed!";
                    }
                });
            })();
        });
        return newButton;
    }
}

function getRepoHomePath(pathname) {
    const i = pathname.indexOf("/+");
    if (i >= 0)
        return pathname.substring(0, i);
    return pathname.replace(/\/+$/, "");
}

function formatRef(refType, refName) {
    if (refType == "" || refType == "commit")
        return refName;
    return `refs/${refType}/${refName}`;
}

function getPathToRef(homePath, ref, viewType="") {
    return homePath + `/+${viewType}/` + ref;
}

function parseGitilesJson(rawJson) {
    // TODO: what is Gitiles smoking
    return JSON.parse(rawJson.replace(/^\)\]\}'\n/, ""));
}

// --- NEW FETCH FUNCTION ---
async function fetchAndInsertBuildId(commitHash, targetContainer) {
    const label = createElement("span");
    label.classList.add("fch-BuildId", "loading");
    label.innerText = "...";

    // ЗМІНЕНО ТУТ: Вставляємо перед першим елементом (тобто зліва)
    targetContainer.insertBefore(label, targetContainer.firstChild);

    try {
        const repoPath = getRepoHomePath(location.pathname);
        const url = `${location.origin}${repoPath}/+/${commitHash}/core/build_id.mk?format=TEXT`;
        const response = await fetch(url);

        if (!response.ok) {
            label.classList.add("not-found");
            label.classList.remove("loading");
            label.innerText = "N/A";
            return;
        }

        const text = atob(await response.text());
        const match = text.match(/^\s*(?:export\s+)?BUILD_ID\s*:?=\s*(.+)$/m);

        if (match && match[1]) {
            label.innerText = match[1].trim();
            label.classList.remove("loading");
        } else {
            label.innerText = "No ID";
            label.classList.add("not-found");
            label.classList.remove("loading");
        }
    } catch (e) {
        console.warn("[FCH] Failed to fetch build ID", e);
        label.remove();
    }
}


// if author email in a commit doesn't match one of these patterns, the commit potentially comes from upstream,
// or is likely a partner/AOSP ext contribution that probably got merged in by Google later
const AUTHOR_ALLOWLIST = (function(site) {
    // from inside google (mostly)
    // note that this implictly includes corp-partner.google.com which might be undesirable, but since we haven't/won't get to the point
    // where we'd need to mark those, we'll see
    let authorAllowlist = [
        /@(?:|[A-Za-z0-9\-\.]+?\.)google\.com/, // look idk
        /%(?:|[A-Za-z0-9\-\.]+?\.)google\.com@gtempaccount\.com/
    ];
    if (site == "android") {
        authorAllowlist = authorAllowlist.concat([ // from inside android
            /@(?:|[A-Za-z0-9\-\.]+?\.)android\.com/,
            /0%(?:|[A-Za-z0-9\-\.]+?\.)android\.com@gtempaccount\.com/,
            /@android$/,
            /@android@[a-f0-9\-]+$/,
        ]);
    }
    if (
        site == "chromium"
        // idk
        // normally during 4.4 chromium-automerger@android is SLIGHTLY more reliable
        || (site == "android" && getRepoHomePath(location.pathname).includes("/platform/external/chromium_org"))
    ) {
        authorAllowlist = authorAllowlist.concat([
            /@(?:|[A-Za-z0-9\-\.]+?\.)chromium\.org/
        ]);
    }
    return authorAllowlist;
})(SITE);

// usually signs that may indicate a upstream commit
const ALERTABLE_COMMENT_MESSAGE_PATTERNS = (function(site){
    let patterns = [
        "\ngit-svn-id: "
    ];
    if (site == "android") {
        patterns = patterns.concat([
            /\nReview URL: http(?:s)?:\/\/codereview\.chromium\.org\//,
            /\nReview URL: http(?:s)?:\/\/chromiumcodereview\.appspot\.com\//,
            /\nReviewed-on: http(?:s)?:\/\/chromium-review\.googlesource\.com\//
        ]);
    }
    return patterns;
})(SITE);

function matchesPatterns(str, pats) {
    return pats.some(i => i instanceof RegExp ? !!str.match(i) : str.includes(i));
}

(function() {
    const headerMenu = document.querySelector(".Site-header .Header-menu");
    if (!headerMenu) return;
    for (const i of headerMenu.querySelectorAll(".Header-menuItem")) {
        if (i.tagName == "A" && i.href.startsWith("https://accounts.google.com/AccountChooser") && i.innerText == "Sign in") {
            GM_addStyle(`
.fch-LoginHint {
    color: #ff2f00;
    text-decoration: underline dotted; /* TODO: use abbr instead? */
}
`);
            const loginHint = i.appendChild(createElement("span"));
            loginHint.innerText = " (recommended)";
            loginHint.title = "Log in for more lenient rate limits";
            loginHint.classList.add("fch-LoginHint");
            break;
        }
    }
})();

// INIT TOGGLE BUTTON
setupToggle();

if (document.querySelector(".RepoShortlog")) {
    // This part is almost useless outside of android
    (function() {
        const panel = createFloatingPanel();
        const list = panel.appendChild(createElement("ul"));

        function updateRefLink(link, refType, refName, viewType) {
            const ref = formatRef(refType, refName);
            link.href = getPathToRef(getRepoHomePath(location.pathname), ref, viewType);
            link.innerText = "Go to " + viewType + " of " + ref;
            return link;
        }

        const refTagContainer = addListItem(list, createElement("span"));
        const refTagLink = refTagContainer.appendChild(createElement("a"));
        function updateRefTagLink() {
            updateRefLink(refTagLink, "tags", getForCurrentSite("referenceTag"), "log");
        }
        updateRefTagLink();
        refTagContainer.appendChild(document.createTextNode(" "));
        refTagContainer.appendChild(generateButton("Set", function() {
            const val = prompt("Set reference tag to:", getForCurrentSite("referenceTag")).trim();
            if (!val || val === "") return;
            setForCurrentSite("referenceTag", val);
            updateRefTagLink();
        }));

        const refBranchContainer = addListItem(list, createElement("span"));
        const refBranchLink = refBranchContainer.appendChild(createElement("a"));
        function updateRefBranchLink() {
            updateRefLink(refBranchLink, "heads", getForCurrentSite("referenceBranch"), "log");
        }
        updateRefBranchLink();
        refBranchContainer.appendChild(document.createTextNode(" "));
        refBranchContainer.appendChild(generateButton("Set", function() {
            const val = prompt("Set reference branch to:", getForCurrentSite("referenceBranch")).trim();
            if (!val || val === "") return;
            setForCurrentSite("referenceBranch", val);
            updateRefBranchLink();
        }));
    })();
} else if (document.querySelector(".CommitLog")) {
    (function() {
    GM_addStyle(`
.fch-LightEmUp-Message-Container {
    display: flex;
    flex-flow: row wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 2px;
}

.fch-LightEmUp-Message {
    flex: 1 1;
}

.fch-LightEmUp-RefTime-Entry, .fch-LightEmUp-RefTimeSetter-Entry {
    text-align: center;
}
.fch-LightEmUp-RefTime-Entry {
    font-size: 13px;
}
.fch-LightEmUp-RefTimeSetter-Entry {
    font-size: 12px;
}

.CommitLog-item--fch-lightedUp {
    background: #ffff00;
}
.CommitLog-item--fch-lightedUp-exact {
    background: #ffa400;
}
.CommitLog-item--fch-lightedUp-lesser {
    background: #eeee0040;
}
`);

        function filterCommits(commits, dateBefore) {
            const result = {};

            for (const commit of commits) {
                const authorEmail = commit.querySelector(":scope > .CommitLog-author").title;
                const lesser = !matchesPatterns(authorEmail, AUTHOR_ALLOWLIST);
                const time = new Date(commit.querySelector(":scope > .CommitLog-time").title);
                if (isNaN(+time))
                    continue;
                if (time <= dateBefore)
                    result[commit.querySelector(":scope > .CommitLog-sha1").href] = lesser ? "-lesser" : (time >= dateBefore ? "-exact" : "");
            }

            return result;
        }

        // strange feature per Mainnn's request
        //let markAsVisitedIframe = undefined;
        function markAsVisited(url) {
            /*
            if (markAsVisitedIframe === undefined) {
                markAsVisitedIframe = document.body.appendChild(createElement("iframe"));
                markAsVisitedIframe.name = "fch-markAsVisited";
                markAsVisitedIframe.src = blankPage;
                markAsVisitedIframe.style.display = "none";
                console.log(markAsVisitedIframe);
            }
            */
            const wnd = window; // markAsVisitedIframe.contentWindow;
            const oldHref = wnd.location.href;
            wnd.history.replaceState({}, "", url);
            wnd.history.replaceState({}, "", oldHref);
        }

        const commits = Array.from(document.querySelectorAll(".Site-content > .Container > .CommitLog > .CommitLog-item"));
        const createCopyButton = createCopyButtonFactory("Copy hash");
        for (const commit of commits) {
            const hashEl = commit.querySelector(".CommitLog-sha1");
            if (!hashEl) continue;
            const hash = new URL(hashEl.href).pathname.split("/").reverse()[0];
            if (!(hash.length == 40 && hash.startsWith(hashEl.innerText))) {
                console.warn("[FCH] Hash extraction failed, sha1 link element:", hashEl);
                continue;
            }
            hashEl.parentNode.insertBefore(createCopyButton(hash, (_) => {
                try {
                    markAsVisited(hashEl.href);
                } catch (ex) {
                    console.warn("[FCH] markAsVisited failed", ex);
                }
            }), hashEl.nextSibling);
        }

        // --- NEW: FETCH BUILD IDS IF ENABLED ---
        (async function() {
            // Check if toggle is on (default true)
            if (!GM_getValue("show_build_ids", true)) return;

            // Optional: Only run this on platform/build repo to avoid spamming 404s
            // Remove this check if you want it to try everywhere
            // if (!location.pathname.includes("/platform/build")) return;

            for (const commit of commits) {
                 // Check toggle status again inside loop in case user switched it off
                 if (!GM_getValue("show_build_ids", true)) break;

                const hashEl = commit.querySelector(".CommitLog-sha1");
                if (!hashEl) continue;
                const hash = new URL(hashEl.href).pathname.split("/").reverse()[0];

                // Rate limit protection
                await sleep(390);

                // Fetch and display
                await fetchAndInsertBuildId(hash, hashEl.parentNode);
            }
        })();


        const panel = createFloatingPanel();

        const lightedUpClz = "CommitLog-item--fch-lightedUp";
        const lightedUpExactClz = "CommitLog-item--fch-lightedUp-exact";
        const lightedUpLesserClz = "CommitLog-item--fch-lightedUp-lesser";
        const firstId = "fch-lightedUp-First";

        const list = panel.appendChild(createElement("ul"));

        const lightEmUpEntry = list.appendChild(createElement("li"));
        const messageContainerEl = lightEmUpEntry.appendChild(createElement("div"));
        messageContainerEl.classList.add("fch-LightEmUp-Message-Container");

        const lightEmUpBtn = messageContainerEl.appendChild(generateButton("Light 'em up!"));
        lightEmUpBtn.accessKey = "z";
        lightEmUpBtn.title = "[alt+z]";

        const messageEl = messageContainerEl.appendChild(createElement("span"));
        messageEl.classList.add("fch-LightEmUp-Message");

        const jumpToFirst = messageContainerEl.appendChild(createElement("a"));
        jumpToFirst.classList.add("fch-lightedUp-JumpToFirst");
        jumpToFirst.innerText = "(first)";
        jumpToFirst.href = "#" + firstId;
        jumpToFirst.style.display = "none";
        jumpToFirst.accessKey = "v";
        jumpToFirst.title = "[alt+v]";

        lightEmUpBtn.addEventListener("click", function() {
            const time = new Date(getForCurrentSite("referenceTime"));
            const filtered = filterCommits(commits, time);

            let firstFound = false;
            for (const commit of commits) {
                commit.classList.remove(lightedUpClz);
                commit.classList.remove(lightedUpExactClz);
                commit.classList.remove(lightedUpLesserClz);
                const found = filtered[commit.querySelector(":scope > .CommitLog-sha1").href];
                if (found === undefined) {
                    if (commit.id == firstId)
                        delete commit.id;
                } else {
                    commit.classList.add(lightedUpClz + found);
                    if (!firstFound) {
                        commit.id = firstId;
                        firstFound = true;
                    } else if (commit.id == firstId) {
                        delete commit.id;
                    }
                }
            }

            const filteredCount = Object.keys(filtered).length;
            messageEl.innerText = `${filteredCount} found`;
            messageEl.title = `(before ${time.toISOString()})`;
            jumpToFirst.style.display = filteredCount > 0 ? "" : "none";
        });

        const nextButtonOrig = document.querySelector(".LogNav-next");
        const prevButtonOrig = document.querySelector(".LogNav-prev");
        if (nextButtonOrig || prevButtonOrig) {
            messageContainerEl.appendChild(document.createTextNode("|"));
            if (prevButtonOrig) {
                const prevButton = messageContainerEl.appendChild(prevButtonOrig.cloneNode());
                prevButton.innerText = "<< Prev";
                prevButton.accessKey = "a";
                prevButton.title = "[alt+a]";
            }
            if (nextButtonOrig) {
                const nextButton = messageContainerEl.appendChild(nextButtonOrig.cloneNode());
                nextButton.innerText = "Next >>";
                nextButton.accessKey = "s";
                nextButton.title = "[alt+s]";
            }
        }

        const refTimeEntry = list.appendChild(createElement("li"));
        refTimeEntry.classList.add("fch-LightEmUp-RefTime-Entry");
        const refTimeContainer = refTimeEntry.appendChild(createElement("span"));
        const refTimePrefix = refTimeContainer.appendChild(document.createTextNode("Highlight commits from before "));
        const refTimeDisp = refTimeContainer.appendChild(createElement("strong"));
        function updateRefTimeDisp() {
            refTimeDisp.innerText = new Date(getForCurrentSite("referenceTime")).toISOString();
        }
        updateRefTimeDisp();

        const refTimeSetterEntry = list.appendChild(createElement("li"));
        refTimeSetterEntry.classList.add("fch-LightEmUp-RefTimeSetter-Entry");
        const refTimeSetterContainer = refTimeSetterEntry.appendChild(createElement("span"));

        refTimeSetterContainer.appendChild(document.createTextNode("(Set "));

        refTimeSetterContainer.appendChild(generateButton("by datetime", function() {
            const val = prompt("Set reference time by datetime string:", new Date(getForCurrentSite("referenceTime")).toISOString()).trim();
            if (!val || val === "") return;
            const ts = +(new Date(val));
            if (isNaN(ts)) {
                alert("Invalid date");
                return;
            }
            setForCurrentSite("referenceTime", ts);
            updateRefTimeDisp();
        }));

        refTimeSetterContainer.appendChild(generateButton("by timestamp", function() {
            const val = prompt("Set reference time by timestamp:", getForCurrentSite("referenceTime")).trim();
            if (!val || val === "") return;
            const ts = +(new Date(parseInt(val)));
            if (isNaN(ts)) {
                alert("Invalid date");
                return;
            }
            setForCurrentSite("referenceTime", ts);
            updateRefTimeDisp();
        }));

        function rtsTerminateQuote() {
            refTimeSetterContainer.appendChild(document.createTextNode(")"));
        }
        if (SITE == "android") {
            const setByCommitBtn = refTimeSetterContainer.appendChild(generateButton("by tag commit"));
            rtsTerminateQuote();
            const setByCommitWorkingEl = refTimeSetterContainer.appendChild(createElement("span"));
            setByCommitWorkingEl.innerText = " (working...)";
            setByCommitWorkingEl.style.display = "none";

            async function setByCommitBtnOnClickReal() {
                const hash = prompt("Please input the full hash of the commit modifying build/(make/)core/build_id.mk that you have in mind").trim();
                if (hash.search(/^[0-9a-f]{40}$/) == -1) { // technically an arbitary limitation but idk
                    alert("Invalid hash");
                    return;
                }

                const url = new URL(getPathToRef("/platform/build", formatRef("commit", hash)), location.origin);
                url.searchParams.set("format", "JSON");

                const response = await fetch(url.href);

                if (!response.ok) {
                    const errMsg = await response.text();
                    console.error("[FCH] platform/build commit request error", new Error(errMsg));
                    alert("Status: " + response.status + "\n\n" + errMsg.trim());
                    return;
                }

                const body = parseGitilesJson(await response.text());

                const commitMsg = (body.message ?? "").split("\n")[0];
                let commitDate = new Date(body.committer.time);
                if (isNaN(+commitDate)) {
                    alert("Invalid date");
                    return;
                }

                if (confirm(
                    `Message: ${commitMsg}

Authored by: ${body.author.name} <${body.author.email}>
Committed by: ${body.committer.name} <${body.committer.email}>

Commit date: ${commitDate.toISOString()}

Does this seem correct?`)) {
                    if (body.committer.email == "initial-contribution@android.com"
                        && (commitMsg.startsWith("auto import from ") || commitMsg.startsWith("Automated import from ")
                            || commitMsg.includes("Code drop from //branches/")
                            || (body.message ?? "").includes("Automated import of CL "))) {
                        if (confirm("This commit appears to be a import from Perforce (or SVN?) (commonly seen pre-Dount).\n"
                                    + "Each import commit's dates appear to be seconds apart, which may cause detection inaccuracy.\n\n"
                                    + "Adjust reference time by 5 minutes for safety?"))
                            commitDate = new Date(commitDate.getTime() + 5*60000);
                    }
                    setForCurrentSite("referenceTime", +commitDate);
                    updateRefTimeDisp();
                }
            }
            setByCommitBtn.addEventListener("click", async function() {
                setByCommitWorkingEl.style.display = "";
                try {
                    await setByCommitBtnOnClickReal();
                } catch (ex) {
                    console.error("[FCH] setByCommitBtnOnClickReal error", ex);
                    alert(ex.stack);
                }
                setByCommitWorkingEl.style.display = "none";
            });
        } else {
            rtsTerminateQuote();
        }

        const panelRight = createFloatingPanel("right");
        panelRight.appendChild(generateButton("Locate", function() {
            const newLoc = new URL(location);
            const start = prompt("Commit to locate in this log:", newLoc.searchParams.get("s") || "").trim();
            if (!start || start === "") return;
            newLoc.searchParams.set("s", start);
            location.href = newLoc.href;
        }));
    })();
} else if (document.querySelector(".TreeDetail") || document.querySelector(".Diff")) {
    (function() {
        const metadata = document.querySelectorAll(".Metadata > table > tbody");
        const metadata1 = metadata.length >= 1 ? metadata[0] : null;
        if (!metadata1) return;
        const metadata2 = metadata.length >= 2 ? metadata[1] : metadata1;

        let commitRow = metadata1.querySelector(":scope > tr:nth-child(1)");
        if (commitRow.querySelector(":scope > .Metadata-title").innerText != "commit")
            commitRow = metadata2.querySelector(":scope > tr:nth-child(1)");
        if (commitRow.querySelector(":scope > .Metadata-title").innerText == "commit") {
            const commitEl = commitRow.querySelector(":scope > td:nth-child(2)");
            const commit = commitEl.innerText;
            commitEl.appendChild(createCopyButtonFactory("Copy hash")(commit));
            const dLog = commitRow.querySelector(":scope > td:nth-child(3)");
            const headLogUrl = new URL(getPathToRef(getRepoHomePath(location.pathname), "HEAD", "log"), location.origin);
            headLogUrl.searchParams.set("s", commit);
            dLog.appendChild(document.createTextNode(" "));
            const headLogLinkContainer = dLog.appendChild(createElement("span"));
            headLogLinkContainer.appendChild(document.createTextNode("["));
            const headLogLink = headLogLinkContainer.appendChild(createElement("a"));
            headLogLink.href = headLogUrl.href;
            headLogLink.innerText = "log@HEAD";
            headLogLinkContainer.appendChild(document.createTextNode("]"));
        }

        function highlightCommitterOrTaggerRow(row) {
            const committerEl = row.querySelector(":scope > td:nth-child(2)");

            const committerEmailMatch = committerEl.innerText.match("<([^<>]+?)>$");
            // TODO: more specific patterns to match expected committers
            if (committerEmailMatch && matchesPatterns(committerEmailMatch[1], AUTHOR_ALLOWLIST))
                committerEl.style.backgroundColor = "#ffee3366";

            const refTime = new Date(getForCurrentSite("referenceTime"));
            const commitTimeEl = row.querySelector(":scope > td:nth-child(3)");
            const commitTime = new Date(commitTimeEl.innerText);
            const commitMsg = document.body.querySelector(".Container > .MetadataMessage")?.innerText;
            const lesser = commitMsg ? matchesPatterns(commitMsg, ALERTABLE_COMMENT_MESSAGE_PATTERNS) : false;
            if (!isNaN(+commitTime) && commitTime <= refTime) {
                // <arbitary color> or .CommitLog-item--fch-lightedUp
                // TODO: do I use CSS for this?
                commitTimeEl.style.backgroundColor = lesser ? "#aadfff77" : "#ffff00";
            }
        }

        let committerRow = metadata1.querySelector(":scope > tr:nth-child(3)");
        if (committerRow.querySelector(":scope > .Metadata-title").innerText != "committer")
            committerRow = metadata2.querySelector(":scope > tr:nth-child(3)");
        if (committerRow.querySelector(":scope > .Metadata-title").innerText == "committer")
            highlightCommitterOrTaggerRow(committerRow);

        let taggerRow = metadata1.querySelector(":scope > tr:nth-child(2)");
        if (taggerRow.querySelector(":scope > .Metadata-title").innerText == "tagger")
            highlightCommitterOrTaggerRow(taggerRow);
    })();
}

