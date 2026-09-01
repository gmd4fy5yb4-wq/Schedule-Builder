#!/usr/bin/env node
// convert-to-v2.mjs — FieldDay 1.0 league blobs  ->  fd2_* rows
//
// READ-ONLY against 1.0. Never writes to `leagues`, never connects to production:
// it reads local backup JSON from .backups/ and emits a report plus (optionally) a
// .sql file of fd2_* INSERTs.
//
//   node scripts/convert-to-v2.mjs --self-test
//   node scripts/convert-to-v2.mjs \
//     --league .backups/YWWM8G-...json::LEv-IT \
//     --league .backups/UC2YE8-...json::"Jonathan Fall League" \
//     --aliases scripts/field-aliases.json --sql out.sql
//
// MANY ORGS, ONE FIELD REGISTRY.
// 1.0 has no organization above a league, so each league carries its own copies of
// every field. Two orgs booking the same physical turf therefore cannot see each
// other, which is the live risk between YWWM8G (LEv-IT) and UC2YE8 (Jonathan) — they
// share Azalea and MacLaren under different names.
//
// So venues and fields here are GLOBAL, owned by the first org that defines them.
// A second org reaching the same field gets an fd2_field_grants row instead of a
// duplicate. That is what makes a cross-org double-booking detectable at all.
// See docs/superpowers/specs/2026-08-27-shared-field-registry-design.md
//
// The aliases file is TRACKED (scripts/field-aliases.json), deliberately. It records
// human decisions about field identity, contains no PII — park and field names only —
// and used to sit in the gitignored .backups/, where a fresh clone silently lost every
// decision anyone had made. Keep it in the repo.
//
// MATCHING IS NEVER AUTOMATIC. Differently-named records are REPORTED, and merged
// only via an --aliases file a human wrote. "Azalea Pool" and "Azalea Road Park"
// share almost no trigrams; only a person (or geocoordinates we do not have offline)
// can say they are the same park.
//
// IDEMPOTENCE: every id is a UUIDv5 of a stable natural key, so re-running is
// byte-identical and the emitted SQL uses ON CONFLICT (id) DO UPDATE.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

// ---------------------------------------------------------------- ids

const NAMESPACE = '6f9619ff-8b86-d011-b42d-00cf4fc964ff'

function uuid5(name) {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex')
  const h = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest()
  const b = Buffer.from(h.subarray(0, 16))
  b[6] = (b[6] & 0x0f) | 0x50
  b[8] = (b[8] & 0x3f) | 0x80
  const x = b.toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

/** Comparison key: case, punctuation and spacing are not meaningful in these
 *  hand-typed names ("Turf 60'" vs "turf 60"). */
export const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')

// ---------------------------------------------------------------- parsing

export function baseDistance(name) {
  const m = String(name).match(/\b(60|75|90)\b/)
  return m ? Number(m[1]) : null
}

export function surfaceOf(name) {
  const n = String(name).toLowerCase()
  if (n.includes('turf')) return 'turf'
  if (n.includes('grass')) return 'grass'
  if (n.includes('dirt')) return 'dirt'
  return null
}

/** Competition type, orthogonal to division. Only unambiguous cases; anything
 *  else returns null and is reported rather than guessed. */
export function programOf(divisionName) {
  const n = String(divisionName ?? '').toLowerCase()
  if (/williamsport|all[\s-]?star/.test(n)) return 'allstar'
  if (/travel/.test(n)) return 'travel'
  if (/intramural|in[\s-]?house/.test(n)) return 'intramural'
  if (/interleague/.test(n)) return 'interleague'
  return null
}

/** Placeholder opponents — 1.0 cannot represent another org's team at all. */
export const isPlaceholderTeam = name =>
  /^(away|home)\s*team$|^tbd$|^opponent$|^bye$/i.test(String(name ?? '').trim())

export function addMinutes(time, minutes) {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return null
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + (Number(minutes) || 0)
  if (total >= 24 * 60) return '23:59'
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Per-day 1.0 blackouts ("YYYY-MM-DD" / "YYYY-MM-DD::Label") -> ranges. */
export function collapseDates(entries) {
  const parsed = (entries ?? [])
    .map(e => {
      const [date, ...rest] = String(e).split('::')
      return { date: date.trim(), reason: rest.join('::').trim() || null }
    })
    .filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.reason).localeCompare(String(b.reason)))
  const out = []
  for (const e of parsed) {
    const last = out[out.length - 1]
    if (last && last.reason === e.reason && nextDay(last.end_date) === e.date) last.end_date = e.date
    else if (!last || last.reason !== e.reason || last.end_date !== e.date)
      out.push({ start_date: e.date, end_date: e.date, reason: e.reason })
  }
  return out
}

