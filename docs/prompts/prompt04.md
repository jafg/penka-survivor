Read CLAUDE.md. TDD. Work in apps/api, new module: catalog. No database — the
catalog is hardcoded TypeScript data validated against @penka/contracts schemas.

## Data (hardcoded)
Leagues with region and their teams ("cuadros"):
- America: Copa América (12 national teams), Copa Libertadores (8 clubs)
- Europe: Champions League (8 clubs), Premier League (8 clubs), La Liga (8 clubs)
- World: FIFA World Cup (16 national teams)
Team: { code, name, country? }. Keep codes stable and unique per league.

Each league ships a FixtureTemplate: 3 matchdays, each matchday pairs every team
exactly once (round-robin style is fine), with RELATIVE lock offsets:
matchday 1 locks at +2h from materialization, matchday 2 at +26h, matchday 3 at +50h.
(Relative offsets make the demo repeatable at any time — document this.)

## Endpoints
- GET /api/v1/catalog/leagues → [{ id, name, region, teamCount }]
- GET /api/v1/catalog/leagues/:id → { league, teams[], fixtureTemplate }
  404 penka_not_found is wrong here — add and use catalog-specific behavior:
  unknown league → 404 with code league_not_found (add the code to contracts first,
  tests first).

## Tests
- Every league's fixture template is internally consistent: each team appears
  exactly once per matchday; all team codes referenced exist in the league
  (write this as a data-integrity test that iterates the whole catalog —
  it protects future edits to the hardcoded data)
- Endpoint shape matches contracts schemas; unknown league → 404 league_not_found
- Regions filter correctly if you add ?region=

## Verification
- `pnpm test --filter @penka/api` green (unit: data integrity; integration: endpoints)