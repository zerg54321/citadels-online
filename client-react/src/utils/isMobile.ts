// Mobile (phone) detection. Used by GameStage to switch to the phone-specific
// 844×390 design canvas instead of the iPad 1366×1024 one.
//
// Keyed off the UA "Mobile" token only: every phone UA (iPhone, Android,
// Windows Phone) reports "Mobile", while iPads never do — iPadOS ≥13 reports a
// Macintosh UA, older iPads report "iPad". So "Mobile" cleanly separates phones
// from iPads/desktops without need for tablet heuristics.

function detectMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mobile/i.test(navigator.userAgent || '');
}

export const isMobile = detectMobile();
