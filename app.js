// GG Pronos - App JavaScript
document.addEventListener('DOMContentLoaded', function() {
    loadPronos();
    loadStats();
    loadHistory();
    
    // Actualiser toutes les 5 minutes
    setInterval(loadPronos, 300000);
});

// ==================== CHARGEMENT DES PRONOS ====================

async function loadPronos() {
    const container = document.getElementById('pronos-container');
    
    try {
        // D'abord essayer data.json (système unifié)
        let pronos = [];
        let stats = null;
        
        try {
            const dataResponse = await fetch('data.json');
            const data = await dataResponse.json();
            pronos = data.pronos_today || [];
            stats = data.stats || null;
        } catch(e) {
            // Fallback vers pronos.json
            const response = await fetch('pronos.json');
            pronos = await response.json();
        }
        
        // Mettre à jour les stats si disponibles
        if (stats) {
            updateStats(stats);
        }
        
        // Filtrer les pronos du jour ou à venir
        const now = new Date();
        const todayPronos = pronos.filter(p => {
            const t = p.time || p.timestamp || '';
            return t >= now.toISOString().split('T')[0];
        }).slice(0, 6);
        
        if (todayPronos.length === 0) {
            container.innerHTML = `
                <div class="loading">
                    <i class="fas fa-calendar-day"></i>
                    <p>Aucun prono pour aujourd'hui</p>
                    <p>Les prochains pronos seront disponibles à 12h00 ou 20h00</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = todayPronos.map(prono => createProntoCard(prono)).join('');
        
    } catch (error) {
        container.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Chargement des pronos...</p>
            </div>
        `;
        
        // Charger les pronos d'exemple si le fichier n'existe pas
        setTimeout(() => {
            container.innerHTML = getExamplePronos();
        }, 1000);
    }
}

function createProntoCard(prono) {
    const analysis = prono.analysis || {};
    const bestBet = prono.best_bet || {};
    const matchTime = prono.time || prono.timestamp || '';
    
    const betTypeLabels = {
        'home': 'Victoire domicile',
        'away': 'Victoire extérieur',
        'draw': 'Match nul',
        'over25': 'Plus de 2.5 buts',
        'under25': 'Moins de 2.5 buts',
        'bttsYes': 'Les deux équipes marquent',
        'bttsNo': 'Un seul(e) équipe marque'
    };
    
    const bookmakerLinks = {
        'Winamax': 'https://www.winamax.fr/parrainage/invite.php?code=GG7H9E',
        'Betclic': 'https://www.betclic.fr/',
        'Unibet': 'https://www.unibet.fr/',
        '1xBet': 'https://1xbet.com/',
        'Betfair': 'https://www.betfair.com/'
    };
    
    // Format date
    let dateStr = '';
    if (matchTime) {
        const d = new Date(matchTime.replace(' ', 'T'));
        dateStr = d.toLocaleDateString('fr-FR', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
    }
    
    return `
        <div class="prono-card">
            <div class="prono-header">
                <span class="prono-league">${prono.league || 'Ligue inconnue'}</span>
                <span class="prono-confidence">🎯 ${analysis.confidence || 0}%</span>
            </div>
            
            ${dateStr ? `<div class="prono-date" style="font-size:0.8em;color:#888;margin-bottom:5px;">📅 ${dateStr}</div>` : ''}
            
            <div class="prono-match">${prono.match || 'Match inconnu'}</div>
            
            <div class="prono-analysis">
                <div class="prono-analysis-row">
                    <span>xG domicile</span>
                    <span>${analysis.home_xg || '?'}</span>
                </div>
                <div class="prono-analysis-row">
                    <span>xG extérieur</span>
                    <span>${analysis.away_xg || '?'}</span>
                </div>
                <div class="prono-analysis-row">
                    <span>Probabilités</span>
                    <span>${analysis.home_win || '?'}% / ${analysis.draw || '?'}% / ${analysis.away_win || '?'}%</span>
                </div>
            </div>
            
            <div class="prono-bet">
                <div class="prono-bet-type">${betTypeLabels[bestBet.bet_type] || bestBet.outcome}</div>
                <div class="prono-odds">@ ${bestBet.odds || '?'}</div>
                <div class="prono-edge">Edge: +${bestBet.edge || '?'}% | EV: +${bestBet.ev || '?'}%</div>
            </div>
            
            <div class="prono-bookmaker">
                <a href="${bookmakerLinks[bestBet.bookmaker] || '#'}" target="_blank">
                    ${bestBet.bookmaker || 'Bookmaker'} →
                </a>
            </div>
        </div>
    `;
}

function updateStats(stats) {
    // Mettre à jour les stats dans le hero
    const winRateEl = document.getElementById('win-rate');
    const totalBetsEl = document.getElementById('total-bets');
    const profitEl = document.getElementById('profit');
    
    if (winRateEl) winRateEl.textContent = (stats.win_rate || 0) + '%';
    if (totalBetsEl) totalBetsEl.textContent = stats.total || 0;
    if (profitEl) profitEl.textContent = (stats.profit >= 0 ? '+' : '') + (stats.profit || 0) + '%';
    
    // Mettre à jour les stats détaillées
    const statsTotal = document.getElementById('stats-total');
    const statsWon = document.getElementById('stats-won');
    const statsLost = document.getElementById('stats-lost');
    const statsWinrate = document.getElementById('stats-winrate');
    const statsProfit = document.getElementById('stats-profit');
    const statsPending = document.getElementById('stats-pending');
    
    if (statsTotal) statsTotal.textContent = stats.total || 0;
    if (statsWon) statsWon.textContent = stats.won || 0;
    if (statsLost) statsLost.textContent = stats.lost || 0;
    if (statsWinrate) statsWinrate.textContent = (stats.win_rate || 0) + '%';
    if (statsProfit) statsProfit.textContent = '+' + (stats.profit || 0) + '%';
    if (statsPending) statsPending.textContent = stats.pending || 0;
}

function getExamplePronos() {
    return '<div class="loading"><i class="fas fa-calendar-day"></i><p>Aucun prono pour aujourd\'hui</p><p>Les prochains matchs arrivent bientôt !</p></div>';
}

// ==================== CHARGEMENT DES STATISTIQUES ====================

async function loadStats() {
    try {
        // Essayer data.json d'abord
        let stats = null;
        try {
            const dataResponse = await fetch('data.json');
            const data = await dataResponse.json();
            stats = data.stats;
        } catch(e) {
            const response = await fetch('stats.json');
            stats = await response.json();
        }
        
        if (stats) updateStats(stats);
        
        // Hero stats
        const winRateEl = document.getElementById('win-rate');
        const totalBetsEl = document.getElementById('total-bets');
        const profitEl = document.getElementById('profit');
        const edgeEl = document.getElementById('edge');
        
        if (winRateEl) winRateEl.textContent = (stats.win_rate || 0) + '%';
        if (totalBetsEl) totalBetsEl.textContent = stats.total || 0;
        if (profitEl) profitEl.textContent = (stats.profit >= 0 ? '+' : '') + (stats.profit || 0) + '%';
        if (edgeEl) edgeEl.textContent = '—';
        
    } catch (error) {
        // Utiliser les valeurs par défaut
        console.log('Stats non disponibles, utilisation des valeurs par défaut');
    }
}

// ==================== CHARGEMENT DE L'HISTORIQUE ====================

async function loadHistory() {
    const tbody = document.getElementById('history-body');
    
    try {
        let history = [];
        try {
            const dataResponse = await fetch('data.json');
            const data = await dataResponse.json();
            history = (data.history || []).slice(-20).reverse();
        } catch(e) {
            const response = await fetch('stats.json');
            const stats = await response.json();
            history = (stats.history || []).slice(-20).reverse();
        }
        
        if (history.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 30px;">
                        Aucun historique disponible
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = history.map(h => `
            <tr>
                <td>${h.date || '-'}</td>
                <td>${h.match || '-'}</td>
                <td>${h.bet || '-'}</td>
                <td>@ ${h.odds || '-'}</td>
                <td>${h.score || 'En attente'}</td>
                <td class="${h.won ? 'result-won' : (h.pending ? '' : 'result-lost')}">
                    ${h.won ? '✅ Gagné' : (h.pending ? '⏳ En attente' : '❌ Perdu')}
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 30px;">
                    Chargement de l'historique...
                </td>
            </tr>
        `;
    }
}
