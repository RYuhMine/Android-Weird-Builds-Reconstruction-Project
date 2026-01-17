// ==UserScript==
// @name         Froyocomb Helper (with BUILD_ID)
// @namespace    https://github.com/froyocomb
// @version      v1.1.11c_Reimu_2
// @description  Tool for searching commits. Includes rate-limited BUILD_ID fetcher and visibility toggle.
// @author       Liu Wenyuan & Froyocomb Team & Reimu & AI
// @match        https://android.googlesource.com/*
// @match        https://chromium.googlesource.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-end
// ==/UserScript==

"use strict";

const SITE = location.hostname.split(".").reverse()[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- STYLES ---
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
    margin-right: 8px;
    min-width: 40px;
    text-align: center;
    vertical-align: middle;
}
.fch-BuildId.loading { color: #5f6368; background-color: #f1f3f4; border-color: #dadce0; }
.fch-BuildId.not-found { opacity: 0.5; background-color: #eee; color: #999; }

/* Приховування, якщо вимкнено галочку */
body.fch-hide-builds .fch-BuildId { display: none !important; }

/* Стиль для галочки зліва зверху */
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
}
`);

// --- UI TOGGLE LOGIC ---
function setupToggle() {
    const container = createElement("label");
    container.id = "fch-toggle-container";

    const checkbox = createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = GM_getValue("show_build_ids", true);

    if (!checkbox.checked) document.body.classList.add("fch-hide-builds");

    checkbox.addEventListener("change", () => {
        GM_setValue("show_build_ids", checkbox.checked);
        document.body.classList.toggle("fch-hide-builds", !checkbox.checked);
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

const createElement = document.createElement.bind(document);

let floatingPanelStylesPresent = false;
function createFloatingPanel(variant) {
    if (!floatingPanelStylesPresent) {
        GM_addStyle(`
.fch-FloatingPanel { position: fixed; padding: 8px; background: #ffdb00ee; }
.fch-FloatingPanel-bottom { left: 50%; bottom: 0; transform: translate3d(-50%, 0, 0); }
.fch-FloatingPanel-right { right: 0; top: 3em; transform: translate3d(0, 0, 0); }
.fch-FloatingPanel button { font: inherit; }
`);
        floatingPanelStylesPresent = true;
    }
    const panel = document.body.insertAdjacentElement("afterBegin", createElement("div"));
    panel.classList.add("fch-FloatingPanel");
    panel.classList.add("fch-FloatingPanel-" + (variant ?? "bottom"));
    return panel;
}

function addListItem(list, content) {
    const item = list.appendChild(createElement("li"));
    if (content) item.appendChild(content);
    return content;
}

function generateButton(text, onClick) {
    const button = createElement("button");
    button.type = "button";
    button.innerText = text;
    if (onClick) button.addEventListener("click", onClick);
    return button;
}

let copyButtonStylePresent = false;
function createCopyButtonFactory(title) {
    if (!copyButtonStylePresent) {
        GM_addStyle(`
.fch-CopyButton { font: inherit; position: relative; margin-left: 2px; margin-right: 3px; }
@keyframes fch-CopyButton-Toast-Anim { from, 33.333% { opacity: 1; } to { opacity: 0; bottom: calc(100% + 1em); } }
.fch-CopyButton-Toast { position: absolute; left: 50%; transform: translate3d(-50%, 0, 0); bottom: calc(100% + 0.3em); z-index: 10; width: max-content; padding: 2px 6px; background: #ffdb00f0; border: #ffe54755 2px solid; border-radius: 6px; opacity: 0; }
.fch-CopyButton-Toast-Done { animation: fch-CopyButton-Toast-Anim 1s ease-in-out; }
`);
        copyButtonStylePresent = true;
    }
    const button = generateButton("\u{1F4CB}");
    button.classList.add("fch-CopyButton");
    return function(text, copyCb) {
        const newButton = button.cloneNode(true);
        const newToast = newButton.querySelector(".fch-CopyButton-Toast");
        newButton.addEventListener("click", async () => {
            await navigator.clipboard.writeText(text);
            if (copyCb) copyCb(text);
            newToast.style.display = "";
            newToast.classList.add("fch-CopyButton-Toast-Done");
        });
        return newButton;
    }
}

function getRepoHomePath(pathname) {
    const i = pathname.indexOf("/+");
    return i >= 0 ? pathname.substring(0, i) : pathname.replace(/\/+$/, "");
}

function getPathToRef(homePath, ref, viewType="") {
    return homePath + `/+${viewType}/` + ref;
}

async function fetchAndInsertBuildId(commitHash, targetContainer, referenceElement) {
    const label = createElement("span");
    label.classList.add("fch-BuildId", "loading");
    label.innerText = "...";
    targetContainer.insertBefore(label, referenceElement);

    try {
        const repoPath = getRepoHomePath(location.pathname);
        const url = `${location.origin}${repoPath}/+/${commitHash}/core/build_id.mk?format=TEXT`;
        const response = await fetch(url);
        if (!response.ok) throw new Error();

        const text = atob(await response.text());
        // РЕГУЛЯРНИЙ ВИРАЗ: шукає BUILD_ID := або export BUILD_ID=
        const match = text.match(/^\s*(?:export\s+)?BUILD_ID\s*:?=\s*(.+)$/m);

        if (match && match[1]) {
            label.innerText = match[1].trim();
            label.classList.remove("loading");
        } else {
            label.innerText = "N/A";
            label.classList.add("not-found");
            label.classList.remove("loading");
        }
    } catch (e) { label.remove(); }
}

// Main logic
setupToggle();

if (document.querySelector(".CommitLog")) {
    (function() {
        const commits = Array.from(document.querySelectorAll(".CommitLog-item"));
        const createCopyButton = createCopyButtonFactory("Copy hash");
        const isBuildRepo = location.pathname.includes("/platform/build");

        for (const commit of commits) {
            const hashEl = commit.querySelector(".CommitLog-sha1");
            if (!hashEl) continue;
            const hash = new URL(hashEl.href).pathname.split("/").reverse()[0];
            hashEl.parentNode.insertBefore(createCopyButton(hash), hashEl.nextSibling);
        }

        if (isBuildRepo) {
            (async function() {
                for (const commit of commits) {
                    const hashEl = commit.querySelector(".CommitLog-sha1");
                    if (!hashEl) continue;
                    const hash = new URL(hashEl.href).pathname.split("/").reverse()[0];

                    await sleep(330); // ЗАТРИМКА ТУТ
                    await fetchAndInsertBuildId(hash, hashEl.parentNode, hashEl);
                }
            })();
        }

        // Панель управління (Light 'em up тощо) - залишено як було
        const panel = createFloatingPanel();
        const list = panel.appendChild(createElement("ul"));

        const lightedUpClz = "CommitLog-item--fch-lightedUp";
        const lightedUpExactClz = "CommitLog-item--fch-lightedUp-exact";
        const lightedUpLesserClz = "CommitLog-item--fch-lightedUp-lesser";
        const firstId = "fch-lightedUp-First";

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
