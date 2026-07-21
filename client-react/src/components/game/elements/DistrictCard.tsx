import { useTranslation } from 'react-i18next';
import { DistrictId, districts } from 'citadels-common';
import Emoji from '@/components/common/Emoji';
import { cn } from '@/utils/cn';

const ICON_BY_TYPE: Record<number, string> = {
  1: '👑',
  2: '💠',
  3: '💵',
  4: '⚔️',
  5: '🔮',
};

const COLOR_BY_TYPE: Record<number, string> = {
  1: 'warning',
  2: 'primary',
  3: 'success',
  4: 'danger',
  5: 'purple',
};

// districts.json uses snake_case keys; only dragon_gate/university carry
// `extra_points`. Cast to a permissive shape (same approach as server's
// DistrictCard.ts in Phase 4.0) so the union type doesn't trip TS.
type DistrictData = {
  type: number;
  cost: number;
  extra_points?: number;
  count?: number;
};

interface DistrictCardProps {
  districtId: DistrictId;
  selectable?: boolean;
  disabled?: boolean;
  selected?: boolean;
  small?: boolean;
  onSelect?: (selected: boolean) => void;
}

// Mirrors Vue elements/DistrictCard.vue. getDistrictFromId getter becomes a
// direct districts[] lookup (no store dependency). `update:selected` (v-model)
// becomes onSelect(selected). $te(key) → i18n.exists(key).
export default function DistrictCard({
  districtId,
  selectable = false,
  disabled = false,
  selected = false,
  small = false,
  onSelect,
}: DistrictCardProps) {
  const { t, i18n } = useTranslation();

  const data = districts[districtId as keyof typeof districts] as DistrictData | undefined;
  const cost = data?.cost ?? 0;
  const extraPoints = data?.extra_points ?? 0;
  const icon = (data && ICON_BY_TYPE[data.type]) || '❔';
  const color = (data && COLOR_BY_TYPE[data.type]) || 'white';
  const nameKey = `districts.${districtId}.name`;
  const descKey = `districts.${districtId}.description`;
  const hasDesc = i18n.exists(descKey);

  const handleClick = () => {
    onSelect?.(!selected && selectable);
  };

  return (
    <div
      className={cn('district-card flex-shrink-0 rounded position-relative z-0', {
        'district-card--selectable': !disabled && selectable,
        'district-card--selected': selected,
        'district-card--small': small,
      })}
      onClick={handleClick}
    >
      {data ? (
        <div
          className="card h-100 bg-black text-light shadow-sm overflow-hidden d-flex flex-column p-1"
          title={hasDesc ? t(descKey) : ''}
          data-placement={small ? 'right' : 'top'}
        >
          <div className={cn(
            `flex-fill card-picture card-picture--${districtId} d-flex flex-column`,
            { 'opacity-3': disabled },
          )}>
            <div className={cn({
              'gradient-black-transparent p-1': small,
              'gradient-transparent-black rotated-cost pt-3': !small,
            })}>
              <div className="d-flex">
                {Array.from({ length: cost }, (_, i) => (
                  <Emoji key={`c${i}`} emoji="🪙" />
                ))}
                {Array.from({ length: extraPoints }, (_, i) => (
                  <Emoji key={`e${i}`} emoji="🪙" />
                ))}
              </div>
            </div>

            <div className="flex-fill" />
            {!small && (
              <div className={cn('px-1', { 'pl-3': extraPoints > 0 })}>
                {hasDesc && (
                  <div
                    className="badge badge-light p-1 w-100 text-truncate opacity-4"
                    style={{ left: 0, right: 0, bottom: 0 }}
                  >
                    {t(descKey)}
                  </div>
                )}
              </div>
            )}

            <div className="z-1 d-flex align-items-center gradient-transparent-black bg-black-alpha p-0">
              <span className={cn('badge badge-pill p-1 shadow-sm align-self-end', `bg-${color}`)}>
                <span className="badge badge-pill p-1 bg-dark">
                  <Emoji emoji={icon} />
                </span>
              </span>
              <span className="title flex-fill text-center text-wrap">{t(nameKey)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="card bg-secondary border-dark shadow-sm overflow-hidden h-100 w-100 p-1">
          <div className="card bg-dark h-100 w-100 d-flex justify-content-center align-items-center">
            <span className="h1 m-0 opacity-2"><Emoji emoji="🏛" />️</span>
          </div>
        </div>
      )}
    </div>
  );
}
