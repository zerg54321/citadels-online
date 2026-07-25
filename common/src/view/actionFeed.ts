// Renders a structured action-feed entry into a localized string.
//
// The server pushes feed entries as { kind, params } (no baked-in text) so
// every client can render the log in its own language. This pure function
// maps each `kind` to an i18n key under `ui.game.feed.*`, resolves character
// and district names via the existing `characters.{id}.name` /
// `districts.{id}.name` keys, and interpolates the rest.
//
// `t` is intentionally typed as a generic function (not react-i18next's
// TFunction) so common stays framework-agnostic; the client passes its i18n
// `t` (single-brace interpolation: {var}, per i18n/index.ts).

export type ActionFeedLine = {
  /** semantic id selecting the i18n template, e.g. 'kill', 'build', 'round' */
  kind: string;
  /** interpolation params; role/district hold ids resolved via name keys */
  params?: Record<string, string | number>;
  /** round number, only for kind === 'round' */
  round?: number;
  /** optional fallback string (debug/legacy); shown only if kind is unknown */
  text?: string;
};

export type ActionFeedTFunc = (key: string, params?: Record<string, unknown>) => string;

function roleName(t: ActionFeedTFunc, id: string | number | undefined): string {
  if (id === undefined) return '';
  return t(`characters.${id}.name`);
}

function districtName(t: ActionFeedTFunc, id: string | number | undefined): string {
  if (id === undefined) return '';
  return t(`districts.${id}.name`);
}

export function formatActionFeedLine(line: ActionFeedLine, t: ActionFeedTFunc): string {
  if (line.kind === 'round') {
    return t('ui.game.round_start', { n: line.round ?? '' });
  }
  const p = line.params ?? {};
  switch (line.kind) {
    case 'kill':
      return t('ui.game.feed.kill', { role: roleName(t, p.role) });
    case 'rob':
      return t('ui.game.feed.rob', { role: roleName(t, p.role) });
    case 'rob_move':
      return t('ui.game.feed.rob_move', {
        player: p.player, role: roleName(t, p.role), amount: p.amount, thief: p.thief,
      });
    case 'rob_move_empty':
      return t('ui.game.feed.rob_move_empty', { player: p.player, role: roleName(t, p.role) });
    case 'earn':
      return t('ui.game.feed.earn', { player: p.player, amount: p.amount });
    case 'build':
      return t('ui.game.feed.build', { player: p.player, district: districtName(t, p.district) });
    case 'destroy':
      return t('ui.game.feed.destroy', {
        player: p.player, victim: p.victim, district: districtName(t, p.district),
      });
    case 'magician_exchange':
      return t('ui.game.feed.magician_exchange', { player: p.player, target: p.target });
    case 'magician_discard':
      return t('ui.game.feed.magician_discard', { player: p.player, count: p.count, drew: p.drew });
    case 'call':
      return t('ui.game.feed.call', { player: p.player, role: roleName(t, p.role) });
    case 'call_killed':
      return t('ui.game.feed.call_killed', { player: p.player, role: roleName(t, p.role) });
    case 'call_empty':
      return t('ui.game.feed.call_empty', { role: roleName(t, p.role) });
    default:
      return line.text ?? '';
  }
}
