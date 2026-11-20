import React, { useMemo } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { SearchableSelect } from '../../../shared';

export function extractConnectorHost(domain) {
  if (!domain) return '';
  try {
    const raw = String(domain).trim();
    const u = raw.startsWith('http') ? new URL(raw) : new URL(`https://${raw}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return String(domain).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || '';
  }
}

/**
 * Shared Source Selector control across all Explore subtabs.
 * Standardizes trigger size to "md" (h-10 rounded-xl) matching Home sidebar standard.
 *
 * @param {object} props
 * @param {'picker'|'filter'} [props.mode='picker'] - 'picker' for single required site (Latest, Bulk), 'filter' for optional scope (Followed).
 * @param {Array} [props.connectors] - Raw connectors list if building options automatically.
 * @param {Array} [props.options] - Pre-built options array (e.g. from siteOptions or selectOptions).
 * @param {string} props.value - Currently selected source site ID.
 * @param {(nextId: string) => void} props.onChange - Selection change callback.
 * @param {boolean} [props.disabled=false] - Whether dropdown is disabled.
 * @param {string} [props.size='md'] - SearchableSelect size variant ('md' or 'sm').
 * @param {string|null} [props.label] - Custom label override (defaults to t('explore.sourcesLabel') -> "NGUỒN").
 * @param {string|null} [props.placeholder] - Custom placeholder string.
 * @param {boolean} [props.showPlaceholderOption=false]
 * @param {string} [props.className='w-full min-w-0']
 * @param {boolean} [props.filterSupportedOnly=true]
 * @param {'list'|'mangaList'|'any'} [props.capability='list']
 */
export default function ExploreSourceSelect({
  mode = 'picker',
  connectors = [],
  options = null,
  value = '',
  onChange,
  disabled = false,
  size = 'md',
  label = null,
  placeholder = null,
  showPlaceholderOption = false,
  className = 'w-full min-w-0',
  filterSupportedOnly = true,
  capability = 'list',
}) {
  const { t } = useI18n();

  const computedOptions = useMemo(() => {
    if (Array.isArray(options)) return options;

    if (mode === 'picker') {
      const list = Array.isArray(connectors) ? connectors : [];
      const filtered = filterSupportedOnly
        ? list.filter((c) => {
            if (!c?.id) return false;
            if (capability === 'list') return Boolean(c.hasListing || c.list);
            if (capability === 'mangaList') return Boolean(c.hasCatalog || c.mangaList);
            return true;
          })
        : list;

      return filtered.map((c) => {
        const host = extractConnectorHost(c.domain);
        const name = c.label || c.id;
        return {
          value: c.id,
          label: host ? `${name} (${host})` : String(name),
          icon: c.icon,
        };
      });
    }

    return [];
  }, [options, mode, connectors, filterSupportedOnly, capability]);

  const displayLabel = label ?? t('explore.sourcesLabel');
  const displayPlaceholder =
    placeholder ??
    (mode === 'filter'
      ? t('followedManga.filter.allSources')
      : t('sidebar.siteSelectPlaceholder'));

  return (
    <div className="space-y-1.5" data-testid="explore-source-select">
      {displayLabel ? (
        <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70 mb-1.5 px-0.5 select-none">
          {displayLabel}
        </div>
      ) : null}
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={computedOptions}
        placeholder={displayPlaceholder}
        showPlaceholderOption={showPlaceholderOption}
        size={size}
        className={className}
        disabled={disabled}
      />
    </div>
  );
}