function nextDay(d) {
  const dt = new Date(d + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

/** Trigram similarity, equivalent to pg_trgm's similarity(). Used only to SUGGEST
 *  merges. Measured against the live pairs: venue-name-alone scores 0.38 for
 *  "Azalea Road Park" vs "Azalea Pool" and field-name-alone scores 0.18 for
 *  "Turf 60'" vs "MacLaren 60'" — both below any usable threshold. Only the
 *  CONCATENATED venue+field reaches 0.50. Hence compare full paths, never parts. */
export function trigramSim(a, b) {
  const tri = s => {
    const clean = String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    const out = new Set()
    for (const w of clean.split(/\s+/).filter(Boolean)) {
      const p = '  ' + w + ' '
      for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3))
    }
    return out
  }
  const A = tri(a), B = tri(b)
  if (!A.size && !B.size) return 0
  const inter = [...A].filter(x => B.has(x)).length
  return inter / (A.size + B.size - inter)
}

// ---------------------------------------------------------------- convert

/**
 * @param leagues [{ id, data, orgName }]
 * @param opts    { aliases: {}, grantVisibility: 'detail'|'busy' }
 *
 * `aliases` maps a name to its canonical form. Two key shapes:
 *    "Azalea Pool":                     "Azalea Road Park"        (venue)
 *    "MacLaren Stadium|MacLaren 60'":   "MacLaren Stadium|Turf 60'"  (field)
 */
