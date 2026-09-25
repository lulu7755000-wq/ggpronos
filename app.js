"use strict";

const PARIS_TIME_ZONE = "Europe/Paris";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const BOOKMAKER_URLS = Object.freeze({
    winamax: "https://www.winamax.fr/parrainage/invite.php?code=GG7H9E",
    betclic: "https://www.betclic.fr/",
    unibet: "https://www.unibet.fr/",
    "1xbet": "https://1xbet.com/",
    betfair: "https://www.betfair.com/"
});
const BOOKMAKER_HOSTS = new Set([
    "www.winamax.fr",
    "www.betclic.fr",
    "www.unibet.fr",
    "1xbet.com",
    "www.betfair.com"
]);
const BET_TYPE_LABELS = Object.freeze({
    home: "Victoire domicile",
    away: "Victoire extérieur",
    draw: "Match nul",
    over25: "Plus de 2,5 buts",
    under25: "Moins de 2,5 buts",
    bttsYes: "Les deux équipes marquent",
    bttsNo: "Une équipe marque"
});
const RESULT_LABELS = Object.freeze({
    win: "Gagné",
    loss: "Perdu",
    pending: "En attente",
    void: "Annulé"
});
const appState = {
    dataPromise: null,
    betsPromise: null
};

class PublicDataError extends Error {
    constructor(kind, message) {
        super(message);
        this.name = "PublicDataError";
        this.kind = kind;
    }
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function asFiniteNumber(value) {
    if (isFiniteNumber(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function invalidData(message) {
    return new PublicDataError("json", message);
}

function parseIsoDate(value) {
    if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
        return null;
    }
    const dateParts = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    const calendarDate = new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3])));
    if (calendarDate.getUTCFullYear() !== Number(dateParts[1]) || calendarDate.getUTCMonth() !== Number(dateParts[2]) - 1 || calendarDate.getUTCDate() !== Number(dateParts[3])) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getSourceDate(record) {
    if (typeof record.time === "string" && record.time.trim() !== "") {
        return record.time;
    }
    if (typeof record.date === "string" && record.date.trim() !== "") {
        return record.date;
    }
    return null;
}

function getParisDayKey(date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: PARIS_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);
    const values = {};
    parts.forEach(function (part) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    });
    return values.year + "-" + values.month + "-" + values.day;
}

function isTodayOrLater(value) {
    const date = parseIsoDate(value);
    if (!date) {
        return false;
    }
    return getParisDayKey(date) >= getParisDayKey(new Date());
}

