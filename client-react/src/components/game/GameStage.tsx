import {
  useEffect, useRef, useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { isMobile } from '@/utils/isMobile';
import { GameStageContext, type GameStageContextValue } from './gameStageContext';

// Design baseline — iPad Pro 12.9" landscape. The whole game shell (header +
// board) is laid out for this size and scaled as a unit to fit any viewport.
export const DESIGN_WIDTH = 1366;
export const DESIGN_HEIGHT = 1024;
// Phone landscape baseline. The phone viewport (iPhone 12 Pro landscape =
// 844×390 CSS) is far wider-aspect than the iPad (≈2.16:1 vs 1.33:1). Using a
// canvas of the full phone aspect ratio (2216×1024, ≈2.16:1) scales to fill
// the full 844 width — but the phone has a screen notch that then OBSCURES
// the board edges. Instead we design on a NARROWER canvas whose aspect ratio
// matches the SAFE area (2232×1170 physical → 744×390 CSS ≈ 1.908:1), so
// when scaled to the phone height it lands at 744 CSS wide and centres with
// ≈50px gap each side — exactly covering the notch zone without any env()
// safe-area detection. Keeping designH=1024 (same as the iPad branch) means
// the downscale factor (≈0.381) is unchanged, so every rem-based size renders
// at the SAME screen px as before — only the horizontal canvas is narrower.
export const MOBILE_DESIGN_WIDTH = 1954;
export const MOBILE_DESIGN_HEIGHT = 1024;
// Viewport width at/above which the action log docks beside the canvas (PC)
// instead of overlaying it (iPad). Below this the right side has no room for
// a native-width log panel, so the log becomes a floating drawer over the
// board's right edge.
export const LOG_BREAKPOINT = 1500;
// Minimum reserved width for the docked log on wide screens; the canvas
// shrinks to leave at least this much room beside it.
const LOG_DOCK_MIN = 300;

function useViewportSize() {
  const [size, setSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  useEffect(() => {
    const read = () => {
      // visualViewport.height accounts for iOS Safari's collapsing address
      // bar; fall back to innerHeight where visualViewport is unavailable.
      const h = window.visualViewport?.height ?? window.innerHeight;
      setSize({ w: window.innerWidth, h });
    };
    read();
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
    window.visualViewport?.addEventListener('resize', read);
    return () => {
      window.removeEventListener('resize', read);
      window.removeEventListener('orientationchange', read);
      window.visualViewport?.removeEventListener('resize', read);
    };
  }, []);
  return size;
}

interface GameStageProps {
  children: ReactNode;
}

export default function GameStage({ children }: GameStageProps) {
  const { t } = useTranslation();
  const { w: vw, h: vh } = useViewportSize();

  const isLandscape = vw >= vh;
  // Phones never dock the log — there's no room beside a width-limited phone
  // canvas, so the log stays an overlay drawer over the board's right edge.
  const isWide = !isMobile && vw >= LOG_BREAKPOINT;

  const designW = isMobile ? MOBILE_DESIGN_WIDTH : DESIGN_WIDTH;
  const designH = isMobile ? MOBILE_DESIGN_HEIGHT : DESIGN_HEIGHT;

  // Dock mode: reserve LOG_DOCK_MIN beside the canvas, so the canvas shrinks
  // to leave room for the native-width log panel. Overlay mode: contain
  // within the full viewport (log floats over the board, no side room).
  const availW = isWide ? vw - LOG_DOCK_MIN : vw;
  const scale = Math.min(availW / designW, vh / designH, 1);

  const canvasW = designW * scale;
  const canvasH = designH * scale;

  const stageClass = isMobile ? 'game-stage game-stage--mobile' : 'game-stage';
  // The portrait "rotate to landscape" block is for PHONES only. A desktop
  // browser (incl. an installed PWA window) may legitimately run in a tall
  // window — e.g. a maximized side-by-side split where the browser pane is
  // taller than wide. Forcing a rotate hint there is wrong: the scaled canvas
  // already adapts to any aspect ratio, so just let it render. (iPad/iOS PWA
  // are also non-phone — isMobile is false — so they keep playing as before.)
  const showRotateHint = isMobile && !isLandscape;

  const logDockRef = useRef<HTMLDivElement | null>(null);
  const logOverlayRef = useRef<HTMLDivElement | null>(null);
  const [ctx, setCtx] = useState<GameStageContextValue>({
    mode: isWide ? 'dock' : 'overlay',
    logDockEl: null,
    logOverlayEl: null,
  });

  // Publish portal targets once they mount. Re-publish when mode flips so
  // ActionLog re-portals to the correct host.
  //
  // `isLandscape` is also a dependency because the portrait early-return
  // (above) unmounts the overlay host div entirely. On a phone isWide never
  // changes (always overlay), so without isLandscape in the deps the effect
  // would NOT re-fire after a portrait→landscape round-trip — ctx.logOverlayEl
  // would keep pointing at the now-detached old host, and ActionLog would
  // portal into a dead node (log disappears after rotating back). Re-running
  // on isLandscape republishes the freshly re-mounted host.
  useEffect(() => {
    setCtx({
      mode: isWide ? 'dock' : 'overlay',
      logDockEl: isWide ? logDockRef.current : null,
      logOverlayEl: !isWide ? logOverlayRef.current : null,
    });
  }, [isWide, isLandscape]);

  // Portrait: block the game with a rotate hint — but ONLY on phones (see
  // showRotateHint). On a tall desktop/PWA window the scaled canvas adapts,
  // so we render the game instead.
  if (showRotateHint) {
    return (
      <div className="game-stage game-stage--portrait">
        <div className="game-stage__rotate-hint">
          <div className="game-stage__rotate-icon">⟳</div>
          <p>{t('ui.game.rotate_to_landscape')}</p>
        </div>
      </div>
    );
  }

  if (isWide) {
    // Dock mode: scaled canvas on the left, native-width log on the right.
    return (
      <div className={`${stageClass} game-stage--dock`}>
        <GameStageContext.Provider value={ctx}>
          <div className="game-stage__canvas-outer" style={{ width: canvasW, height: canvasH }}>
            <div
              className="game-stage__canvas"
              style={{
                width: designW,
                height: designH,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              <div className="game-stage__content">{children}</div>
            </div>
          </div>
          <div className="game-stage__log-dock" ref={logDockRef} style={{ height: canvasH }} />
        </GameStageContext.Provider>
      </div>
    );
  }

  // Overlay mode: canvas contains the board; the log floats over its right
  // edge when expanded.
  return (
    <div className={`${stageClass} game-stage--overlay`}>
      <GameStageContext.Provider value={ctx}>
        <div className="game-stage__canvas-outer" style={{ width: canvasW, height: canvasH }}>
          <div
            className="game-stage__canvas"
            style={{
              width: designW,
              height: designH,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <div className="game-stage__overlay-host" ref={logOverlayRef} />
            <div className="game-stage__content">{children}</div>
          </div>
        </div>
      </GameStageContext.Provider>
    </div>
  );
}
