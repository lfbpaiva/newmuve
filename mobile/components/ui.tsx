import { Ionicons } from "@expo/vector-icons";
import {
  ArrowRight, Banknote, Bell, BellRing, Building2, Calendar, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleAlert, CircleCheck, CircleHelp, CircleMinus, CirclePlay,
  Clock, Copy, CreditCard, Eye, EyeOff, FileText, Flag, Heart, House, Image as ImagemIcone, Info, Lock, LockOpen, LogOut, Mail, MailOpen, Map as MapaIcone, MapPin, Megaphone, MessagesSquare, Music,
  Navigation, Phone, Plus, RefreshCw, Repeat, Save, Search, Send, SendHorizontal, Settings, ShieldCheck, SlidersHorizontal, SquarePen, Star, Store, Tag as TagIcone, Trash2, TrendingUp, User, Users, Volume2, X, Zap,
  type LucideIcon,
} from "lucide-react-native";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts, gradients, motion, radius, space, styles, type } from "../lib/theme";

const icones = {
  "add": Plus,
  "alert": CircleAlert,
  "alert-circle-outline": CircleAlert,
  "arrow-forward": ArrowRight,
  "business-outline": Building2,
  "calendar": Calendar,
  "calendar-outline": Calendar,
  "call-outline": Phone,
  "camera-outline": Camera,
  "card-outline": CreditCard,
  "cash-outline": Banknote,
  "chatbubbles-outline": MessagesSquare,
  "checkmark": Check,
  "checkmark-circle": CircleCheck,
  "checkmark-circle-outline": CircleCheck,
  "chevron-back": ChevronLeft,
  "chevron-down": ChevronDown,
  "chevron-forward": ChevronRight,
  "close": X,
  "copy-outline": Copy,
  "create-outline": SquarePen,
  "document-text-outline": FileText,
  "ellipse": Circle,
  "ellipse-outline": Circle,
  "eye-off-outline": EyeOff,
  "eye-outline": Eye,
  "flag-outline": Flag,
  "flash": Zap,
  "flash-outline": Zap,
  "heart": Heart,
  "heart-outline": Heart,
  "help-circle-outline": CircleHelp,
  "home": House,
  "home-outline": House,
  "image-outline": ImagemIcone,
  "information-circle-outline": Info,
  "location-outline": MapPin,
  "lock-closed-outline": Lock,
  "lock-open-outline": LockOpen,
  "log-out-outline": LogOut,
  "mail-outline": Mail,
  "mail-unread-outline": MailOpen,
  "map-outline": MapaIcone,
  "megaphone-outline": Megaphone,
  "musical-notes-outline": Music,
  "navigate-outline": Navigation,
  "notifications": BellRing,
  "notifications-outline": Bell,
  "options-outline": SlidersHorizontal,
  "paper-plane-outline": SendHorizontal,
  "people-outline": Users,
  "person": User,
  "person-outline": User,
  "play-circle-outline": CirclePlay,
  "pricetag-outline": TagIcone,
  "refresh": RefreshCw,
  "remove-circle-outline": CircleMinus,
  "repeat-outline": Repeat,
  "save-outline": Save,
  "search": Search,
  "send": Send,
  "settings": Settings,
  "settings-outline": Settings,
  "shield-checkmark-outline": ShieldCheck,
  "star": Star,
  "star-outline": Star,
  "storefront-outline": Store,
  "time-outline": Clock,
  "trash-outline": Trash2,
  "trending-up-outline": TrendingUp,
  "volume-high-outline": Volume2,
} satisfies Record<string, LucideIcon>;

const preenchidos = new Set(["heart", "star", "ellipse", "flash", "checkmark-circle", "notifications", "home", "person"]);
const marcas = { "logo-google": "logo-google", "logo-whatsapp": "logo-whatsapp" } as const;

export type IconName = keyof typeof icones | keyof typeof marcas;

