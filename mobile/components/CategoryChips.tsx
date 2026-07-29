import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";

import type { CategoryRow } from "../db/types";
import { useLayoutMode } from "../lib/use-layout-mode";
import {
  cashierLayout,
  radius,
  semantic,
  spacing,
  textStyles,
  touchTarget,
} from "../theme";

interface CategoryChipsProps {
  categories: CategoryRow[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/**
 * Sidebar vertikal di tablet (DESIGN.md), deretan chip mendatar di ponsel.
 * Dua bentuk dari satu daftar, karena 23 kategori di layar tegak akan memakan
 * seluruh tinggi layar kalau dipasang menurun.
 *
 * Yang terpilih memakai neutral gelap, bukan biru — biru disimpan khusus untuk
 * satu tombol aksi utama, supaya kategori terpilih tidak terlihat seperti
 * tombol yang harus ditekan.
 */
export default function CategoryChips({
  categories,
  selectedId,
  onSelect,
}: CategoryChipsProps) {
  const mode = useLayoutMode();
  const vertical = mode === "tablet";

  const items = categories.map((category) => {
    const active = category.id === selectedId;
    return (
      <Pressable
        key={category.id}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => onSelect(category.id)}
        style={({ pressed }) => [
          styles.chip,
          vertical ? styles.chipVertical : styles.chipHorizontal,
          active && styles.chipActive,
          pressed && !active && styles.chipPressed,
        ]}>
        <Text
          numberOfLines={vertical ? 2 : 1}
          style={[styles.label, active && styles.labelActive]}>
          {category.name}
        </Text>
      </Pressable>
    );
  });

  if (vertical) {
    return (
      <View style={styles.sidebar}>
        <ScrollView contentContainerStyle={styles.sidebarContent}>
          {items}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      keyboardShouldPersistTaps="handled">
      {items}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: cashierLayout.sidebarWidth,
    borderRightWidth: 1,
    borderRightColor: semantic.border,
    backgroundColor: semantic.surfaceMuted,
  },
  sidebarContent: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  strip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.border,
  },
  chipHorizontal: {
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.lg,
  },
  chipVertical: {
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  chipActive: {
    backgroundColor: semantic.sidebarActive,
    borderColor: semantic.sidebarActive,
  },
  chipPressed: {
    backgroundColor: semantic.surfaceMuted,
  },
  label: {
    ...textStyles.caption,
    color: semantic.textSecondary,
  },
  labelActive: {
    color: semantic.sidebarActiveText,
  },
});