export function convertRegistry(leagues, opts = {}) {
  const warnings = []
  const W = (kind, msg) => warnings.push({ kind, msg })
  const aliases = opts.aliases ?? {}
  // Human decisions about which field a free-text special event belongs on,
  // keyed by the 1.0 event id. Value is a list of "Venue|Field"; [] means the
  // event deliberately occupies no field at all.
  const eventFields = opts.eventFields ?? aliases._event_fields ?? {}
  const grantVisibility = opts.grantVisibility ?? 'detail'

  const orgs = [], orgByName = new Map()
  const venues = [], venueByKey = new Map()
  const fields = [], fieldByKey = new Map()
  const grants = [], grantSeen = new Set()
  const seasons = [], divisions = [], teams = [], contacts = [], staff = [], blackouts = [], bookings = []
  const divisionByKey = new Map(), staffByKey = new Map()

  const orgFor = name => {
    const key = norm(name)
    if (!orgByName.has(key)) {
      const o = { id: uuid5(`fieldday:org:${key}`), name: String(name).trim(),
                  settings: { home_away_mode: 'venue' } }
      orgByName.set(key, o); orgs.push(o)
    }
    return orgByName.get(key)
  }

  const canonVenue = raw => aliases[String(raw).trim()] ?? String(raw).trim()

  // A merge a human has explicitly REJECTED. Recorded in the same aliases file,
  // because that file is already "what a human decided about identity" — and a
  // decision made once should not resurface as a warning on every run.
  const pairKey = (a, b) => [norm(a), norm(b)].sort().join('<->')
  const rejected = new Set(
    (aliases._rejected ?? []).map(p => pairKey(...String(p).split('<->'))))
  const canonField = (venueName, fieldName) => {
    const hit = aliases[`${venueName}|${String(fieldName).trim()}`]
    return hit ? hit.split('|')[1] : String(fieldName).trim()
  }

  // Venues and fields are GLOBAL. First org to define one owns it; later orgs get
  // a grant. This is the whole point — same turf, one row.
  const venueFor = (rawName, sample, org) => {
    // A field with no venue at all can still be placed, via an alias keyed on the
    // empty venue side ("|Azalea Cages"). Azalea Cages carries Azalea Road Park's
    // exact address and coordinates but an empty `location`, so without this it
    // lands in "Unassigned venue" and cannot collide with the park it is part of.
    const name = canonVenue(
      rawName || aliases[`|${String(sample?.name ?? '').trim()}`] || 'Unassigned venue')
    const key = norm(name)
    if (!venueByKey.has(key)) {
      const v = { id: uuid5(`fieldday:venue:${key}`), owner_org_id: org.id, name,
                  address: sample?.address || null,
                  geo_lat: sample?.geocoords?.lat ?? null, geo_lon: sample?.geocoords?.lon ?? null,
                  is_external: false, is_seed: false }
      venueByKey.set(key, v); venues.push(v)
    }
    const v = venueByKey.get(key)
    if (!v.address && sample?.address) v.address = sample.address
    if (v.geo_lat === null && sample?.geocoords) { v.geo_lat = sample.geocoords.lat; v.geo_lon = sample.geocoords.lon }
    return v
  }

  const fieldFor = (f, org) => {
    const venue = venueFor(f.location, f, org)
    const fname = canonField(venue.name, f.name)
    const key = `${norm(venue.name)}|${norm(fname)}`
    if (!fieldByKey.has(key)) {
      const row = { id: uuid5(`fieldday:field:${key}`), owner_org_id: org.id, is_seed: false,
                    venue_id: venue.id, name: fname,
                    base_distance_ft: baseDistance(fname), surface: surfaceOf(fname),
                    opens_at: '08:00', closes_at: '20:00', priority_division_id: null }
      fieldByKey.set(key, row); fields.push(row)
    }
    const row = fieldByKey.get(key)
    // A different org reached an existing field -> grant, not a duplicate row.
    if (row.owner_org_id !== org.id) {
      const gk = `${row.id}|${org.id}`
      if (!grantSeen.has(gk)) {
        grantSeen.add(gk)
        grants.push({ id: uuid5(`fieldday:grant:${gk}`), field_id: row.id, org_id: org.id,
                      can_book: true, visibility: grantVisibility })
        W('grant', `"${org.name}" uses "${venue.name} / ${row.name}" owned by another org — grant emitted (${grantVisibility})`)
      }
    }
    return row
  }

  for (const league of leagues) {
    const code = league.id
    const state = league.data ?? {}
    const season = state.season ?? {}
    const org = orgFor(league.orgName)
    const seasonId = uuid5(`fieldday:season:${org.id}:${code}`)

    seasons.push({ id: seasonId, org_id: org.id,
      name: season.leagueName || `Season ${code}`,
      sports: season.sports ?? (season.sport ? [season.sport] : []),
      start_date: season.startDate || null, end_date: season.endDate || null, status: 'active' })
    if (!season.startDate || !season.endDate) W('season', `${code}: missing start/end date`)

    const fieldByLegacy = new Map()
    for (const f of state.fields ?? []) {
      if (!f.location) {
        // Report where it ACTUALLY landed. This used to say "Unassigned venue"
        // unconditionally, which was false for any field placed by a "|<field>"
        // alias — it read as unresolved work that was in fact already decided.
        const placed = aliases[`|${String(f.name).trim()}`]
        W('venue', placed
          ? `${code}: field "${f.name}" has no venue of its own — placed under "${placed}" by alias`
          : `${code}: field "${f.name}" has no venue — grouped under "Unassigned venue"`)
      }
      if (baseDistance(f.name) === null) W('field', `${code}: field "${f.name}" has no base distance in its name`)
      fieldByLegacy.set(f.id, fieldFor(f, org))
    }

    const teamByLegacy = new Map(), divisionOfTeam = new Map()
    for (const d of state.divisions ?? []) {
      const dkey = `${org.id}|${norm(d.name)}`
      if (!divisionByKey.has(dkey)) {
        const row = { id: uuid5(`fieldday:division:${dkey}`), org_id: org.id, name: String(d.name).trim(),
                      default_game_minutes: season.gameDurationMinutes || 90,
                      default_practice_minutes: season.practiceDurationMinutes || 90,
                      game_days: d.gameDays ?? [], preferred_start_time: d.preferredStartTime || null }
        divisionByKey.set(dkey, row); divisions.push(row)
        if (programOf(d.name) === null) W('program', `${code}: division "${d.name}" — program not derivable, set by hand`)
      }
      const div = divisionByKey.get(dkey)

      for (const t of d.teams ?? []) {
        const homeField = fieldByLegacy.get(t.homeFieldId)
        if (t.homeFieldId && !homeField) W('team', `${code}: team "${t.name}" references missing field`)
        const row = { id: uuid5(`fieldday:team:${org.id}:${code}:${t.id}`),
          org_id: org.id, season_id: seasonId, division_id: div.id, name: t.name,
          is_external: isPlaceholderTeam(t.name), external_org: null,
          home_venue_id: homeField ? fields.find(x => x.id === homeField.id)?.venue_id ?? null : null,
          preferred_days: t.preferredDays ?? [] }
        if (row.is_external) W('team', `${code}: "${t.name}" looks like a placeholder opponent — flagged is_external`)
        teamByLegacy.set(t.id, row); divisionOfTeam.set(t.id, div); teams.push(row)
        for (const c of t.coaches ?? [])
          contacts.push({ id: uuid5(`fieldday:contact:${org.id}:${code}:${c.id}`), org_id: org.id,
            team_id: row.id, name: c.name, role: c.role === 'assistant' ? 'assistant' : 'head',
            phone: c.phone || null, email: c.email || null })
      }
    }

    const staffFor = (s, role) => {
      const key = `${org.id}|${norm(s.name)}|${role}`
      if (!staffByKey.has(key)) {
        const row = { id: uuid5(`fieldday:staff:${key}`), org_id: org.id, name: s.name, role,
                      phone: s.phone || null, email: s.email || null }
        staffByKey.set(key, row); staff.push(row)
      }
      return staffByKey.get(key)
    }
    for (const u of state.umpires ?? []) staffFor(u, 'umpire')
    for (const s of state.fieldStaff ?? []) {
      const r = String(s.role || '').toLowerCase()
      staffFor(s, ['scorer', 'concessions', 'groundskeeper'].find(x => r.includes(x)) ?? 'other')
    }

    const sched = state.schedule ?? {}
    const dur = n => (Number(n) > 0 ? Number(n) : null)
    const base = (id, kind, ev) => ({
      id: uuid5(`fieldday:booking:${org.id}:${code}:${id}`), org_id: org.id, season_id: seasonId,
      field_id: fieldByLegacy.get(ev.fieldId)?.id ?? null, kind,
      booking_date: ev.date, start_time: ev.time || null,
      end_time: ev.time && dur(ev.durationMinutes) ? addMinutes(ev.time, ev.durationMinutes) : null,
    })

    for (const g of sched.games ?? []) {
      const home = teamByLegacy.get(g.homeTeamId), away = teamByLegacy.get(g.awayTeamId)
      if (g.fieldId && !fieldByLegacy.has(g.fieldId)) W('booking', `${code}: game references missing field`)
      if (g.homeTeamId && !home) W('booking', `${code}: game references missing team`)
      const div = divisionOfTeam.get(g.homeTeamId) ?? divisionOfTeam.get(g.awayTeamId)
      bookings.push({ ...base(g.id, 'game', g), division_id: div?.id ?? null, program: programOf(div?.name),
        team_id: home?.id ?? null, opponent_team_id: away?.id ?? null,
        home_team_id: home && away ? home.id : null, home_away_method: 'venue',
        official_id: null, score_home: g.result?.homeScore ?? null, score_away: g.result?.awayScore ?? null,
        notes: g.confirmed ? 'confirmed in 1.0' : null, needs_review: false })
    }

    for (const p of sched.practices ?? []) {
      const div = divisionOfTeam.get(p.teamId)
      bookings.push({ ...base(p.id, 'practice', p), division_id: div?.id ?? null, program: programOf(div?.name),
        team_id: teamByLegacy.get(p.teamId)?.id ?? null, opponent_team_id: null, home_team_id: null,
        home_away_method: 'venue', official_id: null, score_home: null, score_away: null,
        notes: null, needs_review: false })
    }

    for (const s of sched.specialEvents ?? []) {
      const loc = (s.location || '').trim()
      // 1.0 lets a special event carry a free-text location and no field, so it
      // occupies nothing and is invisible to conflict checks. Resolution order:
      //   1. the event's own id in `_event_fields` — a human decision, and the only
      //      thing precise enough here, because ONE raw string ("Azelea") covers a
      //      clinic, a 12-hour tournament and a team party, which resolve differently.
      //   2. an exact field-name match on the free-text ("Turf" -> that field).
      //   3. nothing: field_id NULL, needs_review, source_raw kept verbatim.
      // Entries are { fields: [...], note } so the file stays auditable by eye;
      // a bare array is accepted too.
      const entry = eventFields[s.id]
      const decided = Array.isArray(entry) ? entry : entry?.fields
      const resolved = decided
        ? decided.map(fk => fieldByKey.get(`${norm(fk.split('|')[0])}|${norm(fk.split('|')[1])}`))
        : null
      if (decided && resolved.some(r => !r))
        W('event', `${code}: "${s.name}" is mapped to a field that does not exist — check _event_fields`)

      const common = {
        division_id: null, program: null, team_id: null, opponent_team_id: null, home_team_id: null,
        home_away_method: 'venue', official_id: null, score_home: null, score_away: null,
        title: s.name || null, notes: s.comments || null,
        source_raw: loc ? `location: ${loc}` : null,
      }

      if (resolved && resolved.every(Boolean) && resolved.length) {
        // One field -> the event itself. Several -> a block per field, because a
        // whole-park tournament genuinely occupies each one and must be visible to
        // conflict detection. Ids stay deterministic by qualifying with the field.
        const many = resolved.length > 1
        for (const f of resolved)
          bookings.push({ ...base(many ? `${s.id}#${f.id}` : s.id, many ? 'block' : 'event',
                                 { ...s, fieldId: null }),
            ...common, field_id: f.id, needs_review: false })
      } else if (resolved && !resolved.length) {
        // Deliberately no field (a team party is not a field booking). Decided, so
        // it is NOT flagged for review — that would re-raise a settled question.
        bookings.push({ ...base(s.id, 'event', { ...s, fieldId: null }),
          ...common, field_id: null, needs_review: false })
      } else {
        const matched = loc ? (fieldByKey.get([...fieldByKey.keys()].find(k => k.endsWith('|' + norm(loc))) ?? '') ?? null) : null
        if (loc && !matched) W('event', `${code}: "${s.name}" has free-text location "${loc}" — needs a field`)
        bookings.push({ ...base(s.id, 'event', { ...s, fieldId: null }), ...common,
          field_id: matched?.id ?? null,
          source_raw: loc && !matched ? `location: ${loc}` : null,
          needs_review: Boolean(loc && !matched) })
      }
    }

    const push = (entries, target) => {
      for (const r of collapseDates(entries))
        blackouts.push({ id: uuid5(`fieldday:blackout:${org.id}:${code}:${target.field_id ?? target.team_id ?? 'org'}:${r.start_date}:${r.reason ?? ''}`),
          org_id: org.id, season_id: seasonId, field_id: target.field_id ?? null, venue_id: null,
          team_id: target.team_id ?? null, division_id: null,
          start_date: r.start_date, end_date: r.end_date, reason: r.reason })
    }
    push(state.blackoutDates, {})
    for (const f of state.fields ?? []) push(f.blackoutDates, { field_id: fieldByLegacy.get(f.id)?.id })
    for (const d of state.divisions ?? []) for (const t of d.teams ?? [])
      push(t.blackoutDates, { team_id: teamByLegacy.get(t.id)?.id })
  }

  // --- geocode outliers ----------------------------------------------------
  // A wrong geocode is invisible in the UI and silently corrupts travel burden,
  // which the 2.0 design treats as the one metric a home/away flip cannot spoil.
  // Real case: "Red Wing Lane, Levittown NY 11756" geocoded to Red Wing,
  // MINNESOTA — 1,609 km from every other field, with 6 bookings on it. Nobody
  // noticed for months. Leagues are local by nature, so distance from the median
  // field is a reliable tell; the median resists a handful of bad rows in a way
  // a mean does not.
  const geo = venues.filter(v => v.geo_lat !== null && v.geo_lon !== null)
  if (geo.length >= 3) {
    const mid = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)]
    const clat = mid(geo.map(v => v.geo_lat)), clon = mid(geo.map(v => v.geo_lon))
    for (const v of geo) {
      const t = Math.PI / 180
      const dLat = (v.geo_lat - clat) * t, dLon = (v.geo_lon - clon) * t
      const h = Math.sin(dLat / 2) ** 2 +
                Math.cos(clat * t) * Math.cos(v.geo_lat * t) * Math.sin(dLon / 2) ** 2
      const km = 6371 * 2 * Math.asin(Math.sqrt(h))
      if (km > 100) W('geocode',
        `venue "${v.name}" (${v.address ?? 'no address'}) is ${Math.round(km)} km from the ` +
        `other venues — almost certainly a wrong geocode. Do NOT guess a replacement; re-geocode the address.`)
    }
  }

  // --- suggest merges a human should confirm via --aliases -----------------
  const SIM = 0.4
  for (let i = 0; i < venues.length; i++) for (let j = i + 1; j < venues.length; j++) {
    const a = venues[i], b = venues[j]
    const first = s => String(s).trim().split(/\s+/)[0].toLowerCase()
    if (rejected.has(pairKey(a.name, b.name))) continue
    if (first(a.name) === first(b.name) || trigramSim(a.name, b.name) >= SIM)
      W('suggest', `venues "${a.name}" and "${b.name}" may be the same place — add to --aliases to merge`)
  }
  for (let i = 0; i < fields.length; i++) for (let j = i + 1; j < fields.length; j++) {
    const a = fields[i], b = fields[j]
    const va = venues.find(v => v.id === a.venue_id)?.name ?? '', vb = venues.find(v => v.id === b.venue_id)?.name ?? ''
    const sameVenue = a.venue_id === b.venue_id
    const compatible = a.surface === b.surface || a.surface === null || b.surface === null
    const distMatch = a.base_distance_ft && a.base_distance_ft === b.base_distance_ft && compatible
    // Compare FULL paths — venue-or-field alone is below any usable threshold.
    if (rejected.has(pairKey(`${va}|${a.name}`, `${vb}|${b.name}`))) continue
    if ((sameVenue && distMatch) || trigramSim(`${va} ${a.name}`, `${vb} ${b.name}`) >= 0.5)
      W('suggest', `fields "${va} / ${a.name}" and "${vb} / ${b.name}" may be the same field — add to --aliases to merge`)
  }

  return { orgs, seasons, venues, fields, grants, divisions, teams, contacts, staff, blackouts, bookings, warnings }
}