export function Icon({ name, size = 20, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  if (name in marcas) return <Ionicons name={marcas[name as keyof typeof marcas]} size={size} color={color}/>;
  const Desenho = icones[name as keyof typeof icones];
  return <Desenho size={size} color={color} strokeWidth={1.75} fill={preenchidos.has(name) ? color : "none"}/>;
}

const nativeDriver = Platform.OS !== "web";
const ScrollYContext = createContext<Animated.Value | null>(null);

export const useScrollY = () => useContext(ScrollYContext);

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => active && setReduce(value), () => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

const TITULO_SOME_EM = 96;

export function TituloGrande({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  const scrollY = useScrollY();
  const reduce = useReduceMotion();
  const animado = scrollY && !reduce ? {
    opacity: scrollY.interpolate({ inputRange: [0, TITULO_SOME_EM * 0.7], outputRange: [1, 0], extrapolate: "clamp" }),
    transform: [
      { translateY: scrollY.interpolate({ inputRange: [-120, 0], outputRange: [-40, 0], extrapolate: "clamp" }) },
      { scale: scrollY.interpolate({ inputRange: [-120, 0, TITULO_SOME_EM], outputRange: [1.15, 1, 0.92], extrapolate: "clamp" }) },
    ],
  } : null;
  return <Animated.View style={[{ gap: space.xs, transformOrigin: "left bottom" }, animado]}>
    <Text style={[type.display, { fontSize: 32, lineHeight: 36 }]} accessibilityRole="header">{titulo}</Text>
    {subtitulo ? <Text style={type.bodySmall} numberOfLines={2}>{subtitulo}</Text> : null}
  </Animated.View>;
}

export function TituloCompacto({ titulo }: { titulo: string }) {
  const scrollY = useScrollY();
  if (!scrollY) return null;
  const visivel = scrollY.interpolate({ inputRange: [TITULO_SOME_EM - 24, TITULO_SOME_EM + 16], outputRange: [0, 1], extrapolate: "clamp" });
  return <Animated.Text numberOfLines={1} style={[type.title, { flexShrink: 1, opacity: visivel, transform: [{ translateY: visivel.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{titulo}</Animated.Text>;
}

export function Screen({ children, scroll = true, padded = true, onRefresh, cabecalho, topo }: { children: ReactNode; scroll?: boolean; padded?: boolean; onRefresh?: () => void; cabecalho?: ReactNode; topo?: ReactNode }) {
  const content = padded ? styles.content : { paddingBottom: 110, gap: space.xl };
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: nativeDriver }), [scrollY]);
  const refreshControl = onRefresh ? <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.accentText} colors={[colors.accent]}/> : undefined;
  return <SafeAreaView style={styles.screen} edges={["left", "right"]}>
    {scroll
      ? <ScrollYContext.Provider value={scrollY}>
        {topo}
        <Animated.ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl} onScroll={onScroll} scrollEventThrottle={16}>{children}</Animated.ScrollView>
        {cabecalho}
      </ScrollYContext.Provider>
      : <View style={[content, { flex: 1 }]}>{children}</View>}
  </SafeAreaView>;
}

const REVEAL_DISTANCIA = 28;
const REVEAL_ATRASO_MS = 70;
const EMPILHAR_DESLOCAMENTO = 0.55;

export function Reveal({ children, index = 0, empilhar = false }: { children: ReactNode; index?: number; empilhar?: boolean }) {
  const scrollY = useScrollY();
  const reduce = useReduceMotion();
  const { height } = useWindowDimensions();
  const entrada = useRef(new Animated.Value(0)).current;
  const [caixa, setCaixa] = useState<{ y: number; altura: number } | null>(null);

  useEffect(() => {
    if (reduce) return;
    Animated.timing(entrada, { toValue: 1, duration: 520, delay: Math.min(index, 6) * REVEAL_ATRASO_MS, easing: Easing.out(Easing.exp), useNativeDriver: nativeDriver }).start();
  }, [entrada, index, reduce]);

  if (reduce) return <View>{children}</View>;
  const aoRolar = scrollY && caixa && caixa.y > height
    ? scrollY.interpolate({ inputRange: [caixa.y - height, caixa.y - height + 140], outputRange: [0, 1], extrapolate: "clamp" })
    : null;
  const pilha = empilhar && scrollY && caixa ? scrollY.interpolate({ inputRange: [caixa.y, caixa.y + caixa.altura], outputRange: [0, 1], extrapolate: "clamp" }) : null;
  const progresso = Animated.multiply(entrada, aoRolar ?? 1);
  const entradaY = progresso.interpolate({ inputRange: [0, 1], outputRange: [REVEAL_DISTANCIA, 0] });
  return <Animated.View
    onLayout={(event) => {
      const { y, height: altura } = event.nativeEvent.layout;
      setCaixa((atual) => atual ?? { y, altura });
    }}
    style={{
      opacity: pilha ? Animated.multiply(progresso, pilha.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] })) : progresso,
      transform: pilha && caixa
        ? [{ translateY: Animated.add(entradaY, pilha.interpolate({ inputRange: [0, 1], outputRange: [0, caixa.altura * EMPILHAR_DESLOCAMENTO] })) }, { scale: pilha.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] }) }]
        : [{ translateY: entradaY }],
    }}
  >{children}</Animated.View>;
}

