import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, space, styles, type } from "../lib/theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Icon({ name, size = 20, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color}/>;
}

// ---------------------------------------------------------------------------
// Estrutura
// ---------------------------------------------------------------------------

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const content = padded ? styles.content : { paddingBottom: 110, gap: space.xl };
  return <SafeAreaView style={styles.screen} edges={["left", "right"]}>
    {scroll
      ? <ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">{children}</ScrollView>
      : <View style={[content, { flex: 1 }]}>{children}</View>}
  </SafeAreaView>;
}

/** Título de página em caixa alta, com uma linha branca acima: a assinatura editorial das telas. */
export function Heading({ title, subtitle, size = "headline" }: { title: string; subtitle?: string; size?: "display" | "headline" }) {
  return <View style={{ gap: space.sm }}>
    <View style={styles.rule}/>
    <Text style={type[size]} accessibilityRole="header">{title}</Text>
    {subtitle ? <Text style={type.bodySmall}>{subtitle}</Text> : null}
  </View>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <View style={styles.section}>
    <View style={[styles.between, { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.md }]}><Text style={type.title} accessibilityRole="header">{title}</Text>{action}</View>
    {children}
  </View>;
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "danger";

const buttonColors: Record<ButtonVariant, { bg: string; fg: string; border?: string; pressed: string }> = {
  filled: { bg: colors.accent, fg: colors.onAccent, pressed: "#b8e22e" },
  tonal: { bg: colors.ink, fg: colors.bg, pressed: "#dcdce2" },
  outlined: { bg: "transparent", fg: colors.ink, border: colors.ink, pressed: colors.surface2 },
  text: { bg: "transparent", fg: colors.ink, pressed: colors.surface },
  danger: { bg: "transparent", fg: colors.error, border: colors.error, pressed: colors.errorBg },
};

/** Botões: filled (lima, ação principal), tonal (branco), outlined, text e danger. Caixa alta, cantos retos, 48 dp. */
export function Button({ title, onPress, variant = "filled", icon, disabled, loading, block = true }: {
  title: string; onPress: () => void; variant?: ButtonVariant; icon?: IconName; disabled?: boolean; loading?: boolean; block?: boolean;
}) {
  const c = buttonColors[variant];
  const off = disabled || loading;
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled: off, busy: loading }}
    disabled={off}
    onPress={onPress}
    android_ripple={{ color: c.pressed }}
    style={({ pressed }) => [
      { minHeight: 50, borderRadius: radius.sm, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: pressed ? c.pressed : c.bg, borderWidth: c.border ? 1 : 0, borderColor: c.border, opacity: off ? 0.4 : 1 },
      block ? null : { alignSelf: "flex-start" },
    ]}
  >
    {loading ? <ActivityIndicator color={c.fg}/> : <>
      <Text style={[type.label, { color: c.fg }]}>{title}</Text>
      {icon && <Icon name={icon} size={16} color={c.fg}/>}
    </>}
  </Pressable>;
}

/** Botão flutuante: a única ação principal da tela. */
export function Fab({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    style={({ pressed }) => ({ position: "absolute", right: space.lg, bottom: space.xl, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: pressed ? "#b8e22e" : colors.accent, borderRadius: radius.sm, paddingHorizontal: 18, height: 52, elevation: 8, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } })}
  >
    <Text style={[type.label, { color: colors.onAccent }]}>{label}</Text>
    <Icon name={icon} size={18} color={colors.onAccent}/>
  </Pressable>;
}

export function Field({ label, error, hint, style, ...input }: TextInputProps & { label: string; error?: string; hint?: string }) {
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: 4 }}>
    <Text style={[type.labelSmall, focused ? { color: colors.accent } : null]}>{label}</Text>
    <TextInput
      placeholderTextColor={colors.ink3}
      selectionColor={colors.accent}
      cursorColor={colors.accent}
      {...input}
      onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
      style={[styles.input, focused ? styles.inputFocused : null, error ? styles.inputError : null, input.multiline ? { minHeight: 96, textAlignVertical: "top" } : null, input.editable === false ? { opacity: 0.55 } : null, style]}
    />
    {hint && !error ? <Text style={[type.bodySmall, { marginTop: 4 }]}>{hint}</Text> : null}
    {error ? <Text style={[type.bodySmall, { color: colors.error, marginTop: 4 }]}>{error}</Text> : null}
  </View>;
}

