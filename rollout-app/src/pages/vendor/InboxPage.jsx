import { useState, useEffect, useRef } from 'react'
import { MessageSquare, Send, CheckCheck, Loader2, ArrowLeft, Phone } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPhone(e164) {
  const digits = e164.replace(/\D/g, '')
  if (digits.length === 11 && digits[0] === '1') {
    const d = digits.slice(1)
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  }
  return e164
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function formatMessageTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function formatMessageDate(iso) {
  const d   = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Conversation List Item ────────────────────────────────────────────────────

function ConversationItem({ conv, isActive, onClick }) {
  const phone   = conv.subscribers?.phone_number ?? ''
  const preview = conv.last_preview ?? ''

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-border transition-colors flex items-start gap-3 ${
        isActive ? 'bg-accent-muted' : 'hover:bg-surface-raised'
      }`}
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-surface-raised border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
        <Phone size={14} className="text-text-tertiary" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="text-text-primary font-body text-sm font-semibold truncate">
            {formatPhone(phone)}
          </p>
          <p className="text-text-tertiary font-body text-xs flex-shrink-0">
            {timeAgo(conv.last_message_at)}
          </p>
        </div>
        <p className="text-text-secondary font-body text-xs truncate">{preview}</p>
        {conv.status === 'resolved' && (
          <span className="inline-block text-[10px] font-body font-medium text-text-tertiary bg-surface-raised border border-border px-1.5 py-0.5 rounded-full mt-1">
            Resolved
          </span>
        )}
      </div>
    </button>
  )
}

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }) {
  const isOutbound = msg.direction === 'outbound'
  return (
    <div className={`flex mb-2 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm font-body leading-relaxed ${
          isOutbound
            ? 'bg-accent text-white rounded-br-sm'
            : 'bg-surface-raised text-text-primary border border-border rounded-bl-sm'
        }`}
      >
        <p>{msg.body}</p>
        <p className={`text-[10px] mt-1 ${isOutbound ? 'text-white/70' : 'text-text-tertiary'}`}>
          {formatMessageTime(msg.created_at)}
        </p>
      </div>
    </div>
  )
}

// ── Date Divider ─────────────────────────────────────────────────────────────

function DateDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-text-tertiary font-body text-xs">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

// ── Thread Panel ─────────────────────────────────────────────────────────────

function ThreadPanel({ conv, vendor, onBack, onResolved }) {
  const [messages, setMessages]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [reply, setReply]         = useState('')
  const [sending, setSending]     = useState(false)
  const [resolving, setResolving] = useState(false)
  const bottomRef                 = useRef(null)
  const textareaRef               = useRef(null)

  useEffect(() => {
    loadMessages()

    // Realtime subscription for new messages in this conversation
    const channel = supabase
      .channel(`conv:${conv.id}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'conversation_messages',
        filter: `conversation_id=eq.${conv.id}`,
      }, payload => {
        setMessages(prev => {
          // Avoid duplicate if we already appended optimistically
          if (prev.find(m => m.id === payload.new.id)) return prev
          return [...prev, payload.new]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conv.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages() {
    setLoading(true)
    const { data } = await supabase
      .from('conversation_messages')
      .select('id, body, direction, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
    setMessages(data ?? [])
    setLoading(false)
  }

  async function handleSend() {
    const text = reply.trim()
    if (!text || sending) return

    setSending(true)
    setReply('')

    const { data, error } = await supabase.functions.invoke('vendor-reply', {
      body: { conversation_id: conv.id, body: text },
    })

    if (error || !data?.success) {
      console.error('vendor-reply error:', error)
      setReply(text)  // Restore on failure
    }

    setSending(false)
    textareaRef.current?.focus()
  }

  async function handleResolve() {
    setResolving(true)
    await supabase
      .from('conversations')
      .update({ status: 'resolved' })
      .eq('id', conv.id)
    setResolving(false)
    onResolved(conv.id)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Group messages by date for date dividers
  const grouped = messages.reduce((acc, msg) => {
    const label = formatMessageDate(msg.created_at)
    ;(acc[label] ??= []).push(msg)
    return acc
  }, {})

  const phone = conv.subscribers?.phone_number ?? ''

  return (
    <div className="flex flex-col h-full">

      {/* Thread header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
        <button
          onClick={onBack}
          className="md:hidden p-1.5 text-text-tertiary hover:text-text-primary transition-colors rounded-lg hover:bg-surface-raised"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-text-primary text-base">
            {formatPhone(phone)}
          </p>
          <p className="text-text-tertiary font-body text-xs">
            {conv.status === 'resolved' ? 'Resolved' : 'Open conversation'}
          </p>
        </div>
        {conv.status === 'open' && (
          <button
            onClick={handleResolve}
            disabled={resolving}
            className="flex items-center gap-1.5 text-xs font-body font-medium text-text-secondary hover:text-text-primary border border-border hover:border-text-secondary px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {resolving
              ? <Loader2 size={12} className="animate-spin" />
              : <CheckCheck size={13} />
            }
            Resolve
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-text-tertiary" />
          </div>
        ) : (
          <>
            {Object.entries(grouped).map(([dateLabel, msgs]) => (
              <div key={dateLabel}>
                <DateDivider label={dateLabel} />
                {msgs.map(msg => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Reply input */}
      <div className="px-4 py-4 border-t border-border flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={reply}
            onChange={e => setReply(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply to customer… (Enter to send)"
            rows={1}
            disabled={conv.status === 'resolved'}
            className="flex-1 bg-surface-raised border border-border rounded-xl px-4 py-3 text-text-primary font-body text-sm placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '44px', maxHeight: '120px' }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={handleSend}
            disabled={!reply.trim() || sending || conv.status === 'resolved'}
            className="w-10 h-10 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
          >
            {sending
              ? <Loader2 size={16} className="animate-spin text-white" />
              : <Send size={16} className="text-white" />
            }
          </button>
        </div>
        {conv.status === 'resolved' && (
          <p className="text-text-tertiary font-body text-xs mt-2 text-center">
            This conversation is resolved. Reopen it by sending a reply.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function InboxPage() {
  const { vendor } = useAuth()

  const [conversations, setConversations] = useState([])
  const [loading, setLoading]             = useState(true)
  const [activeConv, setActiveConv]       = useState(null)
  const [filter, setFilter]               = useState('open')  // 'open' | 'resolved'

  useEffect(() => {
    if (vendor) loadConversations()
  }, [vendor, filter])

  // Realtime: new conversations or updated last_message_at
  useEffect(() => {
    if (!vendor) return

    const channel = supabase
      .channel('conversations-list')
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'conversations',
        filter: `vendor_id=eq.${vendor.id}`,
      }, () => {
        loadConversations()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [vendor])

  async function loadConversations() {
    setLoading(true)
    const { data } = await supabase
      .from('conversations')
      .select('id, status, last_message_at, created_at, subscribers(phone_number)')
      .eq('vendor_id', vendor.id)
      .eq('status', filter)
      .order('last_message_at', { ascending: false })

    // Fetch last message preview for each conversation
    const convs = data ?? []
    const previews = await Promise.all(
      convs.map(c =>
        supabase
          .from('conversation_messages')
          .select('body')
          .eq('conversation_id', c.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
      )
    )

    const withPreviews = convs.map((c, i) => ({
      ...c,
      last_preview: previews[i]?.data?.body ?? '',
    }))

    setConversations(withPreviews)
    setLoading(false)
  }

  function handleResolved(convId) {
    setConversations(prev => prev.filter(c => c.id !== convId))
    if (activeConv?.id === convId) setActiveConv(null)
  }

  const showThread = !!activeConv

  return (
    <div className="flex h-[calc(100vh-0px)] md:h-screen overflow-hidden">

      {/* Conversation list */}
      <div className={`flex flex-col w-full md:w-80 border-r border-border bg-surface flex-shrink-0 ${showThread ? 'hidden md:flex' : 'flex'}`}>

        {/* Header */}
        <div className="px-5 py-5 border-b border-border">
          <h1 className="font-display font-bold text-xl text-text-primary mb-3">Inbox</h1>
          <div className="flex gap-1">
            {['open', 'resolved'].map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); setActiveConv(null) }}
                className={`flex-1 text-sm font-body font-medium py-1.5 rounded-lg transition-colors capitalize ${
                  filter === f
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-raised'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-text-tertiary" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-16 px-6">
              <div className="w-12 h-12 rounded-full bg-surface-raised flex items-center justify-center mx-auto mb-3">
                <MessageSquare size={20} className="text-text-tertiary" />
              </div>
              <p className="text-text-secondary font-body text-sm font-medium mb-1">
                {filter === 'open' ? 'No open conversations' : 'No resolved conversations'}
              </p>
              <p className="text-text-tertiary font-body text-xs">
                {filter === 'open'
                  ? 'When customers text your number, conversations appear here.'
                  : 'Resolved conversations will appear here.'}
              </p>
            </div>
          ) : (
            conversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                isActive={activeConv?.id === conv.id}
                onClick={() => setActiveConv(conv)}
              />
            ))
          )}
        </div>
      </div>

      {/* Thread panel */}
      <div className={`flex-1 flex flex-col bg-bg overflow-hidden ${showThread ? 'flex' : 'hidden md:flex'}`}>
        {activeConv ? (
          <ThreadPanel
            conv={activeConv}
            vendor={vendor}
            onBack={() => setActiveConv(null)}
            onResolved={handleResolved}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-surface flex items-center justify-center mx-auto mb-4 border border-border">
                <MessageSquare size={22} className="text-text-tertiary" />
              </div>
              <p className="text-text-secondary font-body text-sm font-medium">
                Select a conversation
              </p>
              <p className="text-text-tertiary font-body text-xs mt-1">
                Choose from the list to start reading
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