export function CabecalhoFixo({ aparecerEm, children }: { aparecerEm: number; children: ReactNode }) {
  const scrollY = useScrollY();
  if (!scrollY) return null;
  const deslocamento = scrollY.interpolate({ inputRange: [aparecerEm - 64, aparecerEm], outputRange: [-64, 0], extrapolate: "clamp" });
  return <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, transform: [{ translateY: deslocamento }], backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: space.lg, paddingVertical: space.md }}>
    {children}
  </Animated.View>;
}

export function Parallax({ height, children }: { height: number; children: ReactNode }) {
  const scrollY = useScrollY();
  const reduce = useReduceMotion();
  const deslocamento = scrollY && !reduce ? {
    transform: [
      { translateY: scrollY.interpolate({ inputRange: [-height, 0, height], outputRange: [-height / 2, 0, height * 0.45], extrapolateRight: "clamp" }) },
      { scale: scrollY.interpolate({ inputRange: [-height, 0], outputRange: [2, 1], extrapolate: "clamp" }) },
    ],
  } : null;
  return <View style={{ height, overflow: "hidden", backgroundColor: colors.surface2 }}>
    <Animated.View style={[{ width: "100%", height: "100%" }, deslocamento]}>{children}</Animated.View>
  </View>;
}

export function Heading({ title, subtitle, size = "headline" }: { title: string; subtitle?: string; size?: "display" | "headline" }) {
  return <View style={{ gap: space.xs }}>
    <Text style={type[size]} accessibilityRole="header">{title}</Text>
    {subtitle ? <Text style={type.bodySmall}>{subtitle}</Text> : null}
  </View>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <View style={styles.section}>
    <View style={[styles.between, { minHeight: 32 }]}><Text style={type.title} accessibilityRole="header">{title}</Text>{action}</View>
    {children}
  </View>;
}

type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "danger";

const buttonColors: Record<ButtonVariant, { bg: string; fg: string; border: string; hover: string; pressed: string }> = {
  filled: { bg: colors.accent, fg: colors.onAccent, border: "rgba(255,255,255,0.12)", hover: "#8758ea", pressed: colors.accentPressed },
  tonal: { bg: colors.surface3, fg: colors.ink, border: colors.hairline, hover: "#272732", pressed: colors.surface2 },
  outlined: { bg: "transparent", fg: colors.ink, border: colors.line, hover: colors.surface, pressed: colors.surface2 },
  text: { bg: "transparent", fg: colors.accentText, border: "transparent", hover: colors.surface, pressed: colors.surface2 },
  danger: { bg: colors.errorBg, fg: colors.error, border: "rgba(255,122,135,0.22)", hover: "rgba(255,122,135,0.16)", pressed: "rgba(255,122,135,0.22)" },
};

type EstadoDoToque = { pressed: boolean; hovered?: boolean; focused?: boolean };

export function usePressao() {
  const escala = useRef(new Animated.Value(1)).current;
  const animar = (valor: number) => Animated.spring(escala, { toValue: valor, speed: 40, bounciness: 6, useNativeDriver: nativeDriver }).start();
  return { escala, aoPressionar: () => animar(0.97), aoSoltar: () => animar(1) };
}

export function Button({ title, onPress, variant = "filled", icon, disabled, loading, block = true }: {
  title: string; onPress: () => void; variant?: ButtonVariant; icon?: IconName; disabled?: boolean; loading?: boolean; block?: boolean;
}) {
  const c = buttonColors[variant];
  const off = disabled || loading;
  const { escala, aoPressionar, aoSoltar } = usePressao();
  return <Animated.View style={[{ transform: [{ scale: escala }] }, block ? null : { alignSelf: "flex-start" }]}>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={onPress}
      onPressIn={aoPressionar}
      onPressOut={aoSoltar}
      style={(estado) => {
        const { pressed, hovered, focused } = estado as EstadoDoToque;
        return { minHeight: 50, borderRadius: radius.sm, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: pressed ? c.pressed : hovered ? c.hover : c.bg, borderWidth: 1, borderColor: focused ? colors.accentBright : c.border, opacity: off ? 0.45 : 1 };
      }}
    >
      {loading ? <ActivityIndicator color={c.fg}/> : <>
        <Text style={[type.label, { fontFamily: fonts.semibold, color: c.fg }]}>{title}</Text>
        {icon && <Icon name={icon} size={17} color={c.fg}/>}
      </>}
    </Pressable>
  </Animated.View>;
}

