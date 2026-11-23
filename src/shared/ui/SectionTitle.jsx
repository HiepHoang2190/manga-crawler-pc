/**
 * Canonical section and field title typography used across sidebars, inspectors, forms, and settings.
 * Enforces unified 11px bold uppercase sizing and full semantic contrast across all 12 themes.
 */
export const SECTION_TITLE_CLASS =
  'text-[11px] font-bold uppercase tracking-wider text-on-surface-variant select-none';

export default function SectionTitle({ as: Tag = 'div', className = '', children, ...props }) {
  return (
    <Tag
      className={className ? `${SECTION_TITLE_CLASS} ${className}` : SECTION_TITLE_CLASS}
      {...props}
    >
      {children}
    </Tag>
  );
}
