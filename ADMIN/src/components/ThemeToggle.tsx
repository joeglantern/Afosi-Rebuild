import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const themes = [
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
    { value: "system" as const, label: "System", icon: Monitor },
  ];

  const currentTheme = themes.find((t) => t.value === theme) || themes[2];
  const Icon = currentTheme.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-lg bg-accent hover:bg-accent/80 flex items-center justify-center transition-colors"
        aria-label="Toggle theme"
        title={`Current theme: ${currentTheme.label}`}
      >
        <Icon size={20} className="text-foreground" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute right-0 mt-2 w-40 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50"
            >
              {themes.map((t) => {
                const ThemeIcon = t.icon;
                return (
                  <button
                    key={t.value}
                    onClick={() => {
                      setTheme(t.value);
                      setIsOpen(false);
                    }}
                    className={`w-full px-4 py-3 flex items-center gap-3 transition-colors ${
                      theme === t.value
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent text-foreground"
                    }`}
                  >
                    <ThemeIcon size={18} />
                    <span className="font-semibold text-sm">{t.label}</span>
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
