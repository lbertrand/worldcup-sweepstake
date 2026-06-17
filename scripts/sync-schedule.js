/**
 * sync-schedule.js — Syncs the tournament schedule from ESPN.
 * 
 * Usage: 
 *   node scripts/sync-schedule.js
 */

import fs from 'node:fs';
import https from 'node:https';

const url = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260720&limit=200';

console.log('Fetching matches from ESPN...');

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (!json.events) {
         console.error('API Error: No events found.');
         process.exit(1);
      }

      const matches = json.events.map((event, index) => {
        const competition = event.competitions[0];
        const homeCompetitor = competition.competitors.find(c => c.homeAway === 'home');
        const awayCompetitor = competition.competitors.find(c => c.homeAway === 'away');

        const homeTeam = homeCompetitor?.team?.displayName || 'TBD';
        const awayTeam = awayCompetitor?.team?.displayName || 'TBD';
        
        let group = null;
        if (competition.altGameNote && competition.altGameNote.includes('Group')) {
           const match = competition.altGameNote.match(/Group\s+([A-Z])/i);
           if (match) group = match[1].toUpperCase();
        }

        let round = 'GROUP';
        const slug = event.season.slug || '';
        if (slug.includes('round-of-32')) round = 'R32';
        else if (slug.includes('round-of-16')) round = 'R16';
        else if (slug.includes('quarter')) round = 'QF';
        else if (slug.includes('semi')) round = 'SF';
        else if (slug.includes('third') || slug.includes('3rd')) round = '3RD';
        else if (slug.includes('final')) round = 'FINAL';

        return {
          matchId: `WC2026-${(index + 1).toString().padStart(3, '0')}`,
          homeTeam: homeTeam.trim(),
          awayTeam: awayTeam.trim(),
          group: group,
          round: round,
          venue: competition.venue?.fullName || 'TBD',
          kickoff: event.date,
          apiFixtureId: event.id
        };
      });

      // Sort by kick-off time to maintain correct sequential match IDs
      matches.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
      
      // Re-assign IDs after sorting
      matches.forEach((m, idx) => {
         m.matchId = `WC2026-${(idx + 1).toString().padStart(3, '0')}`;
      });

      const output = { matches };
      fs.writeFileSync('data/schedule.json', JSON.stringify(output, null, 2));
      console.log(`Successfully synced ${matches.length} matches to data/schedule.json`);
    } catch (e) {
      console.error('Failed to parse response:', e);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('Network error:', err.message);
  process.exit(1);
});
