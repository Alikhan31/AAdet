import { useState, useRef, useEffect } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bot, Send, Lightbulb, TrendingUp, Clock, Sparkles } from "lucide-react-native";
import { getToken } from "../../lib/auth";
import { api } from "../../lib/api";
import { colors, card, radius } from "../../lib/theme";

interface Message { role: "user" | "assistant"; text: string; time: Date; }
interface HistoryItem { role: string; content: string; }

const QUICK_QUESTIONS = [
  { Icon: Lightbulb, text: "How can I improve my morning routine?" },
  { Icon: TrendingUp, text: "Why did my streak drop last week?" },
  { Icon: Clock, text: "What is the best time to meditate?" },
  { Icon: Sparkles, text: "Give me a motivation boost" },
];

export default function AICoachScreen() {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    getToken().then(async t => {
      setToken(t);
      if (t) {
        try {
          const [me, summary] = await Promise.all([api.auth.me(t), api.analytics.summary(t)]);
          const name = me.full_name?.split(" ")[0] ?? me.email.split("@")[0];
          const consistency = summary.completions_this_week > 0
            ? Math.round((summary.completions_this_week / Math.max(summary.possible_this_week, 1)) * 100)
            : 0;
          const greeting = `Hey ${name}! I'm your AI habit coach. I've been looking at your recent progress — you're at a ${consistency}% completion rate this week! How can I help you today?`;
          setMessages([{ role: "assistant", text: greeting, time: new Date() }]);
        } catch {
          setMessages([{ role: "assistant", text: "Hey! I'm your AI habit coach. How can I help you today?", time: new Date() }]);
        }
      }
    });
  }, []);

  function formatTime(d: Date) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || !token) return;
    setInput("");

    const userMsg: Message = { role: "user", text: msg, time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const { reply } = await api.ai.chat(token, msg, history);
      setHistory(prev => [...prev, { role: "user", content: msg }, { role: "assistant", content: reply }]);
      setMessages(prev => [...prev, { role: "assistant", text: reply, time: new Date() }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Sorry, I couldn't reach the AI service. Please try again.", time: new Date() }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.bottom + 60}>
      <View style={[ai.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={ai.header}>
          <View style={ai.botAvatar}>
            <Bot size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ai.botName}>AI Coach</Text>
            <Text style={ai.botSub}>Powered by your habit data</Text>
          </View>
          <View style={ai.onlineDot} />
          <Text style={ai.onlineText}>Online</Text>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, paddingBottom: 16, gap: 12 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map((m, i) => (
            <View key={i} style={[ai.msgRow, m.role === "user" && { flexDirection: "row-reverse" }]}>
              {m.role === "assistant" && (
                <View style={[ai.botAvatar, { width: 32, height: 32, marginRight: 8, alignSelf: "flex-end" }]}>
                  <Bot size={16} color={colors.primary} />
                </View>
              )}
              <View style={[ai.bubble, m.role === "user" ? ai.bubbleUser : ai.bubbleBot]}>
                <Text style={[ai.bubbleText, m.role === "user" && { color: "#fff" }]}>{m.text}</Text>
                <Text style={[ai.bubbleTime, m.role === "user" && { color: "rgba(255,255,255,0.7)" }]}>{formatTime(m.time)}</Text>
              </View>
            </View>
          ))}
          {loading && (
            <View style={ai.msgRow}>
              <View style={[ai.botAvatar, { width: 32, height: 32, marginRight: 8, alignSelf: "flex-end" }]}>
                <Bot size={16} color={colors.primary} />
              </View>
              <View style={ai.bubbleBot}>
                <Text style={{ color: colors.mutedFg, fontSize: 14 }}>Thinking...</Text>
              </View>
            </View>
          )}

          {messages.length === 1 && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.mutedFg, fontSize: 12, fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 }}>Quick questions</Text>
              {QUICK_QUESTIONS.map((q, i) => (
                <TouchableOpacity key={i} style={[card, { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 }]} onPress={() => sendMessage(q.text)}>
                  <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" }}>
                    <q.Icon size={16} color={colors.primary} />
                  </View>
                  <Text style={{ color: colors.foreground, fontSize: 14, flex: 1 }}>{q.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={[ai.inputRow, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={ai.input}
            placeholder="Ask your AI coach..."
            placeholderTextColor={colors.mutedFg}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => sendMessage()}
            returnKeyType="send"
          />
          <TouchableOpacity style={ai.sendBtn} onPress={() => sendMessage()} disabled={loading}>
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const ai = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
  botAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" },
  botName: { color: colors.foreground, fontWeight: "700", fontSize: 16 },
  botSub: { color: colors.mutedFg, fontSize: 12 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  onlineText: { color: colors.primary, fontSize: 13, fontWeight: "500" },
  msgRow: { flexDirection: "row", alignItems: "flex-end" },
  bubble: { maxWidth: "75%", borderRadius: radius.lg, padding: 12 },
  bubbleBot: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  bubbleUser: { backgroundColor: colors.primary },
  bubbleText: { color: colors.foreground, fontSize: 14, lineHeight: 20 },
  bubbleTime: { color: colors.mutedFg, fontSize: 10, marginTop: 4 },
  inputRow: { flexDirection: "row", padding: 12, paddingTop: 8, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 },
  input: { flex: 1, backgroundColor: colors.muted, borderRadius: radius.full, paddingHorizontal: 16, paddingVertical: 10, color: colors.foreground, fontSize: 15 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
