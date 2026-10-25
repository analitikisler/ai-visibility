import { Monitor, Moon, Sun } from 'lucide-react';
import { IconButton, Menu } from '@/components/ui';
import { copy } from '@/content/copy';
import { useTheme, type ThemePref } from '@/lib/theme';

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

/** Light / dark / system menu; the choice persists in localStorage. */
export function ThemeToggle() {
  const { pref, resolved, setPref } = useTheme();
  const t = copy.app.theme;
  const options: ThemePref[] = ['light', 'dark', 'system'];
  return (
    <Menu
      label={t.label}
      align="end"
      className="min-w-36"
      items={options.map((o) => ({ key: o, label: t[o], icon: ICONS[o], selected: pref === o, onSelect: () => setPref(o) }))}
      trigger={(props) => <IconButton {...props} icon={resolved === 'dark' ? Moon : Sun} label={`${t.label}: ${t[pref]}`} />}
    />
  );
}
