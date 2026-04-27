import { Resend } from 'resend'
import type { AppState, ScheduledGame, ScheduledPractice } from './types'

// Lazily initialised so the module can be imported at build time without a key
function getResend() { return new Resend(process.env.RESEND_API_KEY!) }

const FROM = process.env.RESEND_FROM_EMAIL ?? 'FieldDay Planner <onboarding@resend.dev>'

// ── Date/time helpers ────────────────────────────────────────────────────────

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ── Email HTML template ──────────────────────────────────────────────────────

function buildEmailHtml(opts: {
  leagueName: string
  teamName: string
  coachName: string
  games: ScheduledGame[]
  practices: ScheduledPractice[]
  teamMap: Map<string, string>
  fieldMap: Map<string, string>
  viewUrl?: string
}): string {
  const { leagueName, teamName, coachName, games, practices, teamMap, fieldMap, viewUrl } = opts

  const today = new Date().toISOString().split('T')[0]
  const upcomingGames = games
    .filter(g => g.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  const upcomingPractices = practices
    .filter(p => p.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))

  const gameRows = upcomingGames.map(g => {
    const isHome = g.homeTeamId === opts.games[0]?.homeTeamId || true // always show clearly
    const opponent = g.homeTeamId === g.awayTeamId
      ? '—'
      : teamMap.get(g.homeTeamId) === teamName
        ? teamMap.get(g.awayTeamId) ?? '—'
        : teamMap.get(g.homeTeamId) ?? '—'
    const homeAway = teamMap.get(g.homeTeamId) === teamName ? 'Home' : 'Away'
    const field = fieldMap.get(g.fieldId) ?? '—'
    return `
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:8px 12px;font-size:13px;color:#374151;">${fmtDate(g.date)}</td>
        <td style="padding:8px 12px;font-size:13px;color:#374151;">${fmtTime(g.time)}</td>
        <td style="padding:8px 12px;font-size:13px;color:#374151;">${opponent}</td>
        <td style="padding:8px 12px;font-size:13px;">
          <span style="background:${homeAway === 'Home' ? '#dbeafe' : '#f3e8ff'};color:${homeAway === 'Home' ? '#1e40af' : '#7e22ce'};padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;">${homeAway}</span>
        </td>
        <td style="padding:8px 12px;font-size:13px;color:#6b7280;">${field}</td>
      </tr>`
  }).join('')

  const practiceRows = upcomingPractices.map(p => {
    const field = fieldMap.get(p.fieldId) ?? '—'
    return `
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:8px 12px;font-size:13px;color:#374151;">${fmtDate(p.date)}</td>
        <td style="padding:8px 12px;font-size:13px;color:#374151;">${fmtTime(p.time)}</td>
        <td style="padding:8px 12px;font-size:13px;color:#6b7280;">${field}</td>
      </tr>`
  }).join('')

  const viewBtn = viewUrl
    ? `<div style="text-align:center;margin:28px 0 0;">
         <a href="${viewUrl}" style="background:#c8102e;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block;">View Full Schedule →</a>
       </div>`
    : ''

  const gamesSection = upcomingGames.length > 0 ? `
    <h3 style="margin:28px 0 10px;font-size:15px;color:#111827;font-weight:700;">Upcoming Games</h3>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Date</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Time</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Opponent</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">H/A</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Field</th>
        </tr>
      </thead>
      <tbody>${gameRows}</tbody>
    </table>` : '<p style="color:#6b7280;font-size:13px;">No upcoming games scheduled.</p>'

  const practicesSection = upcomingPractices.length > 0 ? `
    <h3 style="margin:28px 0 10px;font-size:15px;color:#111827;font-weight:700;">Upcoming Practices</h3>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Date</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Time</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Field</th>
        </tr>
      </thead>
      <tbody>${practiceRows}</tbody>
    </table>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${leagueName} Schedule</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#1a1a2e;border-radius:12px 12px 0 0;padding:28px 32px;">
          <p style="margin:0;color:#c8102e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;">FieldDay Planner</p>
          <h1 style="margin:4px 0 0;color:#fff;font-size:22px;font-weight:700;">${leagueName}</h1>
          <p style="margin:6px 0 0;color:#a0a0b8;font-size:14px;">Schedule update for <strong style="color:#fff;">${teamName}</strong></p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#fff;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;">
          <p style="margin:0 0 6px;font-size:14px;color:#374151;">Hi <strong>${coachName}</strong>,</p>
          <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">The schedule for <strong style="color:#111827;">${teamName}</strong> has been updated in ${leagueName}. Here's what's coming up:</p>

          ${gamesSection}
          ${practicesSection}
          ${viewBtn}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Sent by FieldDay Planner · You received this because you are listed as a coach for ${teamName}.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface NotifyResult {
  coachName: string
  email: string
  teamName: string
  success: boolean
  error?: string
}

export async function sendCoachNotifications(
  state: AppState,
  teamIds: string[],       // which teams to notify (empty = all)
  viewUrl?: string,
): Promise<NotifyResult[]> {
  const teamMap = new Map(state.divisions.flatMap(d => d.teams).map(t => [t.id, t.name]))
  const fieldMap = new Map(state.fields.map(f => [f.id, f.name]))

  const results: NotifyResult[] = []

  for (const div of state.divisions) {
    for (const team of div.teams) {
      if (teamIds.length > 0 && !teamIds.includes(team.id)) continue
      if (!team.coaches || team.coaches.length === 0) continue

      const teamGames = state.schedule.games.filter(
        g => g.homeTeamId === team.id || g.awayTeamId === team.id
      )
      const teamPractices = state.schedule.practices.filter(p => p.teamId === team.id)

      for (const coach of team.coaches) {
        if (!coach.email) continue

        const html = buildEmailHtml({
          leagueName: state.season.leagueName,
          teamName: team.name,
          coachName: coach.name,
          games: teamGames,
          practices: teamPractices,
          teamMap,
          fieldMap,
          viewUrl,
        })

        try {
          await getResend().emails.send({
            from: FROM,
            to: coach.email,
            subject: `[${state.season.leagueName}] Schedule Update — ${team.name}`,
            html,
          })
          results.push({ coachName: coach.name, email: coach.email, teamName: team.name, success: true })
        } catch (err) {
          results.push({
            coachName: coach.name,
            email: coach.email,
            teamName: team.name,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }
    }
  }

  return results
}
