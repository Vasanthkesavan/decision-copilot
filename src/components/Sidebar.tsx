import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, ChevronsLeft, Settings, Trash2, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface SidebarProps {
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  onClose: () => void;
  theme: "light" | "dark";
  refreshKey: number;
}

export default function Sidebar({
  currentConversationId,
  onSelectConversation,
  onNewChat,
  onOpenSettings,
  onToggleTheme,
  onClose,
  theme,
  refreshKey,
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    loadConversations();
  }, [refreshKey]);

  async function loadConversations() {
    try {
      const convs = await invoke<Conversation[]>("get_conversations");
      setConversations(convs);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await invoke("delete_conversation", { conversationId: id });
      if (currentConversationId === id) {
        onNewChat();
      }
      loadConversations();
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  return (
    <div className="w-[280px] bg-sidebar border-r border-sidebar-border flex flex-col h-full shrink-0">
      <div className="p-3 flex items-center justify-between border-b border-sidebar-border">
        <h1 className="text-sm font-semibold text-sidebar-foreground">Decision Copilot</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3">
        <Button
          variant="secondary"
          onClick={onNewChat}
          className="w-full justify-start gap-2"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => onSelectConversation(conv.id)}
            className={cn(
              "group px-3 py-2.5 rounded-lg cursor-pointer mb-0.5 flex items-center justify-between transition-colors",
              currentConversationId === conv.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm truncate">{conv.title}</div>
              <div className="text-xs text-sidebar-foreground/30 mt-0.5">
                {formatDate(conv.updated_at)}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => handleDelete(e, conv.id)}
              className="opacity-0 group-hover:opacity-100 h-7 w-7 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0 ml-2"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      <div className="p-3 space-y-1">
        <Button
          variant="ghost"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="w-full justify-start gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </Button>
        <Button
          variant="ghost"
          onClick={onOpenSettings}
          className="w-full justify-start gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </div>
    </div>
  );
}