// ---------------------------------------------------------------- sql

const q = v =>
  v === null || v === undefined ? 'null'
  : typeof v === 'number' ? String(v)
  : typeof v === 'boolean' ? (v ? 'true' : 'false')
  : Array.isArray(v) ? `'{${v.join(',')}}'`
  : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
  : `'${String(v).replace(/'/g, "''")}'`

function insert(table, rows) {
  if (!rows.length) return ''
  const cols = [...new Set(rows.flatMap(Object.keys))]
  const vals = rows.map(r => `  (${cols.map(c => q(r[c] ?? null)).join(', ')})`).join(',\n')
  const upd = cols.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ')
  return `insert into public.${table} (${cols.join(', ')}) values\n${vals}\non conflict (id) do update set ${upd};\n\n`
}

export const toSQL = r =>
  '-- generated by scripts/convert-to-v2.mjs — safe to re-run\nbegin;\n\n'
  + insert('fd2_orgs', r.orgs) + insert('fd2_seasons', r.seasons)
  + insert('fd2_venues', r.venues) + insert('fd2_fields', r.fields)
  + insert('fd2_field_grants', r.grants) + insert('fd2_divisions', r.divisions)
  + insert('fd2_teams', r.teams) + insert('fd2_team_contacts', r.contacts)
  + insert('fd2_staff', r.staff) + insert('fd2_blackouts', r.blackouts)
  + insert('fd2_bookings', r.bookings) + 'commit;\n'

