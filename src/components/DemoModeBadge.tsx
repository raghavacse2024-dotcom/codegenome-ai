/**
 * Shows when a result is using deterministic demo mode instead of live model enhancement.
 */
export function DemoModeBadge({ isDemo }: { isDemo: boolean }) {
  return (
    <div className={`notice ${isDemo ? 'notice--demo' : 'notice--live'} reveal`}>
      <span className="notice-dot" aria-hidden="true" />
      <p>
        {isDemo
          ? 'Demo-safe deterministic analysis: GitHub/OpenAI access is limited, so results are generated from bounded public data or demo-safe samples.'
          : 'Live OpenAI-enhanced analysis'}
      </p>
    </div>
  )
}