export function PasswordField({ label = "Senha", value, onChangeText }: { label?: string; value: string; onChangeText: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: 4 }}>
    <Text style={[type.labelSmall, focused ? { color: colors.accent } : null]}>{label}</Text>
    <View>
      <TextInput value={value} onChangeText={onChangeText} secureTextEntry={!visible} placeholder="Mínimo de 6 caracteres" placeholderTextColor={colors.ink3} selectionColor={colors.accent} autoCapitalize="none" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={[styles.input, focused ? styles.inputFocused : null, { paddingRight: 48 }]}/>
      <Pressable onPress={() => setVisible(!visible)} accessibilityRole="button" accessibilityLabel={visible ? "Ocultar senha" : "Mostrar senha"} hitSlop={8} style={{ position: "absolute", right: 0, top: 0, width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
        <Icon name={visible ? "eye-off-outline" : "eye-outline"} color={colors.ink2}/>
      </Pressable>
    </View>
  </View>;
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={[styles.row, { minHeight: 48, gap: 12 }]}>
    <View style={{ width: 22, height: 22, borderRadius: radius.xs, borderWidth: 1.5, borderColor: checked ? colors.accent : colors.ink2, backgroundColor: checked ? colors.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
      {checked && <Icon name="checkmark" size={16} color={colors.onAccent}/>}
    </View>
    <Text style={[type.body, { flex: 1 }]}>{label}</Text>
  </Pressable>;
}

export interface Option { value: string; label: string }

/** Campo de seleção: abre uma lista pesquisável em tela cheia (UFs, cidades, estilos...). */
export function Select({ label, value, options, placeholder = "Selecionar", disabled, searchable, onChange }: { label: string; value: string; options: Option[]; placeholder?: string; disabled?: boolean; searchable?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;

  return <View style={{ gap: 4 }}>
    <Text style={type.labelSmall}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => { setQuery(""); setOpen(true); }} style={[styles.input, styles.between, disabled ? { opacity: 0.55 } : null]}>
      <Text style={[type.body, !selected ? { color: colors.ink3 } : null]} numberOfLines={1}>{selected?.label ?? placeholder}</Text>
      <Icon name="chevron-down" size={18} color={colors.ink2}/>
    </Pressable>
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={styles.screen}>
        <View style={[styles.between, { padding: space.lg }]}>
          <Text style={type.title}>{label}</Text>
          <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={10} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><Icon name="close"/></Pressable>
        </View>
        {searchable && <TextInput value={query} onChangeText={setQuery} placeholder="Buscar..." placeholderTextColor={colors.ink3} selectionColor={colors.accent} autoFocus style={[styles.input, { marginHorizontal: space.lg, marginBottom: space.sm }]}/>}
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.value}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <Pressable onPress={() => { onChange(item.value); setOpen(false); }} android_ripple={{ color: colors.surface3 }} style={({ pressed }) => [styles.between, { minHeight: 52, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: pressed ? colors.surface2 : "transparent" }]}>
            <Text style={[type.body, item.value === value ? { color: colors.accent } : null]}>{item.label}</Text>
            {item.value === value && <Icon name="checkmark" color={colors.accent}/>}
          </Pressable>}
          ListEmptyComponent={<Text style={[type.bodySmall, { padding: space.lg }]}>Nenhuma opção encontrada.</Text>}
        />
      </SafeAreaView>
    </Modal>
  </View>;
}

/** Chips de seleção múltipla (estilos musicais) ou única (raio do feed). */
/** "scroll": uma única linha rolável, para filtros curtos como a distância do feed. */
export function Chips({ options, selected, onToggle, labels, scroll }: { options: readonly string[]; selected: string[]; onToggle: (value: string) => void; labels?: (value: string) => string; scroll?: boolean }) {
  const items = options.map((option) => {
      const on = selected.includes(option);
      return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onToggle(option)} style={({ pressed }) => ({ minHeight: 38, borderRadius: radius.sm, paddingHorizontal: 14, justifyContent: "center", backgroundColor: on ? colors.ink : pressed ? colors.surface2 : "transparent", borderWidth: 1, borderColor: on ? colors.ink : colors.line })}>
        <Text style={[type.label, { color: on ? colors.bg : colors.ink2 }]}>{labels ? labels(option) : option}</Text>
      </Pressable>;
  });
  if (scroll) return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: space.lg }}>{items}</ScrollView>;
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{items}</View>;
}

export function ListItem({ icon, title, subtitle, onPress, tone = "default", trailing = "arrow-forward" }: { icon: IconName; title: string; subtitle?: string; onPress: () => void; tone?: "default" | "danger"; trailing?: IconName | null }) {
  const color = tone === "danger" ? colors.error : colors.ink;
  return <Pressable accessibilityRole="button" onPress={onPress} android_ripple={{ color: colors.surface3 }} style={({ pressed }) => [styles.row, { minHeight: 64, paddingVertical: space.md, gap: 14, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: pressed ? colors.surface : "transparent" }]}>
    <Icon name={icon} size={20} color={tone === "danger" ? colors.error : colors.ink2}/>
    <View style={{ flex: 1 }}><Text style={[type.titleSmall, { color }]}>{title}</Text>{subtitle ? <Text style={type.bodySmall} numberOfLines={1}>{subtitle}</Text> : null}</View>
    {trailing && <Icon name={trailing} size={18} color={colors.ink3}/>}
  </Pressable>;
}

// ---------------------------------------------------------------------------
// Estados e feedback
// ---------------------------------------------------------------------------

