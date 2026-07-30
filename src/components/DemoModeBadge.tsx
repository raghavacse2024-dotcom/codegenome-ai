/**
 * Shows when a result is using deterministic demo mode instead of live model enhancement.
 */
export function DemoModeBadge({ isDemo }: { isDemo: boolean }) {
  return (
    <div className={`notice ${isDemo ? 'demo' : 'live'}`}>
      {isDemo ? 'Demo-safe Deterministic Analysis: GitHub/OpenAI access is limited, so results are generated from bounded public data or demo-safe samples.' : 'Live OpenAI-enhanced analysis'}
    </div>
  )
}
