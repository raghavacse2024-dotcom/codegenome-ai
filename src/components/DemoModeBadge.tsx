/**
 * Shows when a result is using deterministic demo mode instead of live model enhancement.
 */
export function DemoModeBadge({ isDemo }: { isDemo: boolean }) {
  return (
    <div className={`notice ${isDemo ? 'notice--demo' : 'notice--live'} reveal`}>
      <span className="notice-dot" aria-hidden="true" />
      <p>
        {isDemo
          ? 'Public sample mode: Sign in with your Google or GitHub account to execute Live Multi-Agent Telemetry Analysis.'
          : 'Live Authenticated Multi-Agent Intelligence Network (Live AST Telemetry & AI Model Enhancement)'}
      </p>
    </div>
  )
}