function formatDate(value) {
    const date = parseIsoDate(value);
    if (!date) {
        return "—";
    }
    return new Intl.DateTimeFormat("fr-FR", {
        timeZone: PARIS_TIME_ZONE,
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(date);
}

function formatDateTime(value) {
    const date = parseIsoDate(value);
    if (!date) {
        return "—";
    }
    if (typeof value !== "string" || value.indexOf("T") === -1) {
        return formatDate(value);
    }
    const day = new Intl.DateTimeFormat("fr-FR", {
        timeZone: PARIS_TIME_ZONE,
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(date);
    const time = new Intl.DateTimeFormat("fr-FR", {
        timeZone: PARIS_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
    return day + " à " + time;
}

function roundNumber(value, digits) {
    const factor = Math.pow(10, digits);
    const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function formatDecimal(value, digits) {
    const number = asFiniteNumber(value);
    if (number === null) {
        return "—";
    }
    return new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(roundNumber(number, digits));
}

function formatInteger(value) {
    return formatDecimal(value, 0);
}

function formatMoney(value) {
    const number = asFiniteNumber(value);
    return number === null ? "—" : formatDecimal(number, 2) + " €";
}

function formatSignedMoney(value) {
    const number = asFiniteNumber(value);
    if (number === null) {
        return "—";
    }
    const rounded = roundNumber(number, 2);
    if (rounded > 0) {
        return "+" + formatDecimal(Math.abs(rounded), 2) + " €";
    }
    return formatDecimal(rounded, 2) + " €";
}

function formatPercent(value) {
    const number = asFiniteNumber(value);
    return number === null ? "—" : formatDecimal(number, 1) + " %";
}

function formatSignedPercent(value) {
    const number = asFiniteNumber(value);
    if (number === null) {
        return "—";
    }
    const rounded = roundNumber(number, 1);
    if (rounded > 0) {
        return "+" + formatDecimal(Math.abs(rounded), 1) + " %";
    }
    return formatDecimal(rounded, 1) + " %";
}

function formatOdds(value) {
    const number = asFiniteNumber(value);
    return number === null ? "—" : formatDecimal(number, 2);
}

function createElement(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) {
        node.className = className;
    }
    if (text !== undefined && text !== null) {
        node.textContent = String(text);
    }
    return node;
}

function setText(id, value) {
    const node = document.getElementById(id);
    if (node) {
        node.textContent = value === null || value === undefined ? "—" : String(value);
    }
}

function clearNode(node) {
    if (node) {
        node.replaceChildren();
    }
}

function setTone(node, tone) {
    if (!node) {
        return;
    }
    node.classList.remove("tone-positive", "tone-negative", "tone-neutral");
    if (tone) {
        node.classList.add("tone-" + tone);
    }
}

function getTone(value) {
    const number = asFiniteNumber(value);
    if (number === null || roundNumber(number, 2) === 0) {
        return "neutral";
    }
    return number > 0 ? "positive" : "negative";
}

function errorMessage(error) {
    if (error && error.kind === "network") {
        return "Erreur réseau : impossible de charger la source publique. Vérifiez la connexion, puis rechargez la page.";
    }
    if (error && error.kind === "json") {
        return "JSON invalide : la source publique ne respecte pas le format attendu. Aucun exemple de remplacement n'est affiché.";
    }
    return "Données publiques indisponibles : aucune statistique de remplacement n'est affichée.";
}

function validatePublicStats(stats) {
    if (!isObject(stats)) {
        throw invalidData("Le champ stats de data.json doit être un objet.");
    }
    const countKeys = ["total", "won", "lost", "pending"];
    countKeys.forEach(function (key) {
        if (!Number.isInteger(stats[key]) || stats[key] < 0) {
            throw invalidData("Le champ stats." + key + " doit être un entier positif ou nul.");
        }
    });
    ["win_rate", "profit", "roi"].forEach(function (key) {
        if (!isFiniteNumber(stats[key])) {
            throw invalidData("Le champ stats." + key + " doit être un nombre fini.");
        }
    });
    if (stats.win_rate < 0 || stats.win_rate > 100) {
        throw invalidData("Le champ stats.win_rate doit être compris entre 0 et 100.");
    }
    return {
        total: stats.total,
        won: stats.won,
        lost: stats.lost,
        pending: stats.pending,
        win_rate: stats.win_rate,
        profit: stats.profit,
        roi: stats.roi
    };
}

function validateOptionalNumber(value, label) {
    if (value !== undefined && value !== null && !isFiniteNumber(value)) {
        throw invalidData("Le champ " + label + " doit être un nombre fini.");
    }
}

function validateProno(record, index) {
    if (!isObject(record)) {
        throw invalidData("Le prono " + index + " doit être un objet.");
    }
    if (typeof record.top_pick !== "boolean") {
        throw invalidData("Le champ top_pick du prono " + index + " doit être un booléen.");
    }
    if (record.top_pick && record.published !== true) {
        throw invalidData("Un top pick public doit avoir published=true.");
    }
    if (record.top_pick && record.has_bet !== true) {
        throw invalidData("Un top pick public doit avoir has_bet=true.");
    }
    if (typeof record.match !== "string" || record.match.trim() === "") {
        throw invalidData("Le champ match du prono " + index + " doit être une chaîne non vide.");
    }
    if (record.league !== undefined && record.league !== null && typeof record.league !== "string") {
        throw invalidData("Le champ league du prono " + index + " doit être une chaîne.");
    }
    if (record.has_bet !== undefined && record.has_bet !== null && typeof record.has_bet !== "boolean") {
        throw invalidData("Le champ has_bet du prono " + index + " doit être un booléen.");
    }
    const timeValue = getSourceDate(record);
    if (record.top_pick && !parseIsoDate(timeValue)) {
        throw invalidData("La date du prono " + index + " doit être une valeur ISO valide.");
    }
    if (record.analysis !== undefined && record.analysis !== null && !isObject(record.analysis)) {
        throw invalidData("Le champ analysis du prono " + index + " doit être un objet.");
    }
    if (record.analysis) {
        ["confidence", "home_xg", "away_xg", "home_win", "draw", "away_win"].forEach(function (key) {
            validateOptionalNumber(record.analysis[key], "analysis." + key);
        });
    }
    if (record.best_bet !== undefined && record.best_bet !== null && !isObject(record.best_bet)) {
        throw invalidData("Le champ best_bet du prono " + index + " doit être un objet.");
    }
    if (record.best_bet) {
        const bet = record.best_bet;
        ["bet_type", "outcome", "bookmaker"].forEach(function (key) {
            if (bet[key] !== undefined && bet[key] !== null && typeof bet[key] !== "string") {
                throw invalidData("Le champ best_bet." + key + " doit être une chaîne.");
            }
        });
        ["odds", "edge", "ev"].forEach(function (key) {
            validateOptionalNumber(bet[key], "best_bet." + key);
        });
        if (bet.odds !== undefined && bet.odds !== null && (!isFiniteNumber(bet.odds) || bet.odds <= 0)) {
            throw invalidData("Le champ best_bet.odds doit être un nombre strictement positif.");
        }
    }
}

function validateDataPayload(payload) {
    if (!isObject(payload)) {
        throw invalidData("La racine de data.json doit être un objet.");
    }
    if (payload.schema_version !== 2) {
        throw invalidData("La version du schéma public doit être 2.");
    }
    if (!Array.isArray(payload.pronos_today)) {
        throw invalidData("Le champ pronos_today de data.json doit être un tableau.");
    }
    if (payload.last_update !== undefined && payload.last_update !== null) {
        if (typeof payload.last_update !== "string" || !parseIsoDate(payload.last_update)) {
            throw invalidData("Le champ last_update de data.json doit être une date ISO valide.");
        }
    }
    const stats = validatePublicStats(payload.stats);
    payload.pronos_today.forEach(validateProno);
    return {
        pronos: payload.pronos_today,
        stats: stats,
        lastUpdate: payload.last_update || null
    };
}

function normalizeResult(result) {
    if (typeof result !== "string") {
        return null;
    }
    const aliases = {
        win: "win",
        won: "win",
        loss: "loss",
        lost: "loss",
        pending: "pending",
        void: "void",
        canceled: "void",
        cancelled: "void"
    };
    return Object.prototype.hasOwnProperty.call(aliases, result) ? aliases[result] : null;
}

function normalizePublishedBet(record, index) {
    if (!isObject(record) || typeof record.published !== "boolean") {
        throw invalidData("L'entrée site_bets " + index + " doit être un objet avec published booléen.");
    }
    if (record.published !== true) {
        throw invalidData("L'entrée site_bets " + index + " ne doit pas contenir de pari privé.");
    }
    const timeValue = getSourceDate(record);
    const timestamp = parseIsoDate(timeValue);
    if (!timestamp) {
        throw invalidData("La date de l'entrée site_bets " + index + " doit être ISO et exploitable.");
    }
    if (typeof record.match !== "string" || record.match.trim() === "") {
        throw invalidData("Le match de l'entrée site_bets " + index + " doit être une chaîne non vide.");
    }
    if (typeof record.betOn !== "string" || record.betOn.trim() === "") {
        throw invalidData("Le pari de l'entrée site_bets " + index + " doit être une chaîne non vide.");
    }
    if (typeof record.cote !== "number" || !Number.isFinite(record.cote) || record.cote <= 0) {
        throw invalidData("La cote de l'entrée site_bets " + index + " doit être un nombre fini positif.");
    }
    if (typeof record.stake !== "number" || !Number.isFinite(record.stake) || record.stake < 0) {
        throw invalidData("La mise de l'entrée site_bets " + index + " doit être un nombre fini positif ou nul.");
    }
    const result = normalizeResult(record.result);
    if (!result) {
        throw invalidData("Le résultat de l'entrée site_bets " + index + " est invalide.");
    }
    if (record.score !== undefined && record.score !== null && typeof record.score !== "string") {
        throw invalidData("Le score de l'entrée site_bets " + index + " doit être une chaîne.");
    }
    if (result === "pending") {
        if (record.pnl !== undefined && record.pnl !== null && !isFiniteNumber(record.pnl)) {
            throw invalidData("Le P&L pending de l'entrée site_bets " + index + " doit être un nombre ou null.");
        }
    } else if (!isFiniteNumber(record.pnl)) {
        throw invalidData("Le P&L de l'entrée site_bets " + index + " doit être un nombre fini.");
    }
    if (result === "void" && record.pnl !== 0) {
        throw invalidData("Un pari annulé doit avoir un P&L nul.");
    }
    if (record.edge !== undefined && record.edge !== null && !isFiniteNumber(record.edge)) {
        throw invalidData("L'edge de l'entrée site_bets " + index + " doit être un nombre fini ou null.");
    }
    return {
        id: typeof record.id === "string" ? record.id : "",
        match: record.match,
        betOn: record.betOn,
        cote: record.cote,
        stake: record.stake,
        result: result,
        pnl: result === "pending" ? null : record.pnl,
        score: typeof record.score === "string" ? record.score : "",
        time: timeValue,
        timestamp: timestamp.getTime(),
        edge: record.edge === undefined ? null : record.edge,
        published: true
    };
}

function loadData() {
    if (!appState.dataPromise) {
        appState.dataPromise = Promise.resolve()
            .then(function () {
                return fetch("data.json", { cache: "no-store" });
            })
            .then(function (response) {
                if (!response.ok) {
                    throw new PublicDataError("network", "data.json a répondu avec le statut HTTP " + response.status + ".");
                }
                return Promise.resolve().then(function () {
                    return response.json();
                }).then(function (payload) {
                    return payload;
                }, function () {
                    throw invalidData("data.json contient un JSON illisible.");
                });
            }, function () {
                throw new PublicDataError("network", "La requête vers data.json a échoué.");
            })
            .then(validateDataPayload);
    }
    return appState.dataPromise;
}

function loadPublishedBets() {
    if (!appState.betsPromise) {
        appState.betsPromise = Promise.resolve()
            .then(function () {
                return fetch("site_bets.json", { cache: "no-store" });
            })
            .then(function (response) {
                if (!response.ok) {
                    throw new PublicDataError("network", "site_bets.json a répondu avec le statut HTTP " + response.status + ".");
                }
                return Promise.resolve().then(function () {
                    return response.json();
                }).then(function (payload) {
                    return payload;
                }, function () {
                    throw invalidData("site_bets.json contient un JSON illisible.");
                });
            }, function () {
                throw new PublicDataError("network", "La requête vers site_bets.json a échoué.");
            })
            .then(function (payload) {
                if (!Array.isArray(payload)) {
                    throw invalidData("La racine de site_bets.json doit être un tableau.");
                }
                return payload.reduce(function (published, record, index) {
                    const normalized = normalizePublishedBet(record, index);
                    if (normalized) {
                        published.push(normalized);
                    }
                    return published;
                }, []);
            });
    }
    return appState.betsPromise;
}

function compareBets(first, second) {
    return first.timestamp - second.timestamp || String(first.id).localeCompare(String(second.id));
}

function sortedBets(bets) {
    return bets.slice().sort(compareBets);
}

function computeStats(bets) {
    const ordered = sortedBets(bets);
    let staked = 0;
    let pnl = 0;
    let wins = 0;
    let losses = 0;
    let oddsSum = 0;
    let edgeSum = 0;
    let edgeCount = 0;
    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;
    const curve = [];
    ordered.forEach(function (bet) {
        if (bet.result === "win") {
            wins += 1;
        } else if (bet.result === "loss") {
            losses += 1;
        }
        if (bet.result !== "win" && bet.result !== "loss") {
            return;
        }
        staked += bet.stake;
        pnl += bet.pnl;
        oddsSum += bet.cote;
        if (isFiniteNumber(bet.edge)) {
            edgeSum += bet.edge;
            edgeCount += 1;
        }
        cumulative += bet.pnl;
        peak = Math.max(peak, cumulative);
        maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
        curve.push({
            bet: bet,
            cumulative: cumulative
        });
    });
    const settled = wins + losses;
    const pending = ordered.filter(function (bet) {
        return bet.result === "pending";
    }).length;
    const voids = ordered.filter(function (bet) {
        return bet.result === "void";
    }).length;
    return {
        total: ordered.length,
        settled: settled,
        wins: wins,
        losses: losses,
        pending: pending,
        voids: voids,
        winRate: settled > 0 ? wins / settled * 100 : null,
        staked: staked,
        pnl: pnl,
        roi: staked > 0 ? pnl / staked * 100 : null,
        avgOdds: settled > 0 ? oddsSum / settled : null,
        avgEdge: edgeCount > 0 ? edgeSum / edgeCount : null,
        maxDrawdown: maxDrawdown,
        curve: curve
    };
}

function resultLabel(result) {
    return RESULT_LABELS[result] || "État inconnu";
}

function resultClass(result) {
    return "result-" + result;
}

function createResultBadge(result) {
    return createElement("span", "result-badge " + resultClass(result), resultLabel(result));
}

function addCell(row, value, className) {
    const cell = createElement("td", className, value);
    row.appendChild(cell);
    return cell;
}

function addTimeCell(row, value) {
    const cell = createElement("td");
    const time = createElement("time", null, formatDateTime(value));
    if (typeof value === "string") {
        time.dateTime = value;
    }
    cell.appendChild(time);
    row.appendChild(cell);
    return cell;
}

function addAnalysisRow(parent, label, value) {
    const row = createElement("div", "analysis-row");
    row.appendChild(createElement("span", "analysis-label", label));
    row.appendChild(createElement("span", "analysis-value", value));
    parent.appendChild(row);
}

function getAllowedBookmakerUrl(name) {
    if (typeof name !== "string") {
        return null;
    }
    const key = name.trim().toLowerCase();
    const url = Object.prototype.hasOwnProperty.call(BOOKMAKER_URLS, key) ? BOOKMAKER_URLS[key] : null;
    if (!url) {
        return null;
    }
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" || !BOOKMAKER_HOSTS.has(parsed.hostname)) {
            return null;
        }
        return url;
    } catch (error) {
        return null;
    }
}

function createPronoCard(record) {
    const analysis = isObject(record.analysis) ? record.analysis : {};
    const bestBet = isObject(record.best_bet) ? record.best_bet : null;
    const card = createElement("article", "prono-card");
    if (record.has_bet === true) {
        card.classList.add("has-bet");
    }
    const header = createElement("div", "prono-header");
    header.appendChild(createElement("span", "tag", record.league || "Compétition non renseignée"));
    header.appendChild(createElement("span", "tag tag-accent", "Sélection publique"));
    card.appendChild(header);
    const timeValue = getSourceDate(record);
    if (timeValue) {
        const time = createElement("time", "prono-date", formatDateTime(timeValue));
        time.dateTime = timeValue;
        card.appendChild(time);
    }
    card.appendChild(createElement("h3", "prono-match", record.match));
    const analysisBox = createElement("div", "analysis-box");
    addAnalysisRow(analysisBox, "Confiance du modèle", formatPercent(analysis.confidence));
    addAnalysisRow(analysisBox, "xG domicile", formatDecimal(analysis.home_xg, 2));
    addAnalysisRow(analysisBox, "xG extérieur", formatDecimal(analysis.away_xg, 2));
    addAnalysisRow(analysisBox, "Probabilité 1 / N / 2", formatPercent(analysis.home_win) + " / " + formatPercent(analysis.draw) + " / " + formatPercent(analysis.away_win));
    if (isObject(analysis.weather)) {
        const weather = analysis.weather;
        const weatherParts = [];
        if (typeof weather.label === "string" && weather.label.trim() !== "") {
            weatherParts.push(weather.label);
        }
        if (isFiniteNumber(weather.temp_c)) {
            weatherParts.push(formatDecimal(weather.temp_c, 0) + " °C");
        }
        if (typeof weather.city === "string" && weather.city.trim() !== "") {
            weatherParts.push(weather.city);
        }
        if (weatherParts.length > 0) {
            addAnalysisRow(analysisBox, "Météo", weatherParts.join(" · "));
        }
    }
    card.appendChild(analysisBox);
    if (bestBet) {
        const betBox = createElement("div", "bet-box");
        betBox.appendChild(createElement("div", "bet-label", "Pari public"));
        const type = Object.prototype.hasOwnProperty.call(BET_TYPE_LABELS, bestBet.bet_type) ? BET_TYPE_LABELS[bestBet.bet_type] : (bestBet.outcome || "Pari public");
        betBox.appendChild(createElement("div", "bet-type", type));
        betBox.appendChild(createElement("div", "bet-odds", "@ " + formatOdds(bestBet.odds)));
        const metrics = createElement("div", "bet-metrics");
        const edge = createElement("span", "bet-metric");
        edge.appendChild(createElement("strong", null, "Edge "));
        edge.appendChild(document.createTextNode(formatSignedPercent(bestBet.edge)));
        const ev = createElement("span", "bet-metric");
        ev.appendChild(createElement("strong", null, "EV "));
        ev.appendChild(document.createTextNode(formatSignedPercent(bestBet.ev)));
        metrics.appendChild(edge);
        metrics.appendChild(ev);
        betBox.appendChild(metrics);
        card.appendChild(betBox);
        const bookmakerUrl = getAllowedBookmakerUrl(bestBet.bookmaker);
        if (bookmakerUrl) {
            const link = createElement("a", "bookmaker-link", "Ouvrir " + bestBet.bookmaker);
            link.href = bookmakerUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            card.appendChild(link);
        } else {
            card.appendChild(createElement("div", "bookmaker-missing", "Bookmaker non référencé dans l'allowlist"));
        }
    } else {
        const betBox = createElement("div", "bet-box");
        betBox.appendChild(createElement("div", "bet-label", "Sélection publique"));
        betBox.appendChild(createElement("div", "bet-type", "Aucun pari bookmaker disponible"));
        card.appendChild(betBox);
    }
    return card;
}

function renderMessage(container, kind, title, message) {
    clearNode(container);
    const box = createElement("div", "state-message " + kind);
    box.setAttribute("role", kind === "error" ? "alert" : "status");
    box.dataset.state = kind;
    box.appendChild(createElement("strong", null, title));
    box.appendChild(createElement("p", null, message));
    container.appendChild(box);
}

function renderHomeStats(metrics) {
    const hasData = metrics.total > 0;
    setText("win-rate", hasData ? formatPercent(metrics.winRate) : "—");
    setText("total-bets", hasData ? formatInteger(metrics.total) : "—");
    setText("profit", hasData ? formatSignedMoney(metrics.pnl) : "—");
    setText("edge", hasData ? formatSignedPercent(metrics.avgEdge) : "—");
    setText("stats-total", hasData ? formatInteger(metrics.total) : "—");
    setText("stats-settled", hasData ? formatInteger(metrics.settled) : "—");
    setText("stats-won", hasData ? formatInteger(metrics.wins) : "—");
    setText("stats-lost", hasData ? formatInteger(metrics.losses) : "—");
    setText("stats-void", hasData ? formatInteger(metrics.voids) : "—");
    setText("stats-pending", hasData ? formatInteger(metrics.pending) : "—");
    setText("stats-winrate", hasData ? formatPercent(metrics.winRate) : "—");
    setText("stats-profit", hasData ? formatSignedMoney(metrics.pnl) : "—");
    setText("stats-roi", hasData ? formatSignedPercent(metrics.roi) : "—");
    setText("stats-staked", hasData ? formatMoney(metrics.staked) : "—");
    setText("stats-odds", hasData ? formatOdds(metrics.avgOdds) : "—");
    setTone(document.getElementById("profit"), getTone(metrics.pnl));
    setTone(document.getElementById("stats-profit"), getTone(metrics.pnl));
    setTone(document.getElementById("stats-roi"), getTone(metrics.roi));
    setTone(document.getElementById("edge"), getTone(metrics.avgEdge));
}

function resetHomeStats() {
    ["win-rate", "total-bets", "profit", "edge", "stats-total", "stats-settled", "stats-won", "stats-lost", "stats-void", "stats-pending", "stats-winrate", "stats-profit", "stats-roi", "stats-staked", "stats-odds"].forEach(function (id) {
        setText(id, "—");
    });
}

function renderHomeHistory(bets) {
    const tbody = document.getElementById("history-body");
    clearNode(tbody);
    const recent = sortedBets(bets).slice(-20).reverse();
    if (recent.length === 0) {
        const row = createElement("tr", "empty-row");
        const cell = createElement("td", null, "Aucun pari public disponible");
        cell.colSpan = 6;
        row.appendChild(cell);
        tbody.appendChild(row);
        return;
    }
    recent.forEach(function (bet) {
        const row = createElement("tr");
        addTimeCell(row, bet.time);
        addCell(row, bet.match);
        addCell(row, bet.betOn);
        addCell(row, formatOdds(bet.cote));
        addCell(row, bet.score || "—");
        const resultCell = createElement("td");
        resultCell.appendChild(createResultBadge(bet.result));
        row.appendChild(resultCell);
        tbody.appendChild(row);
    });
}

function renderHomePronos(data) {
    const container = document.getElementById("pronos-container");
    const source = document.getElementById("pronos-source");
    clearNode(container);
    const publicPronos = data.pronos.filter(function (prono) {
        return prono.top_pick === true && isTodayOrLater(getSourceDate(prono));
    });
    const updateText = data.lastUpdate ? " Mise à jour data.json : " + formatDateTime(data.lastUpdate) + "." : "";
    if (publicPronos.length === 0) {
        renderMessage(container, "no-prono", "Aucun prono public aujourd'hui", "La source est valide, mais aucun top pick public n'est disponible pour aujourd'hui ou plus tard. Aucun exemple n'est ajouté.");
        if (source) {
            source.textContent = "Aucun top pick public disponible." + updateText;
            source.dataset.state = "empty";
        }
        return;
    }
    publicPronos.forEach(function (prono) {
        container.appendChild(createPronoCard(prono));
    });
    if (source) {
        source.textContent = publicPronos.length + " top pick public affiché selon le filtre strict top_pick === true." + updateText;
        source.dataset.state = "ready";
    }
}

function initHome() {
    const dataResult = loadData();
    const betsResult = loadPublishedBets();
    Promise.allSettled([dataResult, betsResult]).then(function (results) {
        const dataOutcome = results[0];
        const betsOutcome = results[1];
        const pronoContainer = document.getElementById("pronos-container");
        if (dataOutcome.status === "fulfilled") {
            renderHomePronos(dataOutcome.value);
        } else {
            renderMessage(pronoContainer, "error", "Données de pronos indisponibles", errorMessage(dataOutcome.reason));
            const source = document.getElementById("pronos-source");
            if (source) {
                source.textContent = errorMessage(dataOutcome.reason);
                source.dataset.state = "error";
            }
        }
        if (betsOutcome.status === "fulfilled") {
            const metrics = computeStats(betsOutcome.value);
            renderHomeStats(metrics);
            renderHomeHistory(betsOutcome.value);
            const statsSource = document.getElementById("stats-source");
            if (statsSource) {
                const dataStatsNote = dataOutcome.status === "fulfilled" ? " Les stats data.json sont validées sans remplacer ce calcul." : " Les stats data.json sont indisponibles et ne remplacent pas ce calcul.";
                statsSource.textContent = "Performance recalculée depuis " + metrics.total + " entrées de site_bets.json avec published=true." + dataStatsNote;
                statsSource.dataset.state = "ready";
            }
            const historySource = document.getElementById("history-source");
            if (historySource) {
                historySource.textContent = "Historique public filtré sur published=true.";
                historySource.dataset.state = "ready";
            }
        } else {
            resetHomeStats();
            const tbody = document.getElementById("history-body");
            const row = createElement("tr", "empty-row");
            const cell = createElement("td", null, "Historique indisponible : aucune donnée de remplacement n'est affichée.");
            cell.colSpan = 6;
            row.appendChild(cell);
            clearNode(tbody);
            tbody.appendChild(row);
            const statsSource = document.getElementById("stats-source");
            if (statsSource) {
                statsSource.textContent = errorMessage(betsOutcome.reason);
                statsSource.dataset.state = "error";
            }
            const historySource = document.getElementById("history-source");
            if (historySource) {
                historySource.textContent = errorMessage(betsOutcome.reason);
                historySource.dataset.state = "error";
            }
        }
    });
}

function filterBets(bets, filter) {
    if (filter === "win") {
        return bets.filter(function (bet) {
            return bet.result === "win";
        });
    }
    if (filter === "loss") {
        return bets.filter(function (bet) {
            return bet.result === "loss";
        });
    }
    if (filter === "pending") {
        return bets.filter(function (bet) {
            return bet.result === "pending";
        });
    }
    if (filter === "void") {
        return bets.filter(function (bet) {
            return bet.result === "void";
        });
    }
    return bets.slice();
}

function createEmptyTableRow(tbody, colspan, message) {
    const row = createElement("tr", "empty-row");
    const cell = createElement("td", null, message);
    cell.colSpan = colspan;
    row.appendChild(cell);
    clearNode(tbody);
    tbody.appendChild(row);
}

function formatBetPnl(bet) {
    if (bet.result === "pending") {
        return "—";
    }
    if (bet.result === "void") {
        return formatMoney(0);
    }
    return formatSignedMoney(bet.pnl);
}

function renderTrackTable(tbody, bets, filter) {
    const list = sortedBets(filterBets(bets, filter)).reverse();
    clearNode(tbody);
    if (list.length === 0) {
        createEmptyTableRow(tbody, 9, "Aucun pari public dans ce filtre");
        return list.length;
    }
    list.forEach(function (bet) {
        const row = createElement("tr");
        addTimeCell(row, bet.time);
        addCell(row, bet.match);
        addCell(row, bet.betOn);
        addCell(row, formatOdds(bet.cote));
        addCell(row, formatMoney(bet.stake));
        addCell(row, bet.score || "—");
        const resultCell = createElement("td");
        resultCell.appendChild(createResultBadge(bet.result));
        row.appendChild(resultCell);
        const pnlCell = addCell(row, formatBetPnl(bet), getTone(bet.result === "pending" ? null : bet.pnl));
        if (bet.result === "pending") {
            setTone(pnlCell, null);
        }
        const sourceCell = createElement("td");
        sourceCell.appendChild(createElement("span", "source-pill", "Public"));
        row.appendChild(sourceCell);
        tbody.appendChild(row);
    });
    return list.length;
}

function renderBankrollTable(tbody, bets, filter) {
    const list = sortedBets(filterBets(bets, filter)).reverse();
    clearNode(tbody);
    if (list.length === 0) {
        createEmptyTableRow(tbody, 8, "Aucun pari public dans ce filtre");
        return list.length;
    }
    list.forEach(function (bet) {
        const row = createElement("tr");
        addTimeCell(row, bet.time);
        addCell(row, bet.match);
        addCell(row, bet.betOn);
        addCell(row, formatOdds(bet.cote));
        addCell(row, formatMoney(bet.stake));
        addCell(row, bet.score || "—");
        const resultCell = createElement("td");
        resultCell.appendChild(createResultBadge(bet.result));
        row.appendChild(resultCell);
        const pnlCell = addCell(row, formatBetPnl(bet), getTone(bet.result === "pending" ? null : bet.pnl));
        if (bet.result === "pending") {
            setTone(pnlCell, null);
        }
        tbody.appendChild(row);
    });
    return list.length;
}

function setupFilters(root, initialFilter, onChange) {
    if (!root) {
        return;
    }
    const buttons = Array.from(root.querySelectorAll("button[data-filter]"));
    let current = initialFilter;
    function select(filter) {
        current = filter;
        buttons.forEach(function (button) {
            button.setAttribute("aria-pressed", button.dataset.filter === current ? "true" : "false");
        });
        onChange(current);
    }
    buttons.forEach(function (button) {
        button.addEventListener("click", function () {
            select(button.dataset.filter);
        });
    });
    select(initialFilter);
}

function chartSummary(curve) {
    if (curve.length === 0) {
        return "Aucune courbe disponible : aucun pari réglé n'est encore présent dans la source publique.";
    }
    const first = curve[0].bet;
    const last = curve[curve.length - 1].bet;
    return curve.length + " paris réglés, du " + formatDate(first.time) + " au " + formatDate(last.time) + ". Profit final : " + formatSignedMoney(curve[curve.length - 1].cumulative) + ".";
}

function drawProfitChart(canvas, curve) {
    const fallback = document.getElementById(canvas ? canvas.dataset.fallback : "");
    const summary = chartSummary(curve);
    if (fallback) {
        fallback.textContent = summary;
    }
    if (!canvas) {
        return;
    }
    canvas.setAttribute("aria-label", summary);
    let context = null;
    try {
        context = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    } catch (error) {
        context = null;
    }
    if (!context) {
        canvas.hidden = true;
        return;
    }
    canvas.hidden = false;
    const width = Math.max(260, Math.floor(canvas.getBoundingClientRect().width || 640));
    const height = Math.max(180, Math.floor(canvas.getBoundingClientRect().height || 240));
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (curve.length === 0) {
        context.fillStyle = "#9aaac0";
        context.font = "14px system-ui, sans-serif";
        context.textAlign = "center";
        context.fillText("Aucun résultat réglé", width / 2, height / 2);
        return;
    }
    const values = curve.map(function (point) {
        return point.cumulative;
    });
    const minimum = Math.min(0, Math.min.apply(null, values));
    let maximum = Math.max(0, Math.max.apply(null, values));
    if (maximum === minimum) {
        maximum = minimum + 1;
    }
    const padding = 34;
    function xAt(index) {
        return padding + (width - padding * 2) * (curve.length === 1 ? .5 : index / (curve.length - 1));
    }
    function yAt(value) {
        return height - padding - (value - minimum) / (maximum - minimum) * (height - padding * 2);
    }
    context.strokeStyle = "rgba(154, 170, 192, .35)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(padding, yAt(0));
    context.lineTo(width - padding, yAt(0));
    context.stroke();
    const lastValue = curve[curve.length - 1].cumulative;
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, lastValue >= 0 ? "rgba(105, 224, 174, .28)" : "rgba(255, 143, 155, .25)");
    gradient.addColorStop(1, "rgba(7, 11, 20, 0)");
    context.beginPath();
    curve.forEach(function (point, index) {
        const x = xAt(index);
        const y = yAt(point.cumulative);
        if (index === 0) {
            context.moveTo(x, y);
        } else {
            context.lineTo(x, y);
        }
    });
    context.strokeStyle = lastValue >= 0 ? "#69e0ae" : "#ff8f9b";
    context.lineWidth = 2.5;
    context.stroke();
    context.lineTo(xAt(curve.length - 1), yAt(0));
    context.lineTo(xAt(0), yAt(0));
    context.closePath();
    context.fillStyle = gradient;
    context.fill();
    context.fillStyle = "#9aaac0";
    context.font = "11px system-ui, sans-serif";
    context.textAlign = "left";
    context.fillText(formatMoney(maximum), 4, Math.max(14, yAt(maximum) + 4));
    context.fillText(formatMoney(minimum), 4, Math.min(height - 6, yAt(minimum) + 4));
}

function performanceConfig(page) {
    if (page === "track") {
        return {
            total: "track-total",
            settled: "track-settled",
            winRate: "track-winrate",
            pnl: "track-profit",
            roi: "track-roi",
            odds: "track-odds",
            drawdown: "track-drawdown",
            voids: "track-void",
            pending: "track-pending",
            sample: "track-sample",
            source: "track-source",
            tableStatus: "track-table-status",
            table: "track-rows",
            filters: "track-filters",
            chart: "track-chart",
            tableColumns: 9,
            renderTable: renderTrackTable
        };
    }
    return {
        total: "bankroll-total",
        settled: "bankroll-settled",
        winRate: "bankroll-winrate",
        pnl: "bankroll-profit",
        roi: "bankroll-roi",
        odds: "bankroll-odds",
        drawdown: "bankroll-drawdown",
        voids: "bankroll-void",
        pending: "bankroll-pending",
        sample: "bankroll-sample",
        source: "bankroll-source",
        tableStatus: "bankroll-table-status",
        table: "bankroll-rows",
        filters: "bankroll-filters",
        chart: "bankroll-chart",
        tableColumns: 8,
        renderTable: renderBankrollTable
    };
}

function resetPerformance(config, message) {
    [config.total, config.settled, config.winRate, config.pnl, config.roi, config.odds, config.drawdown, config.voids, config.pending].forEach(function (id) {
        setText(id, "—");
    });
    const sample = document.getElementById(config.sample);
    if (sample) {
        sample.textContent = message;
    }
    const source = document.getElementById(config.source);
    if (source) {
        source.textContent = message;
        source.dataset.state = "error";
    }
    const tbody = document.getElementById(config.table);
    if (tbody) {
        createEmptyTableRow(tbody, config.tableColumns, "Données indisponibles : aucune ligne de remplacement n'est affichée.");
    }
    const canvas = document.getElementById(config.chart);
    if (canvas) {
        canvas.hidden = true;
        const fallback = document.getElementById(canvas.dataset.fallback);
        if (fallback) {
            fallback.textContent = message;
        }
    }
}

function renderPerformanceStats(config, metrics) {
    const hasData = metrics.total > 0;
    setText(config.total, hasData ? formatInteger(metrics.total) : "—");
    setText(config.settled, hasData ? formatInteger(metrics.settled) : "—");
    setText(config.winRate, hasData ? formatPercent(metrics.winRate) : "—");
    setText(config.pnl, hasData ? formatSignedMoney(metrics.pnl) : "—");
    setText(config.roi, hasData ? formatSignedPercent(metrics.roi) : "—");
    setText(config.odds, hasData ? formatOdds(metrics.avgOdds) : "—");
    setText(config.drawdown, hasData ? formatMoney(-metrics.maxDrawdown) : "—");
    setText(config.voids, hasData ? formatInteger(metrics.voids) : "—");
    setText(config.pending, hasData ? formatInteger(metrics.pending) : "—");
    setTone(document.getElementById(config.pnl), getTone(metrics.pnl));
    setTone(document.getElementById(config.roi), getTone(metrics.roi));
    const sample = document.getElementById(config.sample);
    if (sample) {
        if (!hasData) {
            sample.textContent = "Aucun pari public dans la source.";
        } else if (metrics.settled < 100) {
            sample.textContent = "Échantillon de " + formatInteger(metrics.settled) + " paris réglés : prudence dans l'interprétation.";
        } else {
            sample.textContent = "Échantillon de " + formatInteger(metrics.settled) + " paris réglés : les résultats passés ne préjugent pas des résultats futurs.";
        }
    }
    const source = document.getElementById(config.source);
    if (source) {
        source.textContent = "Source : " + metrics.total + " entrées site_bets.json filtrées avec published=true. Mises et P&L sont recalculés sur cette même source.";
        source.dataset.state = "ready";
    }
}

function initPerformancePage(page) {
    const config = performanceConfig(page);
    loadPublishedBets().then(function (bets) {
        const metrics = computeStats(bets);
        renderPerformanceStats(config, metrics);
        const tbody = document.getElementById(config.table);
        const tableStatus = document.getElementById(config.tableStatus);
        let currentFilter = "all";
        function renderTable(filter) {
            currentFilter = filter;
            const count = config.renderTable(tbody, bets, currentFilter);
            if (tableStatus) {
                tableStatus.textContent = count + " ligne" + (count > 1 ? "s" : "") + " affichée" + (count > 1 ? "s" : "") + " dans le filtre " + filter + ".";
            }
        }
        setupFilters(document.getElementById(config.filters), currentFilter, renderTable);
        const canvas = document.getElementById(config.chart);
        const redraw = function () {
            drawProfitChart(canvas, metrics.curve);
        };
        redraw();
        let resizeFrame = null;
        window.addEventListener("resize", function () {
            if (resizeFrame !== null) {
                return;
            }
            if (typeof window.requestAnimationFrame === "function") {
                resizeFrame = window.requestAnimationFrame(function () {
                    resizeFrame = null;
                    redraw();
                });
            } else {
                resizeFrame = window.setTimeout(function () {
                    resizeFrame = null;
                    redraw();
                }, 100);
            }
        }, { passive: true });
    }).catch(function (error) {
        resetPerformance(config, errorMessage(error));
    });
}

function initNavigation() {
    const toggle = document.querySelector(".menu-toggle");
    const nav = document.getElementById("primary-nav");
    const header = document.querySelector(".site-header");
    if (!toggle || !nav || !header) {
        return;
    }
    let open = false;
    function setOpen(next) {
        open = next;
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        nav.dataset.collapsed = open ? "false" : "true";
        nav.classList.toggle("is-open", open);
    }
    setOpen(false);
    toggle.addEventListener("click", function () {
        setOpen(!open);
        if (open) {
            const firstLink = nav.querySelector("a");
            if (firstLink) {
                firstLink.focus();
            }
        }
    });
    nav.addEventListener("click", function (event) {
        if (event.target.closest("a")) {
            setOpen(false);
        }
    });
    document.addEventListener("click", function (event) {
        if (open && !header.contains(event.target)) {
            setOpen(false);
        }
    });
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && open) {
            setOpen(false);
            toggle.focus();
        }
    });
}

function refreshHome() {
    appState.dataPromise = null;
    appState.betsPromise = null;
    initHome();
}

function init() {
    initNavigation();
    const page = document.body.dataset.page;
    if (page === "home") {
        initHome();
        window.setInterval(refreshHome, 300000);
    } else if (page === "track") {
        initPerformancePage("track");
    } else if (page === "bankroll") {
        initPerformancePage("bankroll");
    }
}

document.documentElement.classList.add("js");
document.addEventListener("DOMContentLoaded", init);