export function Pill({ text, tone = "primary" }: { text: string; tone?: "primary" | "success" | "muted" | "accent" }) {
  const palette = {
    primary: { bg: colors.ink, fg: colors.bg },
    success: { bg: colors.successBg, fg: colors.success },
    muted: { bg: colors.surface2, fg: colors.ink2 },
    accent: { bg: colors.accent, fg: colors.onAccent },
  }[tone];
  return <View style={{ alignSelf: "flex-start", backgroundColor: palette.bg, borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 5 }}><Text style={[type.labelSmall, { color: palette.fg }]}>{text}</Text></View>;
}

export function Tag({ text, onImage }: { text: string; onImage?: boolean }) {
  return <View style={{ backgroundColor: onImage ? "#0a0a0ccc" : colors.surface2, borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 5 }}><Text style={[type.labelSmall, { color: onImage ? colors.ink : colors.ink2 }]}>{text}</Text></View>;
}

/** Esqueleto animado no lugar do conteúdo que ainda está carregando. */
export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: number | `${number}%`; style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.9, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ height, width, borderRadius: radius.xs, backgroundColor: colors.surface2, opacity }, style]}/>;
}

export function Loading({ label = "Carregando...", cards = 2 }: { label?: string; cards?: number }) {
  return <View style={{ gap: space.xl }} accessibilityRole="progressbar" accessibilityLabel={label}>
    {Array.from({ length: cards }, (_, i) => <View key={i} style={{ gap: space.sm }}>
      <Skeleton height={220}/>
      <Skeleton height={22} width="75%"/>
      <Skeleton height={14} width="45%"/>
    </View>)}
  </View>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <View style={styles.empty} accessibilityRole="alert">
    <Text style={type.headline}>Algo deu errado</Text>
    <Text style={type.bodySmall}>{message}</Text>
    <Button title="Tentar novamente" variant="outlined" icon="refresh" onPress={onRetry} block={false}/>
  </View>;
}

export function EmptyState({ title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return <View style={styles.empty}>
    <View style={styles.rule}/>
    <Text style={type.headline}>{title}</Text>
    {children}
    {action}
  </View>;
}

/** Sem foto, mostra a inicial do nome. */
export function Avatar({ uri, name = "", size = 48, square = false }: { uri?: string | null; name?: string; size?: number; square?: boolean }) {
  const shape = { width: size, height: size, borderRadius: square ? radius.sm : size / 2, backgroundColor: colors.surface2 };
  if (!uri) return <View style={[shape, { alignItems: "center", justifyContent: "center" }]} accessibilityLabel={name}><Text style={[type.title, { fontSize: size * 0.42, lineHeight: size * 0.5 }]}>{name.trim().charAt(0) || "?"}</Text></View>;
  return <Image source={{ uri }} style={shape} accessibilityIgnoresInvertColors/>;
}

export function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  const full = Math.round(rating);
  return <View style={{ flexDirection: "row", gap: 2 }} accessibilityLabel={`Nota ${rating} de 5`}>
    {[1, 2, 3, 4, 5].map((i) => <Icon key={i} name={i <= full ? "star" : "star-outline"} size={size} color={i <= full ? colors.star : colors.line}/>)}
  </View>;
}

export function RatingSummary({ media, total }: { media: number; total: number }) {
  if (total === 0) return <Text style={type.labelSmall}>Novo na plataforma</Text>;
  return <View style={[styles.row, { gap: 6 }]}><Stars rating={media}/><Text style={type.label}>{media.toFixed(1).replace(".", ",")}</Text><Text style={type.bodySmall}>({total})</Text></View>;
}

export function Alert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const box = tone === "error" ? styles.alertError : tone === "success" ? styles.alertSuccess : styles.alertInfo;
  const color = tone === "error" ? colors.error : tone === "success" ? colors.success : colors.ink2;
  const icon: IconName = tone === "error" ? "alert-circle-outline" : tone === "success" ? "checkmark-circle-outline" : "information-circle-outline";
  return <View style={[box, styles.row, { alignItems: "flex-start", gap: 10 }]} accessibilityRole={tone === "error" ? "alert" : "text"}>
    <Icon name={icon} size={18} color={color}/>
    <Text style={[type.bodySmall, { color, flex: 1 }]}>{children}</Text>
  </View>;
}

/** Aviso transitório na base da tela (snackbar), para confirmações como "código copiado". */
export function Snackbar({ message, onHide }: { message: string; onHide: () => void }) {
  const translate = useRef(new Animated.Value(80)).current;
  useEffect(() => {
    Animated.timing(translate, { toValue: 0, duration: 200, easing: Easing.out(Easing.exp), useNativeDriver: true }).start();
    const timer = setTimeout(() => Animated.timing(translate, { toValue: 80, duration: 180, useNativeDriver: true }).start(onHide), 3200);
    return () => clearTimeout(timer);
  }, [translate, onHide]);
  return <Animated.View accessibilityLiveRegion="polite" style={{ position: "absolute", left: space.lg, right: space.lg, bottom: space.xl, transform: [{ translateY: translate }], backgroundColor: colors.ink, borderRadius: radius.sm, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, elevation: 6 }}>
    <Icon name="checkmark-circle" size={18} color={colors.bg}/>
    <Text style={[type.body, { flex: 1, color: colors.bg }]}>{message}</Text>
  </Animated.View>;
}
