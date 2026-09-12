import { useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Check } from 'lucide-react'
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
      setMessage('ZIP READY')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'FAILED')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="download-action">
      <motion.button 
        className="download-button" 
        onClick={handleDownload} 
        disabled={loading}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        style={{ borderRadius: '4px' }}
      >
        {loading ? (
          <><span className="spinner" aria-hidden="true" /> PREPARING ZIP</>
        ) : message === 'ZIP READY' ? (
          <><Check size={14} /> DOWNLOADED</>
        ) : (
          <><Download size={14} /> DOWNLOAD SCAFFOLDS</>
        )}
      </motion.button>
      {message && <span className="download-state" style={{ font: '500 11px "DM Mono", monospace', marginLeft: '8px', color: 'var(--neon)' }}>{message}</span>}
    </div>
  )
}