export function Fab({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  const { escala, aoPressionar, aoSoltar } = usePressao();
  return <Animated.View style={{ position: "absolute", right: space.lg, bottom: space.xl, transform: [{ scale: escala }] }}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={aoPressionar}
      onPressOut={aoSoltar}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: pressed ? colors.accentPressed : colors.accent, borderRadius: radius.pill, paddingHorizontal: 20, height: 52, elevation: 8, shadowColor: colors.accent, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } })}
    >
      <Icon name={icon} size={18} color={colors.onAccent}/>
      <Text style={[type.label, { fontFamily: fonts.semibold, color: colors.onAccent }]}>{label}</Text>
    </Pressable>
  </Animated.View>;
}

export function PontoAoVivo({ cor = colors.accentBright }: { cor?: string }) {
  const reduce = useReduceMotion();
  const pulso = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.timing(pulso, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: nativeDriver }));
    loop.start();
    return () => loop.stop();
  }, [pulso, reduce]);
  return <View style={{ width: 10, height: 10, alignItems: "center", justifyContent: "center" }}>
    <Animated.View style={{ position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: cor, opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }}/>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cor }}/>
  </View>;
}

export function Surface({ children, destaque = false, style }: { children: ReactNode; destaque?: boolean; style?: ViewStyle }) {
  return <View style={[{ borderRadius: radius.lg, borderWidth: 1, borderColor: destaque ? "rgba(139,107,255,0.28)" : colors.hairline, overflow: "hidden", backgroundColor: colors.surface }, style]}>
    <LinearGradient pointerEvents="none" colors={destaque ? gradients.brilho : gradients.superficie} style={{ position: "absolute", left: 0, right: 0, top: 0, height: destaque ? 160 : 120 }}/>
    <View style={{ padding: space.lg, gap: space.md }}>{children}</View>
  </View>;
}

export function NumeroAnimado({ valor, formatar = String, style }: { valor: number; formatar?: (valor: number) => string; style?: TextStyle | TextStyle[] }) {
  const reduce = useReduceMotion();
  const [atual, setAtual] = useState(valor);
  const inicio = useRef(0);
  useEffect(() => {
    if (reduce) {
      setAtual(valor);
      return;
    }
    const de = inicio.current;
    const comeco = Date.now();
    let quadro = 0;
    const passo = () => {
      const t = Math.min(1, (Date.now() - comeco) / 700);
      setAtual(de + (valor - de) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) quadro = requestAnimationFrame(passo);
      else inicio.current = valor;
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor, reduce]);
  return <Text style={style} accessibilityLabel={formatar(valor)}>{formatar(Math.round(atual))}</Text>;
}

export function Field({ label, error, hint, trailing, style, ...input }: TextInputProps & { label: string; error?: string; hint?: string; trailing?: ReactNode }) {
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: 4 }}>
    <Text style={[type.labelSmall, focused ? { color: colors.accentText } : null]}>{label}</Text>
    <View>
      <TextInput
        placeholderTextColor={colors.ink3}
        selectionColor={colors.accentText}
        cursorColor={colors.accentText}
        accessibilityLabel={label}
        {...input}
        onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
        style={[styles.input, focused ? styles.inputFocused : null, error ? styles.inputError : null, input.multiline ? { minHeight: 96, textAlignVertical: "top" } : null, input.editable === false ? { opacity: 0.55 } : null, trailing ? { paddingRight: 48 } : null, style]}
      />
      {trailing ? <View style={{ position: "absolute", right: 0, top: 0, width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>{trailing}</View> : null}
    </View>
    {hint && !error ? <Text style={[type.bodySmall, { marginTop: 4 }]}>{hint}</Text> : null}
    {error ? <Text style={[type.bodySmall, { color: colors.error, marginTop: 4 }]}>{error}</Text> : null}
  </View>;
}

export function PasswordField({ label = "Senha", value, onChangeText }: { label?: string; value: string; onChangeText: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return <Field
    label={label}
    value={value}
    onChangeText={onChangeText}
    secureTextEntry={!visible}
    placeholder="Mínimo de 6 caracteres"
    autoCapitalize="none"
    trailing={<Pressable onPress={() => setVisible(!visible)} accessibilityRole="button" accessibilityLabel={visible ? "Ocultar senha" : "Mostrar senha"} hitSlop={8} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
      <Icon name={visible ? "eye-off-outline" : "eye-outline"} color={colors.ink2}/>
    </Pressable>}
  />;
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={[styles.row, { minHeight: 48, gap: 12 }]}>
    <View style={{ width: 22, height: 22, borderRadius: radius.xs, borderWidth: 1.5, borderColor: checked ? colors.accent : colors.line, backgroundColor: checked ? colors.accent : colors.surface, alignItems: "center", justifyContent: "center" }}>
      {checked && <Icon name="checkmark" size={15} color={colors.onAccent}/>}
    </View>
    <Text style={[type.body, { flex: 1 }]}>{label}</Text>
  </Pressable>;
}

export interface Option { value: string; label: string }

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
        {searchable && <TextInput value={query} onChangeText={setQuery} placeholder="Buscar..." placeholderTextColor={colors.ink3} selectionColor={colors.accentText} autoFocus style={[styles.input, { marginHorizontal: space.lg, marginBottom: space.sm }]}/>}
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.value}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <Pressable onPress={() => { onChange(item.value); setOpen(false); }} android_ripple={{ color: colors.surface3 }} style={({ pressed }) => [styles.between, { minHeight: 52, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: pressed ? colors.surface2 : "transparent" }]}>
            <Text style={[type.body, item.value === value ? { color: colors.accentText } : null]}>{item.label}</Text>
            {item.value === value && <Icon name="checkmark" color={colors.accentText}/>}
          </Pressable>}
          ListEmptyComponent={<Text style={[type.bodySmall, { padding: space.lg }]}>Nenhuma opção encontrada.</Text>}
        />
      </SafeAreaView>
    </Modal>
  </View>;
}

