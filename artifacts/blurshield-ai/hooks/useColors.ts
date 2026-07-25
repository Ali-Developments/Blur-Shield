// Re-exported so any legacy import path still resolves to the theme-aware
// hook. The real implementation lives in ThemeContext, which supports a
// user-controlled light/dark/system override (not just the OS setting).
export { useColors } from '@/contexts/ThemeContext';