// ---------------------------------------------------------------- self-test

function selfTest() {
  assert.equal(baseDistance('RED WING TURF 75'), 75)
  assert.equal(baseDistance("Turf 60'"), 60)
  assert.equal(baseDistance('STOKES'), null, 'absent distance is null, never guessed')
  assert.equal(surfaceOf('AZALEA DIRT'), 'dirt')
  assert.equal(programOf('Travel Softball'), 'travel')
  assert.equal(programOf('Fall Classic Softball 2026'), null, 'ambiguous is reported, not guessed')
  assert.ok(isPlaceholderTeam('Away Team'))
  assert.ok(!isPlaceholderTeam('Force Blue (10U) Ciccarello'))
  assert.equal(addMinutes('23:30', 90), '23:59', 'clamps rather than wrapping')
  assert.equal(norm("Turf 60'"), norm('turf 60'))
  assert.equal(collapseDates(['2027-05-01', '2027-05-02'])[0].end_date, '2027-05-02')

  // Trigram behaviour that drove the design: parts fail, whole paths work.
  assert.ok(trigramSim('Azalea Road Park', 'Azalea Pool') < 0.4, 'venue name alone is below threshold')
  assert.ok(trigramSim("Turf 60'", "MacLaren 60'") < 0.4, 'field name alone is far below threshold')
  assert.ok(trigramSim('Azalea Road Park Turf', 'Azalea Pool Azalea Turf') >= 0.4, 'concatenated path clears it')

  const mk = (id, org, fieldName, venue, date, time) => ({
    id, orgName: org, data: {
      season: { leagueName: id, startDate: '2026-08-31', endDate: '2026-11-30', sport: 'softball' },
      fields: [{ id: 'f1', name: fieldName, location: venue }],
      divisions: [{ id: 'd1', name: 'Travel Softball', teams: [{ id: 't1', name: 'A' }, { id: 't2', name: 'Away Team' }] }],
      umpires: [], fieldStaff: [],
      schedule: { games: [{ id: 'g1', date, time, durationMinutes: 90, fieldId: 'f1',
                            homeTeamId: 't1', awayTeamId: 't2', divisionId: 'd1', umpireId: '' }] },
    },
  })

  // THE regression this rewrite exists to prevent. Two DIFFERENT orgs, same turf.
  const shared = convertRegistry([
    mk('YWWM8G', 'LEv-IT', 'Turf', 'Azalea Road Park', '2026-09-15', '17:30'),
    mk('UC2YE8', 'Jonathan Fall League', 'Turf', 'Azalea Road Park', '2026-09-15', '18:00'),
  ])
  assert.equal(shared.orgs.length, 2, 'two orgs stay two orgs')
  assert.equal(shared.venues.length, 1, 'same venue across orgs -> ONE row')
  assert.equal(shared.fields.length, 1, 'same field across orgs -> ONE row')
  assert.equal(shared.bookings[0].field_id, shared.bookings[1].field_id,
    'both orgs book the SAME field row — the collision is now detectable')
  assert.equal(shared.fields[0].owner_org_id, shared.orgs[0].id, 'first org to define the field owns it')
  assert.equal(shared.grants.length, 1, 'the second org gets a grant, not a duplicate field')
  assert.equal(shared.grants[0].org_id, shared.orgs[1].id)
  assert.equal(shared.grants[0].visibility, 'detail')
  assert.equal(shared.seasons.length, 2, 'each league keeps its own season')

  // Differently-named same place: NOT merged, but suggested.
  const diff = convertRegistry([
    mk('YWWM8G', 'LEv-IT', 'Turf', 'Azalea Road Park', '2026-09-15', '17:30'),
    mk('UC2YE8', 'Jonathan Fall League', 'Azalea Turf', 'Azalea Pool', '2026-09-15', '18:00'),
  ])
  assert.equal(diff.venues.length, 2, 'different names are never auto-merged')
  assert.ok(diff.warnings.some(w => w.kind === 'suggest'), 'but a merge is suggested')

  // ...and an --aliases file collapses them, which is the human confirmation step.
  const aliased = convertRegistry([
    mk('YWWM8G', 'LEv-IT', 'Turf', 'Azalea Road Park', '2026-09-15', '17:30'),
    mk('UC2YE8', 'Jonathan Fall League', 'Azalea Turf', 'Azalea Pool', '2026-09-15', '18:00'),
  ], { aliases: { 'Azalea Pool': 'Azalea Road Park', 'Azalea Road Park|Azalea Turf': 'Azalea Road Park|Turf' } })
  assert.equal(aliased.venues.length, 1, 'alias merges the venue')
  assert.equal(aliased.fields.length, 1, 'alias merges the field')
  assert.equal(aliased.bookings[0].field_id, aliased.bookings[1].field_id, 'and the conflict becomes visible')
  assert.equal(aliased.grants.length, 1)

  // Same org, two leagues: shared field, and NO grant (you cannot grant to yourself).
  const sameOrg = convertRegistry([
    mk('L1', 'LEv-IT', 'Turf', 'Azalea Road Park', '2026-09-15', '17:30'),
    mk('L2', 'LEv-IT', 'Turf', 'Azalea Road Park', '2026-09-15', '18:00'),
  ])
  assert.equal(sameOrg.orgs.length, 1)
  assert.equal(sameOrg.fields.length, 1)
  assert.equal(sameOrg.grants.length, 0, 'an org needs no grant on its own field')

  // Dangling references warn and are kept, never dropped.
  const orphan = convertRegistry([{ id: 'T1', orgName: 'X', data: {
    season: { leagueName: 'T', startDate: '2027-04-01', endDate: '2027-06-01' },
    fields: [], divisions: [], umpires: [], fieldStaff: [],
    schedule: { games: [{ id: 'g1', date: '2027-04-02', time: '17:30', durationMinutes: 90,
                          fieldId: 'nope', homeTeamId: 'nope', awayTeamId: 'nope', divisionId: 'nope', umpireId: '' }] } } }])
  assert.equal(orphan.bookings.length, 1, 'orphan booking kept, not dropped')
  assert.equal(orphan.bookings[0].field_id, null)
  assert.ok(orphan.warnings.length >= 2)

  // --- geocode outlier + rejected-merge + venue-less placement -------------
  const geoLeague = (id, org, fields) => ({ id, orgName: org, data: {
    season: { leagueName: id, startDate: '2026-08-31', endDate: '2026-11-30', sport: 'softball' },
    fields, divisions: [], umpires: [], fieldStaff: [],
    schedule: { games: [], practices: [], specialEvents: [] } } })

  // Three venues clustered on Long Island, one geocoded to Minnesota.
  const geoOut = convertRegistry([geoLeague('G1', 'Org', [
    { id: 'a', name: 'Turf', location: 'Azalea',    geocoords: { lat: 40.7217, lon: -73.5125 } },
    { id: 'b', name: 'Walker', location: 'Hicksville', geocoords: { lat: 40.7684, lon: -73.5251 } },
    { id: 'c', name: 'Salisbury Turf', location: 'Central Nassau', geocoords: { lat: 40.7371, lon: -73.5501 } },
    { id: 'd', name: 'Red Wing 75', location: 'Red Wing', geocoords: { lat: 44.5624, lon: -92.5338 } },
  ])])
  const geoWarn = geoOut.warnings.filter(w => w.kind === 'geocode')
  assert.equal(geoWarn.length, 1, 'exactly the one far-away venue is flagged')
  assert.match(geoWarn[0].msg, /Red Wing/, 'and it is the Minnesota one')

  // A rejected pair must not be re-suggested.
  const rejArgs = [geoLeague('G2', 'Org', [
    { id: 'a', name: 'Dirt', location: 'Azalea Road Park' },
    { id: 'b', name: 'Turf', location: 'Azalea Road Park' },
  ])]
  assert.ok(convertRegistry(rejArgs).warnings.some(w => w.kind === 'suggest'),
    'similar names at one venue are suggested by default')
  assert.ok(!convertRegistry(rejArgs, {
      aliases: { _rejected: ['Azalea Road Park|Dirt<->Azalea Road Park|Turf'] },
    }).warnings.some(w => w.kind === 'suggest'),
    'and a human rejection silences that suggestion for good')

  // A field with an empty `location` is placed by a "|<field>" alias.
  const placed = convertRegistry([geoLeague('G3', 'Org', [
    { id: 'a', name: 'Turf', location: 'Azalea Road Park' },
    { id: 'b', name: 'Azalea Cages', location: '' },
  ])], { aliases: { '|Azalea Cages': 'Azalea Road Park' } })
  assert.equal(placed.venues.length, 1, 'the venue-less field joins the park, not "Unassigned venue"')
  assert.match(placed.warnings.find(w => w.kind === 'venue').msg, /placed under "Azalea Road Park"/,
    'and the warning says where it actually landed')

  // --- special-event field resolution --------------------------------------
  const evLeague = (events) => ({ id: 'E1', orgName: 'Org', data: {
    season: { leagueName: 'E1', startDate: '2026-05-01', endDate: '2026-11-30', sport: 'softball' },
    fields: [{ id: 'f1', name: 'Turf', location: 'Azalea Road Park' },
             { id: 'f2', name: 'Dirt', location: 'Azalea Road Park' }],
    divisions: [], umpires: [], fieldStaff: [],
    schedule: { games: [], practices: [], specialEvents: events } } })

  const evs = [
    { id: 'e1', date: '2026-07-18', time: '09:00', durationMinutes: 120, name: 'Summer Clinic',  location: 'Azelea' },
    { id: 'e2', date: '2026-07-11', time: '08:00', durationMinutes: 720, name: 'ONE Day Tournament', location: 'Azelea' },
    { id: 'e3', date: '2026-08-06', time: '15:00', durationMinutes: 300, name: 'Team Party',    location: 'Azelea' },
  ]

  // Unmapped, the same raw string is unresolvable and every event is flagged.
  const raw = convertRegistry([evLeague(evs)])
  assert.equal(raw.warnings.filter(w => w.kind === 'event').length, 3,
    'without decisions, all three free-text events need a field')

  // Mapped: one string, three different outcomes — which is why the map is keyed
  // by event id and not by the location text.
  const done = convertRegistry([evLeague(evs)], { eventFields: {
    e1: { fields: ['Azalea Road Park|Turf'] },
    e2: { fields: ['Azalea Road Park|Turf', 'Azalea Road Park|Dirt'] },
    e3: { fields: [] },
  } })
  assert.equal(done.warnings.filter(w => w.kind === 'event').length, 0, 'decisions clear the warnings')
  const ev = done.bookings.filter(b => b.kind === 'event' || b.kind === 'block')
  assert.equal(ev.length, 4, 'the two-field event becomes TWO rows, so 3 events -> 4 rows')
  assert.equal(ev.filter(b => b.kind === 'block').length, 2, 'and those two are blocks')
  assert.equal(new Set(ev.map(b => b.id)).size, 4, 'the split rows still get distinct ids')
  const party = ev.find(b => b.title === 'Team Party')
  assert.equal(party.field_id, null, 'an empty list means deliberately no field')
  assert.equal(party.needs_review, false, 'and a decided event is NOT re-flagged for review')
  assert.match(party.source_raw, /Azelea/, 'while the original text is still kept verbatim')

  console.log('self-test: all assertions passed')
}

