import { FormEvent, useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Markdown from 'react-markdown'
import { Send, Bot, User, Trash2, AlertCircle, FileCode, Check, Sparkles, MessageSquareCode } from 'lucide-react'
import { askQuestion } from '../services/apiService'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  confidence?: number
  sourceFiles?: string[]
  provider?: string
}

const QUICK_SUGGESTIONS = [
  'What is this repository about?',
  'Explain the architecture & tech stack',
  'How do I refactor the top hotspot?',
  'Write a test for the core modules',
]

/**
 * General-purpose AI Chatbot powered by Gemini and Codebase Intelligence.
 */
export function RepositoryQA({ analysisId }: { analysisId: string }) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content:
        'Hello! I am CodeGenome AI. You can ask me anything—whether about this repository’s purpose and architecture, how to refactor code, or any general software and coding questions. How can I help you today?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      confidence: 1.0,
      provider: 'CodeGenome AI',
    },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [messages, loading])

  async function handleSend(promptText?: string) {
    const textToSubmit = (promptText || question).trim()
    if (!textToSubmit || loading) return

    const userMsg: ChatMessage = {
      id: 'msg-' + Date.now(),
      role: 'user',
      content: textToSubmit,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const historyToSend = messages
      .filter((m) => !m.id.startsWith('init-'))
      .map((m) => ({ role: m.role, content: m.content }))

    setMessages((prev) => [...prev, userMsg])
    setQuestion('')
    setLoading(true)
    setError('')

    try {
      const res = await askQuestion(analysisId, textToSubmit, historyToSend)
      const botMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        role: 'assistant',
        content: res.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        confidence: res.confidence,
        sourceFiles: res.sourceFiles,
        provider: res.provider || 'CodeGenome AI',
      }
      setMessages((prev) => [...prev, botMsg])
    } catch (err: any) {
      setError(err?.message || 'Failed to generate AI response.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleClear = () => {
    setMessages([
      {
        id: 'init-' + Date.now(),
        role: 'assistant',
        content: 'Chat history cleared. What would you like to ask or explore next?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        confidence: 1.0,
        provider: 'CodeGenome AI',
      },
    ])
    setError('')
  }

  return (
    <div
      className="qa-chatbot-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(12, 12, 14, 0.95)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        overflow: 'hidden',
        minHeight: '420px',
      }}
    >
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none !important;
        }
        .no-scrollbar {
          -ms-overflow-style: none !important;
          scrollbar-width: none !important;
        }
        .sleek-scrollbar::-webkit-scrollbar {
          width: 5px !important;
          height: 5px !important;
        }
        .sleek-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.01) !important;
        }
        .sleek-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1) !important;
          border-radius: 10px !important;
        }
        .sleek-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2) !important;
        }
        .qa-markdown {
          font-size: 13px;
          line-height: 1.65;
          color: #e4e4e7;
          word-break: break-word;
        }
        .qa-markdown p {
          margin: 0 0 10px 0;
        }
        .qa-markdown p:last-child {
          margin-bottom: 0;
        }
        .qa-markdown ul, .qa-markdown ol {
          margin: 6px 0 10px 20px;
          padding: 0;
        }
        .qa-markdown li {
          margin-bottom: 4px;
        }
        .qa-markdown strong {
          color: #ffffff;
          font-weight: 600;
        }
        .qa-markdown code {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 2px 5px;
          border-radius: 4px;
          font-family: 'DM Mono', monospace;
          font-size: 12px;
          color: #a7f3d0;
        }
        .qa-markdown pre {
          background: rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 12px 14px;
          overflow-x: auto;
          margin: 10px 0;
        }
        .qa-markdown pre code {
          background: transparent;
          border: none;
          padding: 0;
          color: #e4e4e7;
          font-size: 12px;
        }
        .qa-markdown h1, .qa-markdown h2, .qa-markdown h3, .qa-markdown h4 {
          margin: 12px 0 6px 0;
          color: #ffffff;
          font-weight: 700;
          font-size: 14px;
        }
        .qa-markdown blockquote {
          border-left: 3px solid #22c55e;
          margin: 8px 0;
          padding-left: 12px;
          color: #a1a1aa;
        }
      `}</style>

      {/* Header */}
      <div
        className="qa-chatbot-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'rgba(20, 20, 24, 0.9)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              padding: '6px',
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(66, 133, 244, 0.2))',
              borderRadius: '8px',
              color: 'var(--neon)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
            }}
          >
            <Sparkles size={16} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#fff' }}>
                AI Chatbot
              </h4>
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: '700',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: 'var(--neon)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                }}
              >
                Gemini Powered
              </span>
            </div>
            <span style={{ fontSize: '10.5px', color: 'var(--muted)', fontFamily: 'DM Mono, monospace' }}>
              Ask anything about this repo or general questions
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClear}
          title="Clear Chat History"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--muted)',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer',
          }}
        >
          <Trash2 size={12} />
          <span>Clear Chat</span>
        </button>
      </div>

      {/* Quick Prompt Chips */}
      <div
        className="no-scrollbar"
        style={{
          display: 'flex',
          gap: '6px',
          padding: '8px 16px',
          background: 'rgba(16, 16, 20, 0.6)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        {QUICK_SUGGESTIONS.map((chip, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSend(chip)}
            disabled={loading}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#d4d4d8',
              borderRadius: '16px',
              padding: '4px 10px',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease',
            }}
          >
            <MessageSquareCode size={11} className="text-neon" />
            <span>{chip}</span>
          </button>
        ))}
      </div>

      {/* Chat Messages Stream */}
      <div
        ref={chatContainerRef}
        className="qa-chat-feed sleek-scrollbar"
        style={{
          flex: 1,
          padding: '16px',
          overflowY: 'auto',
          maxHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
                gap: '10px',
                width: '100%',
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  background:
                    msg.role === 'user'
                      ? 'rgba(66, 133, 244, 0.2)'
                      : 'linear-gradient(135deg, rgba(34, 197, 94, 0.25), rgba(66, 133, 244, 0.25))',
                  border: `1px solid ${msg.role === 'user' ? '#4285F4' : '#22c55e'}`,
                  color: msg.role === 'user' ? '#4285F4' : '#22c55e',
                }}
              >
                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>

              <div
                style={{
                  maxWidth: '85%',
                  background:
                    msg.role === 'user' ? 'rgba(20, 30, 50, 0.85)' : 'rgba(16, 22, 32, 0.95)',
                  border: `1px solid ${
                    msg.role === 'user' ? 'rgba(66, 133, 244, 0.3)' : 'rgba(255, 255, 255, 0.08)'
                  }`,
                  borderRadius: '10px',
                  padding: '12px 14px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginBottom: '6px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      color: msg.role === 'user' ? '#60a5fa' : 'var(--neon)',
                    }}
                  >
                    {msg.role === 'user' ? 'YOU' : (msg.provider || 'CODEGENOME AI')}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--muted)',
                      fontFamily: 'DM Mono, monospace',
                    }}
                  >
                    {msg.timestamp}
                  </span>
                </div>

                <div className="qa-markdown">
                  <Markdown>{msg.content}</Markdown>
                </div>

                {msg.role === 'assistant' && (
                  <div
                    style={{
                      marginTop: '8px',
                      paddingTop: '8px',
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      fontSize: '10.5px',
                    }}
                  >
                    {msg.sourceFiles && msg.sourceFiles.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: 'var(--muted)',
                        }}
                      >
                        <FileCode size={11} />
                        <span>{msg.sourceFiles.slice(0, 2).join(', ')}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.content)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      title="Copy response"
                    >
                      {copiedId === msg.id ? <Check size={11} className="text-neon" /> : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(34, 197, 94, 0.2)',
                border: '1px solid #22c55e',
                color: '#22c55e',
              }}
            >
              <Bot size={14} />
            </div>
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(16, 22, 32, 0.9)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                fontSize: '12px',
                color: 'var(--cyan)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span className="spinner" aria-hidden="true" />
              <span>Thinking & generating answer...</span>
            </div>
          </div>
        )}

      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSend()
        }}
        style={{
          padding: '12px 16px',
          background: 'rgba(8, 8, 10, 0.95)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
        }}
      >
        <input
          className="qa-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask me anything (e.g. explain this repo, how code works, write a test, or general questions)..."
          disabled={loading}
          style={{ flex: 1, padding: '12px 14px', borderRadius: '8px', fontSize: '13px' }}
        />
        <button
          type="submit"
          className="run-button"
          disabled={loading || !question.trim()}
          style={{ padding: '12px 18px', borderRadius: '8px', fontSize: '13px' }}
        >
          <Send size={14} />
          <span>Send</span>
        </button>
      </form>

      {error && (
        <div
          style={{
            padding: '8px 16px',
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

