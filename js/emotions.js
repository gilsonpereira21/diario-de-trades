export const EMOTIONS = [
  { value: "confiante", label: "Confiante", emoji: "😎" },
  { value: "neutro", label: "Neutro", emoji: "😐" },
  { value: "ansioso", label: "Ansioso", emoji: "😰" },
  { value: "ganancioso", label: "Ganancioso", emoji: "🤑" },
  { value: "vingativo", label: "Vingativo (revenge trade)", emoji: "😡" },
  { value: "medo", label: "Medo / travado", emoji: "😨" },
  { value: "euforico", label: "Eufórico", emoji: "🚀" },
  { value: "cansado", label: "Cansado / disperso", emoji: "🥱" },
];

export function emotionEmoji(value) {
  return EMOTIONS.find((e) => e.value === value)?.emoji || "";
}

export function emotionLabel(value) {
  return EMOTIONS.find((e) => e.value === value)?.label || value || "—";
}
