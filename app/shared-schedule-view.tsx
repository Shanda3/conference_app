import type {SharedSchedule} from "@/lib/sharing";
export function SharedScheduleView({schedule}:{schedule:SharedSchedule}){
  const updated=new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(schedule.createdAt));
  return <div style={{ minHeight: "100vh", background: "#10081a", color: "#f6f0fb" }}><main style={{ maxWidth: 840, margin: "0 auto", padding: "clamp(24px, 6vw, 64px) clamp(18px, 5vw, 40px)", color: "#f6f0fb" }}>
    <meta name="referrer" content="no-referrer" />
    <div style={{ fontSize: 14, letterSpacing: "0.1em", textTransform: "uppercase", color: "#00cbe7", marginBottom: 30 }}>ThunderPlains Planner · Techlahoma</div>
    <h1 style={{ fontSize: "clamp(29px, 6vw, 46px)", lineHeight: 1.2, letterSpacing: "-0.04em", color: "#ffffff", overflowWrap: "anywhere" }}>{schedule.displayName}’s conference day</h1>
    <p style={{ fontSize: 16, lineHeight: 1.8, marginTop: 18, color: "#dbc8e9" }}>{schedule.sessions.length} saved {schedule.sessions.length === 1 ? "session" : "sessions"} · Snapshot shared {updated}</p>
    <p style={{ fontSize: 16, lineHeight: 1.8, marginTop: 10, color: "#cbb7dd" }}>Times are shown in each conference’s time zone. This is a read-only snapshot; schedules may change.</p>
    <ol style={{ display: "grid", gap: 18, listStyle: "none", padding: 0, margin: "32px 0" }}>
      {schedule.sessions.map((session, index) => {
        const date = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: session.timeZone }).format(new Date(session.start));
        const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: session.timeZone });
        return <li key={index} style={{ border: "1px solid #634078", borderLeft: "4px solid #ea008a", borderRadius: 16, padding: "clamp(18px, 4vw, 28px)", background: "#24103b", overflowWrap: "anywhere" }}>
          <div style={{ color: "#00cbe7", fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{session.conferenceName}</div>
          <h2 style={{ fontSize: 21, lineHeight: 1.5, fontWeight: 600, marginBottom: 14 }}>{session.title}</h2>
          <p style={{ fontSize: 16, lineHeight: 1.8 }}>{date} · <time dateTime={session.start}>{clock.format(new Date(session.start))}</time>–<time dateTime={session.end}>{clock.format(new Date(session.end))}</time></p>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: "#bfaacd" }}>{session.timeZone}{session.room ? ` · ${session.room}` : ""}</p>
          {session.speaker && <p style={{ fontSize: 16, lineHeight: 1.8, marginTop: 8, color: "#dbc8e9" }}>{session.speaker}</p>}
          {session.url && <a href={session.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", marginTop: 17, fontSize: 16, minHeight: 44, alignItems: "center", color: "#ffd843", textDecoration: "underline", textUnderlineOffset: 4 }}>Official session details ↗</a>}
        </li>;
      })}
    </ol>
    <p style={{ borderTop: "1px solid #634078", paddingTop: 22, fontSize: 16, color: "#cbb7dd", lineHeight: 1.9 }}>Only the chosen display name and verified session details are included. Personal notes and connections stay private. The owner can revoke this link at any time.</p>
  </main></div>;
}