export function Chips({ options, selected, onToggle, labels, scroll }: { options: readonly string[]; selected: string[]; onToggle: (value: string) => void; labels?: (value: string) => string; scroll?: boolean }) {
  const items = options.map((option) => {
    const on = selected.includes(option);
    return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onToggle(option)} style={({ pressed }) => ({ minHeight: 40, borderRadius: radius.pill, paddingHorizontal: 16, justifyContent: "center", backgroundColor: on ? colors.accentSoft : pressed ? colors.surface2 : colors.surface, borderWidth: 1, borderColor: on ? "rgba(139,107,255,0.45)" : colors.hairline })}>
      <Text style={[type.label, { fontSize: 13, color: on ? colors.accentText : colors.ink2 }]}>{labels ? labels(option) : option}</Text>
    </Pressable>;
  });
  if (scroll) return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: space.lg }}>{items}</ScrollView>;
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{items}</View>;
}

export function ListItem({ icon, title, subtitle, onPress, tone = "default", trailing = "chevron-forward" }: { icon: IconName; title: string; subtitle?: string; onPress: () => void; tone?: "default" | "danger"; trailing?: IconName | null }) {
  const color = tone === "danger" ? colors.error : colors.ink;
  return <Pressable accessibilityRole="button" onPress={onPress} android_ripple={{ color: colors.surface3 }} style={({ pressed }) => [styles.row, { minHeight: 64, paddingVertical: space.md, paddingHorizontal: space.sm, marginHorizontal: -space.sm, gap: 14, borderRadius: radius.sm, backgroundColor: pressed ? colors.surface : "transparent" }]}>
    <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: tone === "danger" ? colors.errorBg : colors.surface2, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={18} color={tone === "danger" ? colors.error : colors.ink2}/>
    </View>
    <View style={{ flex: 1 }}><Text style={[type.titleSmall, { color }]}>{title}</Text>{subtitle ? <Text style={type.bodySmall} numberOfLines={1}>{subtitle}</Text> : null}</View>
    {trailing && <Icon name={trailing} size={18} color={colors.ink3}/>}
  </Pressable>;
}

export function Pill({ text, tone = "primary" }: { text: string; tone?: "primary" | "success" | "muted" | "accent" | "warning" }) {
  const palette = {
    primary: { bg: colors.surface3, fg: colors.ink, dot: colors.ink2 },
    success: { bg: colors.successBg, fg: colors.success, dot: colors.success },
    muted: { bg: colors.surface2, fg: colors.ink2, dot: colors.ink3 },
    accent: { bg: colors.accentSoft, fg: colors.accentText, dot: colors.accentBright },
    warning: { bg: colors.warningBg, fg: colors.warning, dot: colors.warning },
  }[tone];
  return <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.dot }}/>
    <Text style={[type.label, { fontSize: 12, lineHeight: 16, color: palette.fg }]}>{text}</Text>
  </View>;
}