// ---------------------------------------------------------------- cli

const args = process.argv.slice(2)
if (args.includes('--self-test')) { selfTest(); process.exit(0) }

const flag = name => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1] }
const leagueArgs = args.map((a, i) => (args[i - 1] === '--league' ? a : null)).filter(Boolean)

if (!leagueArgs.length) {
  console.error('usage: node scripts/convert-to-v2.mjs --league <file>::<orgName> [--league ...] [--aliases f.json] [--sql out.sql]')
  console.error('       node scripts/convert-to-v2.mjs --self-test')
  process.exit(1)
}

const aliases = flag('--aliases') ? JSON.parse(readFileSync(flag('--aliases'), 'utf8')) : {}
const leagues = leagueArgs.map(spec => {
  const idx = spec.lastIndexOf('::')
  if (idx === -1) { console.error(`--league needs <file>::<orgName>, got: ${spec}`); process.exit(1) }
  const raw = JSON.parse(readFileSync(spec.slice(0, idx), 'utf8'))
  const row = Array.isArray(raw) ? raw[0] : raw
  return { id: row.id, data: row.data, orgName: spec.slice(idx + 2) }
})

const r = convertRegistry(leagues, { aliases, grantVisibility: flag('--grant') ?? 'detail' })
const n = k => String(r[k].length).padStart(4)

