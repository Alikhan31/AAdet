import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from "react-native";
import { router } from "expo-router";
import { Sparkles } from "lucide-react-native";
import { api } from "../../lib/api";
import { setToken } from "../../lib/auth";
import { colors, card, radius } from "../../lib/theme";

export default function RegisterScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!email || !password) { Alert.alert("Error", "Email and password are required"); return; }
    setLoading(true);
    try {
      await api.auth.register(email.trim(), password, fullName.trim() || undefined);
      const tokenData = await api.auth.login(email.trim(), password);
      await setToken(tokenData.access_token);
      router.replace("/(tabs)/");
    } catch (e: any) {
      Alert.alert("Registration failed", e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={s.logoArea}>
          <View style={s.logoIcon}>
            <Sparkles size={36} color="#fff" />
          </View>
          <Text style={s.appName}>HabitFlow</Text>
          <Text style={s.tagline}>Build habits that last</Text>
        </View>

        <View style={[card, { padding: 24 }]}>
          <Text style={s.formTitle}>Create account</Text>
          <Text style={s.formSub}>Start your habit journey today</Text>

          <Text style={s.label}>Full name</Text>
          <TextInput
            style={s.input}
            placeholder="Your name (optional)"
            placeholderTextColor={colors.mutedFg}
            value={fullName}
            onChangeText={setFullName}
          />

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            placeholder="you@email.com"
            placeholderTextColor={colors.mutedFg}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={s.label}>Password</Text>
          <View style={s.passwordRow}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedFg}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword(v => !v)}>
              <Text style={s.eyeText}>{showPassword ? "Hide" : "Show"}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.btn} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Create Account</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={{ alignItems: "center", marginTop: 16 }}>
            <Text style={s.link}>Already have an account? <Text style={{ color: colors.primary, fontWeight: "600" }}>Sign in</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, padding: 24, justifyContent: "center" },
  logoArea: { alignItems: "center", marginBottom: 32 },
  logoIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  appName: { fontSize: 28, fontWeight: "700", color: colors.foreground, letterSpacing: -0.5 },
  tagline: { color: colors.mutedFg, fontSize: 15, marginTop: 4 },
  formTitle: { color: colors.foreground, fontSize: 20, fontWeight: "700", marginBottom: 4 },
  formSub: { color: colors.mutedFg, fontSize: 14, marginBottom: 20 },
  label: { color: colors.foreground, fontSize: 14, fontWeight: "500", marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: colors.muted, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 13, color: colors.foreground, fontSize: 16, marginBottom: 4 },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  eyeBtn: { paddingHorizontal: 10 },
  eyeText: { color: colors.mutedFg, fontSize: 14 },
  btn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: 16, alignItems: "center", marginTop: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  link: { color: colors.mutedFg, fontSize: 14 },
});
