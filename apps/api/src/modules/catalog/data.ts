import type { Region, Team } from '@penka/contracts';

/**
 * The competition catalog, hardcoded on purpose: the MVP has no catalog
 * database, and a fixed list keeps demos identical everywhere.
 *
 * Team codes are the identity of a team inside its league — keep them stable
 * and unique per league (the same code may appear in another league). National
 * teams carry no `country`: they are one. Every league needs an even number of
 * teams so each matchday can pair all of them.
 */
export interface LeagueData {
  id: string;
  name: string;
  region: Region;
  season: string;
  teams: Team[];
}

export const LEAGUES: LeagueData[] = [
  {
    id: 'copa-america',
    name: 'Copa América',
    region: 'america',
    season: '2026',
    teams: [
      { code: 'ARG', name: 'Argentina' },
      { code: 'BRA', name: 'Brasil' },
      { code: 'URU', name: 'Uruguay' },
      { code: 'COL', name: 'Colombia' },
      { code: 'CHI', name: 'Chile' },
      { code: 'PER', name: 'Perú' },
      { code: 'PAR', name: 'Paraguay' },
      { code: 'ECU', name: 'Ecuador' },
      { code: 'BOL', name: 'Bolivia' },
      { code: 'VEN', name: 'Venezuela' },
      { code: 'MEX', name: 'México' },
      { code: 'USA', name: 'Estados Unidos' },
    ],
  },
  {
    id: 'copa-libertadores',
    name: 'Copa Libertadores',
    region: 'america',
    season: '2026',
    teams: [
      { code: 'RIV', name: 'River Plate', country: 'Argentina' },
      { code: 'BOC', name: 'Boca Juniors', country: 'Argentina' },
      { code: 'FLA', name: 'Flamengo', country: 'Brasil' },
      { code: 'PAL', name: 'Palmeiras', country: 'Brasil' },
      { code: 'PEN', name: 'Peñarol', country: 'Uruguay' },
      { code: 'NAC', name: 'Nacional', country: 'Uruguay' },
      { code: 'CCO', name: 'Colo-Colo', country: 'Chile' },
      { code: 'ATN', name: 'Atlético Nacional', country: 'Colombia' },
    ],
  },
  {
    id: 'champions-league',
    name: 'UEFA Champions League',
    region: 'europe',
    season: '2025/26',
    teams: [
      { code: 'RMA', name: 'Real Madrid', country: 'España' },
      { code: 'BAR', name: 'FC Barcelona', country: 'España' },
      { code: 'MCI', name: 'Manchester City', country: 'Inglaterra' },
      { code: 'LIV', name: 'Liverpool', country: 'Inglaterra' },
      { code: 'BAY', name: 'Bayern München', country: 'Alemania' },
      { code: 'BVB', name: 'Borussia Dortmund', country: 'Alemania' },
      { code: 'PSG', name: 'Paris Saint-Germain', country: 'Francia' },
      { code: 'INT', name: 'Inter', country: 'Italia' },
    ],
  },
  {
    id: 'premier-league',
    name: 'Premier League',
    region: 'europe',
    season: '2025/26',
    teams: [
      { code: 'ARS', name: 'Arsenal', country: 'Inglaterra' },
      { code: 'AVL', name: 'Aston Villa', country: 'Inglaterra' },
      { code: 'CHE', name: 'Chelsea', country: 'Inglaterra' },
      { code: 'LIV', name: 'Liverpool', country: 'Inglaterra' },
      { code: 'MCI', name: 'Manchester City', country: 'Inglaterra' },
      { code: 'MUN', name: 'Manchester United', country: 'Inglaterra' },
      { code: 'NEW', name: 'Newcastle United', country: 'Inglaterra' },
      { code: 'TOT', name: 'Tottenham Hotspur', country: 'Inglaterra' },
    ],
  },
  {
    id: 'la-liga',
    name: 'LaLiga',
    region: 'europe',
    season: '2025/26',
    teams: [
      { code: 'RMA', name: 'Real Madrid', country: 'España' },
      { code: 'BAR', name: 'FC Barcelona', country: 'España' },
      { code: 'ATM', name: 'Atlético de Madrid', country: 'España' },
      { code: 'SEV', name: 'Sevilla', country: 'España' },
      { code: 'BET', name: 'Real Betis', country: 'España' },
      { code: 'ATH', name: 'Athletic Club', country: 'España' },
      { code: 'RSO', name: 'Real Sociedad', country: 'España' },
      { code: 'VAL', name: 'Valencia', country: 'España' },
    ],
  },
  {
    id: 'fifa-world-cup',
    name: 'Copa Mundial de la FIFA',
    region: 'world',
    season: '2026',
    teams: [
      { code: 'ARG', name: 'Argentina' },
      { code: 'BRA', name: 'Brasil' },
      { code: 'URU', name: 'Uruguay' },
      { code: 'MEX', name: 'México' },
      { code: 'USA', name: 'Estados Unidos' },
      { code: 'ESP', name: 'España' },
      { code: 'FRA', name: 'Francia' },
      { code: 'ENG', name: 'Inglaterra' },
      { code: 'GER', name: 'Alemania' },
      { code: 'ITA', name: 'Italia' },
      { code: 'POR', name: 'Portugal' },
      { code: 'NED', name: 'Países Bajos' },
      { code: 'BEL', name: 'Bélgica' },
      { code: 'CRO', name: 'Croacia' },
      { code: 'JPN', name: 'Japón' },
      { code: 'MAR', name: 'Marruecos' },
    ],
  },
];
