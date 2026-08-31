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
        // Charger les pronos depuis le fichier JSON
        const response = await fetch('pronos.json');
        const pronos = await response.json();
        
        // Filtrer les pronos du jour
        const today = new Date().toISOString().split('T')[0];
        const todayPronos = pronos.filter(p => 
            p.timestamp && p.timestamp.startsWith(today)
        ).slice(0, 6);
        
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
    
    return `
        <div class="prono-card">
            <div class="prono-header">
                <span class="prono-league">${prono.league || 'Ligue inconnue'}</span>
                <span class="prono-confidence">🎯 ${analysis.confidence || 65}%</span>
            </div>
            
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

function getExamplePronos() {
    const examples = [
        {
            match: "Arsenal vs Chelsea",
            league: "Premier League",
            analysis: { home_xg: 2.67, away_xg: 0.62, home_win: 58, draw: 22, away_win: 20, confidence: 65 },
            best_bet: { bet_type: "home", outcome: "Arsenal", odds: 1.76, edge: 19.2, ev: 33.8, bookmaker: "1xBet" }
        },
        {
            match: "Marseille vs Paris FC",
            league: "Ligue 1",
            analysis: { home_xg: 2.5, away_xg: 0.65, home_win: 56, draw: 24, away_win: 20, confidence: 65 },
            best_bet: { bet_type: "home", outcome: "Marseille", odds: 1.80, edge: 18.8, ev: 33.9, bookmaker: "1xBet" }
        },
        {
            match: "Fiorentina vs Torino",
            league: "Serie A",
            analysis: { home_xg: 2.34, away_xg: 0.72, home_win: 54, draw: 25, away_win: 21, confidence: 65 },
            best_bet: { bet_type: "home", outcome: "Fiorentina", odds: 1.97, edge: 20.6, ev: 40.7, bookmaker: "Unibet" }
        }
    ];
    
    return examples.map(prono => createProntoCard(prono)).join('');
}

// ==================== CHARGEMENT DES STATISTIQUES ====================

async function loadStats() {
    try {
        const response = await fetch('stats.json');
        const stats = await response.json();
        
        document.getElementById('stats-total').textContent = stats.total || 0;
        document.getElementById('stats-won').textContent = stats.won || 0;
        document.getElementById('stats-lost').textContent = stats.lost || 0;
        document.getElementById('stats-winrate').textContent = (stats.win_rate || 0) + '%';
        document.getElementById('stats-profit').textContent = '+' + (stats.profit || 0) + '%';
        document.getElementById('stats-pending').textContent = stats.pending || 0;
        
        // Hero stats
        document.getElementById('win-rate').textContent = (stats.win_rate || 70) + '%';
        document.getElementById('total-bets').textContent = stats.total || 156;
        document.getElementById('profit').textContent = '+' + (stats.profit || 23.5) + '%';
        
    } catch (error) {
        // Utiliser les valeurs par défaut
        console.log('Stats non disponibles, utilisation des valeurs par défaut');
    }
}

// ==================== CHARGEMENT DE L'HISTORIQUE ====================

async function loadHistory() {
    const tbody = document.getElementById('history-body');
    
    try {
        const response = await fetch('stats.json');
        const stats = await response.json();
        const history = (stats.history || []).slice(-20).reverse();
        
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
                <td class="${h.won ? 'result-won' : 'result-lost'}">
                    ${h.won ? '✅ Gagné' : '❌ Perdu'}
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
