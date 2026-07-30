import { useState } from 'react'
import { downloadScaffolds } from '../services/apiService'

/**
 * Downloads the server-generated scaffold ZIP for an analysis.
 */
export function DownloadButton({ analysisId }: { analysisId: string }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleDownload() {
    setLoading(true)
    setMessage('')
    try {
      await downloadScaffolds(analysisId)
      setMessage('ZIP ready')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Download failed.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="download-action"><button onClick={handleDownload} disabled={loading}>{loading ? 'Preparing ZIP...' : 'Download scaffolds'}</button>{message && <span>{message}</span>}</div>
}
