/**
 * BlurPreview — Live, interactive blur preview for Blur Settings.
 *
 * Uses react-native-svg with SVG filter feGaussianBlur for real pixel-level
 * blur applied to specific silhouette regions. Reacts instantly to every
 * blur setting change (enabled, target, method, intensity).
 *
 * Three silhouette figures (Female · Male · Female) are drawn in a
 * social-feed-card layout. Blur is applied to:
 *   • method=faces    → only the head group
 *   • method=fullBody → entire figure (head + body wrapped in one G)
 *
 * target controls which figures receive blur:
 *   • everyone → all three
 *   • females  → figures 1 & 3
 *   • males    → figure 2
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  FeGaussianBlur,
  Filter,
  G,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { useColors } from '@/contexts/ThemeContext';
import type { BlurSettings } from '@/contexts/ProtectionContext';

// ─── Blur intensity → feGaussianBlur stdDeviation ─────────────────────────────
const STD_DEV: Record<string, number> = { light: 2, medium: 7, strong: 16 };

// ─── Figure layout (viewBox 0 0 324 220) ──────────────────────────────────────
const FIGURES: Array<{ id: string; gender: 'female' | 'male'; cx: number }> = [
  { id: 'f0', gender: 'female', cx: 72  },
  { id: 'm0', gender: 'male',   cx: 162 },
  { id: 'f1', gender: 'female', cx: 252 },
];

const VW = 324;
const VH = 220;

// Head
const HEAD_R  = 20;
const HEAD_CY = 50;

// Neck
const NK_TOP = HEAD_CY + HEAD_R;   // 70
const NK_BOT = NK_TOP + 10;        // 80

// Body
const B_TOP = NK_BOT;              // 80
const B_BOT = 180;

// ─── SVG path generators ──────────────────────────────────────────────────────
function femalePath(cx: number): string {
  const t = B_TOP, b = B_BOT;
  // Hourglass: wide shoulders → pinched waist → flared hips
  return (
    `M ${cx - 20} ${t} ` +
    `C ${cx - 28} ${t + 34} ${cx - 14} ${t + 50} ${cx - 14} ${t + 62} ` +
    `C ${cx - 14} ${t + 74} ${cx - 26} ${t + 84} ${cx - 22} ${b} ` +
    `L ${cx + 22} ${b} ` +
    `C ${cx + 26} ${t + 84} ${cx + 14} ${t + 74} ${cx + 14} ${t + 62} ` +
    `C ${cx + 14} ${t + 50} ${cx + 28} ${t + 34} ${cx + 20} ${t} Z`
  );
}

function malePath(cx: number): string {
  const t = B_TOP, b = B_BOT;
  // Trapezoid: broad shoulders → slightly narrower at hips
  return (
    `M ${cx - 25} ${t} ` +
    `C ${cx - 25} ${t + 42} ${cx - 20} ${t + 65} ${cx - 18} ${b} ` +
    `L ${cx + 18} ${b} ` +
    `C ${cx + 20} ${t + 65} ${cx + 25} ${t + 42} ${cx + 25} ${t} Z`
  );
}

// ─── Blur mode per figure ─────────────────────────────────────────────────────
type BlurMode = 'none' | 'face' | 'full';

function resolveMode(
  gender: 'female' | 'male',
  settings: BlurSettings,
): BlurMode {
  if (!settings.enabled) return 'none';
  const applies =
    settings.target === 'everyone' ||
    (settings.target === 'females' && gender === 'female') ||
    (settings.target === 'males'   && gender === 'male');
  if (!applies) return 'none';
  return settings.method === 'fullBody' ? 'full' : 'face';
}

// ─── Individual figure SVG ────────────────────────────────────────────────────
interface FigureProps {
  cx: number;
  gender: 'female' | 'male';
  mode: BlurMode;
  cardColor: string;
  lineColor: string;
}

function FigureSvg({ cx, gender, mode, cardColor, lineColor }: FigureProps) {
  const isFemale = gender === 'female';

  const bodyFill = isFemale ? '#A855F7' : '#3B82F6';
  const skinFill = '#FBBF24';
  const hairFill = isFemale ? '#6D28D9' : '#1D4ED8';

  const neckPath = `M ${cx - 7} ${NK_TOP} L ${cx + 7} ${NK_TOP} L ${cx + 6} ${NK_BOT} L ${cx - 6} ${NK_BOT} Z`;

  const bodyContent = (
    <>
      <Path
        d={isFemale ? femalePath(cx) : malePath(cx)}
        fill={bodyFill}
        opacity={0.88}
      />
      <Path d={neckPath} fill={skinFill} />
    </>
  );

  const headContent = (
    <>
      {/* Hair */}
      {isFemale ? (
        <Ellipse
          cx={cx}
          cy={HEAD_CY - HEAD_R + 2}
          rx={HEAD_R + 5}
          ry={11}
          fill={hairFill}
        />
      ) : (
        <Path
          d={
            `M ${cx - 17} ${HEAD_CY - 12} ` +
            `Q ${cx} ${HEAD_CY - 32} ${cx + 17} ${HEAD_CY - 12} ` +
            `Q ${cx + 13} ${HEAD_CY - 20} ${cx} ${HEAD_CY - 22} ` +
            `Q ${cx - 13} ${HEAD_CY - 20} ${cx - 17} ${HEAD_CY - 12} Z`
          }
          fill={hairFill}
        />
      )}
      {/* Face */}
      <Circle cx={cx} cy={HEAD_CY} r={HEAD_R} fill={skinFill} />
      {/* Eyes */}
      <Circle cx={cx - 6} cy={HEAD_CY - 4} r={2.5} fill="#1E293B" opacity={0.65} />
      <Circle cx={cx + 6} cy={HEAD_CY - 4} r={2.5} fill="#1E293B" opacity={0.65} />
      {/* Smile */}
      <Path
        d={`M ${cx - 7} ${HEAD_CY + 7} Q ${cx} ${HEAD_CY + 13} ${cx + 7} ${HEAD_CY + 7}`}
        fill="none"
        stroke="#1E293B"
        strokeWidth={1.5}
        opacity={0.4}
      />
    </>
  );

  return (
    <>
      {/* Card background */}
      <Rect
        x={cx - 40}
        y={10}
        width={80}
        height={B_BOT + 6}
        rx={10}
        fill={cardColor}
        opacity={0.55}
      />

      {/* Figure — full-body blur wraps everything in one G */}
      {mode === 'full' ? (
        <G filter="url(#blurMain)">
          {bodyContent}
          {headContent}
        </G>
      ) : (
        <>
          {bodyContent}
          {/* Face-only blur OR no blur */}
          {mode === 'face' ? (
            <G filter="url(#blurMain)">{headContent}</G>
          ) : (
            <G>{headContent}</G>
          )}
        </>
      )}

      {/* Caption lines (always readable) */}
      <Rect x={cx - 28} y={B_BOT + 14} width={56} height={3.5} rx={2} fill={lineColor} opacity={0.65} />
      <Rect x={cx - 19} y={B_BOT + 21} width={38} height={3}   rx={2} fill={lineColor} opacity={0.4}  />

      {/* Gender label */}
      <SvgText
        x={cx}
        y={B_BOT + 33}
        textAnchor="middle"
        fill={bodyFill}
        fontSize={8}
        fontWeight="bold"
        opacity={0.75}
      >
        {isFemale ? 'FEMALE' : 'MALE'}
      </SvgText>
    </>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────
export function BlurPreview({ settings }: { settings: BlurSettings }) {
  const colors   = useColors();
  const stdDev   = STD_DEV[settings.intensity] ?? 7;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.muted }]}>
      <Svg
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        height={VH}
        preserveAspectRatio="xMidYMid meet"
      >
        <Defs>
          {/*
            filterUnits="userSpaceOnUse" + full-SVG bounds → blur never
            gets clipped at element edges, even at strong intensity.
          */}
          <Filter
            id="blurMain"
            filterUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={VW}
            height={VH}
          >
            <FeGaussianBlur in="SourceGraphic" stdDeviation={stdDev} />
          </Filter>
        </Defs>

        {/* Render all three figures */}
        {FIGURES.map(({ id, gender, cx }) => (
          <FigureSvg
            key={id}
            cx={cx}
            gender={gender}
            mode={resolveMode(gender, settings)}
            cardColor={colors.card}
            lineColor={colors.border}
          />
        ))}
      </Svg>

      {/* Dim overlay when blur is globally disabled */}
      {!settings.enabled && (
        <View style={[StyleSheet.absoluteFill, styles.disabledOverlay]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:            { borderRadius: 14, overflow: 'hidden' },
  disabledOverlay: { backgroundColor: 'rgba(0,0,0,0.42)', borderRadius: 14 },
});
