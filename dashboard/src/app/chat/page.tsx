"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  Trash2,
  AlertTriangle,
  Shield,
  BrainCircuit,
  Search,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

/* ── Types ── */
interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  llmUsed?: boolean;
  note?: string;
}

/* ── Suggested prompts ── */
const SUGGESTIONS = [
  { icon: Shield, label: "How does the investigation pipeline work?", color: "text-blue-600" },
  { icon: BrainCircuit, label: "Explain SHAP feature attribution", color: "text-purple-600" },
  { icon: AlertTriangle, label: "What is a SYN flood attack?", color: "text-red-600" },
  { icon: Search, label: "How to investigate brute force attempts?", color: "text-amber-600" },
];

/* ── Markdown-lite renderer ── */
function renderMarkdown(text: string) {
  // Split into lines, handle bold, bullets, headings
  const lines = text.split("\n");
  return lines.map((line, i) => {
    // Bold
    let processed = line.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
    // Inline code
    processed = processed.replace(/`(.*?)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">$1</code>');
    // Italic
    processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');

    if (line.startsWith("### ")) {
      return (
        <h3 key={i} className="mt-3 mb-1 text-sm font-bold text-foreground" dangerouslySetInnerHTML={{ __html: processed.slice(4) }} />
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h2 key={i} className="mt-3 mb-1 text-[15px] font-bold text-foreground" dangerouslySetInnerHTML={{ __html: processed.slice(3) }} />
      );
    }
    if (/^\d+\.\s/.test(line)) {
      return (
        <div key={i} className="ml-4 flex gap-2 py-0.5">
          <span className="shrink-0 text-muted-foreground">{line.match(/^\d+\./)?.[0]}</span>
          <span dangerouslySetInnerHTML={{ __html: processed.replace(/^\d+\.\s*/, "") }} />
        </div>
      );
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return (
        <div key={i} className="ml-4 flex gap-2 py-0.5">
          <span className="shrink-0 text-muted-foreground">•</span>
          <span dangerouslySetInnerHTML={{ __html: processed.slice(2) }} />
        </div>
      );
    }
    if (line.trim() === "") {
      return <div key={i} className="h-2" />;
    }
    return <p key={i} className="py-0.5" dangerouslySetInnerHTML={{ __html: processed }} />;
  });
}

/* ══════════════════════════════════════════════════════════════
   Chat Page
   ══════════════════════════════════════════════════════════════ */
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || sending) return;

      const userMsg: Message = {
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setSending(true);

      try {
        const history = [...messages, userMsg].slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
        });

        const data = await res.json();

        const assistantMsg: Message = {
          role: "assistant",
          content: data.response ?? data.error ?? "No response received.",
          timestamp: new Date(),
          llmUsed: data.llm_used,
          note: data.note,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Sorry, I encountered an error: ${msg}. The AI service may be unavailable.`,
            timestamp: new Date(),
            llmUsed: false,
          },
        ]);
        toast.error("Chat error", { description: msg });
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [messages, sending],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">CLIF AI Chat</h1>
          <p className="text-sm text-muted-foreground">
            Security operations assistant powered by qwen3 via Ollama
          </p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                setMessages([]);
                toast.info("Chat cleared");
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
          <Badge variant="outline" className="gap-1">
            <Sparkles className="h-3 w-3" />
            qwen3-vl:4b
          </Badge>
        </div>
      </div>

      {/* Chat Area */}
      <Card className="flex flex-1 flex-col overflow-hidden">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4"
        >
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <MessageSquare className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">How can I help?</h2>
                <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                  I&apos;m CLIF AI — ask me about security events, attack patterns,
                  MITRE ATT&CK mappings, or investigation workflows.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 max-w-lg">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s.label)}
                    className="flex items-center gap-2 rounded-lg border bg-card p-3 text-left text-xs transition-colors hover:bg-muted/50"
                  >
                    <s.icon className={`h-4 w-4 shrink-0 ${s.color}`} />
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="shrink-0 mt-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 border"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="space-y-0">{renderMarkdown(msg.content)}</div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
                {/* Meta */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] opacity-60">
                    {msg.timestamp.toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {msg.role === "assistant" && msg.llmUsed !== undefined && (
                    <span className={`text-[10px] ${msg.llmUsed ? "text-emerald-600" : "text-amber-600"}`}>
                      {msg.llmUsed ? "LLM" : "Built-in"}
                    </span>
                  )}
                </div>
              </div>
              {msg.role === "user" && (
                <div className="shrink-0 mt-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/10">
                    <User className="h-4 w-4 text-blue-600" />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {sending && (
            <div className="flex gap-3">
              <div className="shrink-0 mt-1">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 border px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Thinking…</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t bg-card p-4">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about security events, attacks, MITRE ATT&CK, XAI…"
              className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              rows={1}
              disabled={sending}
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || sending}
              className="gap-1.5 shrink-0"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send
            </Button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Press Enter to send, Shift+Enter for new line. Uses local Ollama qwen3-vl:4b model.
          </p>
        </div>
      </Card>
    </div>
  );
}