console.log(`\n=== ${leagues.map(l => `${l.id} (${l.orgName})`).join('  +  ')} ===`)
for (const k of ['orgs', 'seasons', 'venues', 'fields', 'grants', 'divisions', 'teams', 'contacts', 'staff', 'blackouts', 'bookings'])
  console.log(`  ${k.padEnd(10)} ${n(k)}`)

const shared = r.fields.filter(f => r.grants.some(g => g.field_id === f.id))
console.log(`\n  fields shared across orgs: ${shared.length}`)
for (const f of shared) {
  const v = r.venues.find(x => x.id === f.venue_id)
  const owner = r.orgs.find(o => o.id === f.owner_org_id)
  const others = r.grants.filter(g => g.field_id === f.id).map(g => r.orgs.find(o => o.id === g.org_id)?.name)
  console.log(`     ${v?.name} / ${f.name}  — owned by ${owner?.name}, granted to ${others.join(', ')}`)
}

if (r.warnings.length) {
  const grouped = {}
  for (const w of r.warnings) (grouped[w.kind] ??= []).push(w.msg)
  console.log(`\n--- ${r.warnings.length} warnings ---`)
  for (const [k, msgs] of Object.entries(grouped)) {
    console.log(`  [${k}] ${msgs.length}`)
    for (const m of msgs.slice(0, 4)) console.log(`      ${m}`)
    if (msgs.length > 4) console.log(`      ... and ${msgs.length - 4} more`)
  }
}

if (flag('--sql')) { writeFileSync(flag('--sql'), toSQL(r)); console.log(`\nwrote ${flag('--sql')}`) }