export function Tag({ text, onImage }: { text: string; onImage?: boolean }) {
  return <View style={{ backgroundColor: onImage ? "rgba(9,9,13,0.72)" : colors.surface2, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.hairline }}><Text style={[type.label, { fontSize: 12, lineHeight: 16, color: onImage ? colors.ink : colors.ink2 }]}>{text}</Text></View>;
}

export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: number | `${number}%`; style?: ViewStyle }) {
  const brilho = useRef(new Animated.Value(0)).current;
  const reduce = useReduceMotion();
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.timing(brilho, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: nativeDriver }));
    loop.start();
    return () => loop.stop();
  }, [brilho, reduce]);
  return <View style={[{ height, width, borderRadius: radius.xs, backgroundColor: colors.surface2, overflow: "hidden" }, style]}>
    {!reduce && <Animated.View style={{ position: "absolute", top: 0, bottom: 0, width: 160, transform: [{ translateX: brilho.interpolate({ inputRange: [0, 1], outputRange: [-160, 420] }) }] }}>
      <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.06)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }}/>
    </Animated.View>}
  </View>;
}

export function Loading({ label = "Carregando...", cards = 2 }: { label?: string; cards?: number }) {
  return <View style={{ gap: space.lg }} accessibilityRole="progressbar" accessibilityLabel={label}>
    {Array.from({ length: cards }, (_, i) => <View key={i} style={[styles.card, { gap: space.md }]}>
      <Skeleton height={160} style={{ borderRadius: radius.sm }}/>
      <Skeleton height={20} width="70%"/>
      <Skeleton height={14} width="45%"/>
    </View>)}
  </View>;
}

function Simbolo({ icon, tone }: { icon: IconName; tone: "neutral" | "error" }) {
  return <View style={{ width: 52, height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: tone === "error" ? colors.errorBg : colors.accentSoft, borderWidth: 1, borderColor: colors.hairline }}>
    <Icon name={icon} size={24} color={tone === "error" ? colors.error : colors.accentText}/>
  </View>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <View style={[styles.empty, { alignItems: "center" }]} accessibilityRole="alert">
    <Simbolo icon="alert" tone="error"/>
    <Text style={[type.title, { textAlign: "center" }]}>Algo deu errado</Text>
    <Text style={[type.bodySmall, { textAlign: "center" }]}>{message}</Text>
    <Button title="Tentar novamente" variant="tonal" icon="refresh" onPress={onRetry} block={false}/>
  </View>;
}

export function EmptyState({ title, children, action, icon = "calendar-outline" }: { title: string; children?: ReactNode; action?: ReactNode; icon?: IconName }) {
  return <View style={[styles.empty, { alignItems: "center", paddingHorizontal: space.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.line }]}>
    <Simbolo icon={icon} tone="neutral"/>
    <Text style={[type.title, { textAlign: "center" }]}>{title}</Text>
    {children}
    {action}
  </View>;
}

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
  const icone = tone === "error" ? colors.error : tone === "success" ? colors.success : colors.accentText;
  const icon: IconName = tone === "error" ? "alert-circle-outline" : tone === "success" ? "checkmark-circle-outline" : "information-circle-outline";
  return <View style={[box, styles.row, { alignItems: "flex-start", gap: 10, borderWidth: 1, borderColor: colors.hairline }]} accessibilityRole={tone === "error" ? "alert" : "text"}>
    <Icon name={icon} size={18} color={icone}/>
    <Text style={[type.bodySmall, { color, flex: 1 }]}>{children}</Text>
  </View>;
}

export function Snackbar({ message, onHide }: { message: string; onHide: () => void }) {
  const entrada = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entrada, { toValue: 1, duration: motion.base, easing: Easing.out(Easing.exp), useNativeDriver: nativeDriver }).start();
    const timer = setTimeout(() => Animated.timing(entrada, { toValue: 0, duration: motion.rapido, useNativeDriver: nativeDriver }).start(onHide), 3200);
    return () => clearTimeout(timer);
  }, [entrada, onHide]);
  return <Animated.View accessibilityLiveRegion="polite" style={{ position: "absolute", left: space.lg, right: space.lg, bottom: space.xl, opacity: entrada, transform: [{ translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { scale: entrada.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }], backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, elevation: 8, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } }}>
    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.successBg, alignItems: "center", justifyContent: "center" }}><Icon name="checkmark" size={15} color={colors.success}/></View>
    <Text style={[type.body, { flex: 1 }]}>{message}</Text>
  </Animated.View>;
}
