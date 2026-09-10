import React, { useState, useMemo, useRef, useEffect } from 'react';
import { getMajorCategory, MAJOR_CATEGORY_DEFINITIONS } from './categoryConstants';

export interface CategoryFilterDropdownProps {
  availableCategories: string[];
  selectedCategories: string[];
  onSelectedCategoriesChange: (cats: string[]) => void;
  accentColor?: string;
}

export const CategoryFilterDropdown: React.FC<CategoryFilterDropdownProps> = ({
  availableCategories,
  selectedCategories,
  onSelectedCategoriesChange,
  accentColor = '#10b981',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedMajorCats, setExpandedMajorCats] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleCategoryToggle = (cat: string) => {
    if (selectedCategories.includes(cat)) {
      onSelectedCategoriesChange(selectedCategories.filter((c) => c !== cat));
    } else {
      onSelectedCategoriesChange([...selectedCategories, cat]);
    }
  };

  const handleSelectAll = () => {
    onSelectedCategoriesChange([...availableCategories]);
  };

  const handleClear = () => {
    onSelectedCategoriesChange([]);
  };

  const groupedCategories = useMemo(() => {
    const groups: { name: string; icon: string; subs: string[] }[] = MAJOR_CATEGORY_DEFINITIONS.map((m) => ({
      name: m.name,
      icon: m.icon,
      subs: [],
    }));
    const groupMap = new Map(groups.map((g) => [g.name, g.subs]));

    for (const sub of availableCategories) {
      const major = getMajorCategory(sub);
      const list = groupMap.get(major);
      if (list) {
        list.push(sub);
      } else {
        groupMap.get('その他・雑貨')?.push(sub);
      }
    }

    return groups.filter((g) => g.subs.length > 0);
  }, [availableCategories]);

  const toggleMajorCategory = (group: { name: string; subs: string[] }) => {
    const allSelected = group.subs.every((s) => selectedCategories.includes(s));
    if (allSelected) {
      onSelectedCategoriesChange(selectedCategories.filter((s) => !group.subs.includes(s)));
    } else {
      onSelectedCategoriesChange(Array.from(new Set([...selectedCategories, ...group.subs])));
    }
  };

  const toggleExpandMajorCat = (majorName: string) => {
    setExpandedMajorCats((prev) =>
      prev.includes(majorName) ? prev.filter((m) => m !== majorName) : [...prev, majorName]
    );
  };

  const handleExpandAll = () => {
    setExpandedMajorCats(groupedCategories.map((g) => g.name));
  };

  const handleCollapseAll = () => {
    setExpandedMajorCats([]);
  };

  const isFilterActive = selectedCategories.length < availableCategories.length;

  return (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '6px 10px',
          fontSize: '0.78rem',
          borderRadius: '8px',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          height: '100%',
          boxSizing: 'border-box',
          ...(isFilterActive
            ? {
                background: `rgba(255, 255, 255, 0.08)`,
                border: `1px solid ${accentColor}`,
                color: accentColor,
                boxShadow: `0 0 10px ${accentColor}40`,
                fontWeight: 700,
              }
            : {
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#94a3b8',
                fontWeight: 600,
              }),
        }}
        title="カテゴリ絞り込み"
      >
        <i className="fa-solid fa-tags" style={{ color: isFilterActive ? accentColor : '#94a3b8' }}></i>
        <span>{isFilterActive ? `カテゴリ (${selectedCategories.length})` : 'カテゴリ'}</span>
        <i className={`fa-solid fa-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '0.62rem' }}></i>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            width: '290px',
            background: 'rgba(15, 23, 42, 0.98)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '12px',
            padding: '10px 12px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.75)',
            zIndex: 100,
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '6px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="fa-solid fa-filter" style={{ color: accentColor }}></i> カテゴリ絞り込み
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleSelectAll}
                style={{
                  background: 'none',
                  border: 'none',
                  color: accentColor,
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  padding: 0,
                  fontWeight: 600,
                }}
              >
                全選択
              </button>
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem' }}>|</span>
              <button
                type="button"
                onClick={handleClear}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#f87171',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  padding: 0,
                  fontWeight: 600,
                }}
              >
                クリア
              </button>
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem' }}>|</span>
              <button
                type="button"
                onClick={expandedMajorCats.length === groupedCategories.length ? handleCollapseAll : handleExpandAll}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  padding: 0,
                  fontWeight: 600,
                }}
              >
                {expandedMajorCats.length === groupedCategories.length ? '全折畳' : '全展開'}
              </button>
            </div>
          </div>

          {/* Status Subtitle */}
          <div
            style={{
              fontSize: '0.65rem',
              color: '#94a3b8',
              display: 'flex',
              justifyContent: 'space-between',
              padding: '0 2px 2px 2px',
            }}
          >
            <span>大分類: {groupedCategories.length}区分</span>
            <span style={{ color: selectedCategories.length === availableCategories.length ? accentColor : '#ffb703' }}>
              {selectedCategories.length === availableCategories.length
                ? '全品目 選択中'
                : `${selectedCategories.length} / ${availableCategories.length} 項目選択`}
            </span>
          </div>

          {/* 2-Tier Scroll Container */}
          <div
            style={{
              maxHeight: '280px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              paddingRight: '4px',
            }}
          >
            {groupedCategories.map((group) => {
              const isExpanded = expandedMajorCats.includes(group.name);
              const selectedInGroup = group.subs.filter((s) => selectedCategories.includes(s)).length;
              const allSelected = selectedInGroup === group.subs.length && group.subs.length > 0;
              const someSelected = selectedInGroup > 0 && !allSelected;

              return (
                <div
                  key={group.name}
                  style={{
                    borderRadius: '8px',
                    background: isExpanded
                      ? 'rgba(0, 0, 0, 0.45)'
                      : allSelected || someSelected
                      ? `${accentColor}12`
                      : 'rgba(255, 255, 255, 0.02)',
                    border:
                      '1px solid ' +
                      (allSelected || someSelected ? `${accentColor}48` : 'rgba(255, 255, 255, 0.06)'),
                    overflow: 'hidden',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Tier 1: Major Category Header Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      cursor: 'pointer',
                      background: isExpanded ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                    }}
                    onClick={() => toggleExpandMajorCat(group.name)}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMajorCategory(group);
                      }}
                    >
                      <input
                        type="checkbox"
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        checked={allSelected}
                        onChange={() => toggleMajorCategory(group)}
                        style={{ cursor: 'pointer', accentColor: accentColor, width: '13px', height: '13px' }}
                      />
                      <i
                        className={group.icon}
                        style={{
                          color: allSelected || someSelected ? accentColor : '#64748b',
                          fontSize: '0.74rem',
                          width: '15px',
                          textAlign: 'center',
                        }}
                      ></i>
                      <span
                        style={{
                          fontSize: '0.76rem',
                          fontWeight: allSelected || someSelected ? 700 : 500,
                          color: allSelected || someSelected ? '#ffffff' : '#94a3b8',
                        }}
                      >
                        {group.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.62rem',
                          color: allSelected ? accentColor : someSelected ? '#ffb703' : '#64748b',
                          fontFamily: 'Outfit, sans-serif',
                        }}
                      >
                        ({selectedInGroup}/{group.subs.length})
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpandMajorCat(group.name);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        fontSize: '0.64rem',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title={isExpanded ? '折りたたむ' : '展開する'}
                    >
                      <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
                    </button>
                  </div>

                  {/* Tier 2: Subcategories List (Expanded) */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: '4px 8px 8px 24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                        background: 'rgba(0, 0, 0, 0.25)',
                      }}
                    >
                      {group.subs.map((sub) => {
                        const isChecked = selectedCategories.includes(sub);
                        return (
                          <label
                            key={sub}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCategoryToggle(sub);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '3px 6px',
                              borderRadius: '4px',
                              fontSize: '0.71rem',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              background: isChecked ? `${accentColor}1e` : 'transparent',
                              color: isChecked ? '#ffffff' : '#94a3b8',
                              fontWeight: isChecked ? 600 : 400,
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {sub}
                            </span>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              style={{ cursor: 'pointer', accentColor: accentColor, width: '12px', height: '12px' }}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
