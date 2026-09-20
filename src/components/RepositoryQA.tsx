import { useState, useRef, useEffect } from 'react'
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
 * Adapts seamlessly to both Dark Obsidian and Clean Light themes.
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
    <div className="qa-chatbot-container">
      {/* Header */}
      <div className="qa-chatbot-header">
        <div className="qa-chatbot-header-left">
          <div className="qa-sparkles-icon">
            <Sparkles size={15} />
          </div>
          <div>
            <div className="qa-title-row">
              <h4 className="qa-chatbot-title">AI Chatbot</h4>
              <span className="qa-gemini-badge">Gemini Powered</span>
            </div>
            <span className="qa-chatbot-sub">
              Ask anything about this repo or general questions
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClear}
          title="Clear Chat History"
          className="qa-clear-btn"
        >
          <Trash2 size={12} />
          <span>Clear Chat</span>
        </button>
      </div>

      {/* Quick Prompt Chips */}
      <div className="qa-suggestions-bar no-scrollbar">
        {QUICK_SUGGESTIONS.map((chip, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSend(chip)}
            disabled={loading}
            className="qa-suggestion-chip"
          >
            <MessageSquareCode size={11} className="qa-chip-icon" />
            <span>{chip}</span>
          </button>
        ))}
      </div>

      {/* Chat Messages Stream */}
      <div ref={chatContainerRef} className="qa-chat-feed sleek-scrollbar">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`qa-msg-row ${msg.role === 'user' ? 'is-user' : 'is-bot'}`}
            >
              <div className={`qa-avatar ${msg.role === 'user' ? 'is-user' : 'is-bot'}`}>
                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>

              <div className={`qa-bubble ${msg.role === 'user' ? 'is-user' : 'is-bot'}`}>
                <div className="qa-msg-header">
                  <span className={`qa-msg-author ${msg.role === 'user' ? 'is-user' : 'is-bot'}`}>
                    {msg.role === 'user' ? 'YOU' : (msg.provider || 'CODEGENOME AI')}
                  </span>
                  <span className="qa-msg-time">{msg.timestamp}</span>
                </div>

                <div className="qa-markdown">
                  <Markdown>{msg.content}</Markdown>
                </div>

                {msg.role === 'assistant' && (
                  <div className="qa-msg-footer">
                    {msg.sourceFiles && msg.sourceFiles.length > 0 && (
                      <div className="qa-source-files">
                        <FileCode size={11} />
                        <span>{msg.sourceFiles.slice(0, 2).join(', ')}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="qa-copy-btn"
                      title="Copy response"
                    >
                      {copiedId === msg.id ? <Check size={11} /> : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <div className="qa-msg-row is-bot">
            <div className="qa-avatar is-bot">
              <Bot size={14} />
            </div>
            <div className="qa-thinking-indicator">
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
        className="qa-input-bar"
      >
        <input
          className="qa-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask me anything (e.g. explain this repo, how code works, write a test, or general questions)..."
          disabled={loading}
        />
        <button
          type="submit"
          className="run-button qa-send-btn"
          disabled={loading || !question.trim()}
        >
          <Send size={14} />
          <span>Send</span>
        </button>
      </form>

      {error && (
        <div className="qa-error-box">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
