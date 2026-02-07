import { useState, useRef, useEffect } from "react";

const COLOR_GRID = [
  ["#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff"],
  ["#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff"],
  ["#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc"],
  ["#dd7e6b", "#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#a4c2f4", "#9fc5e8", "#b4a7d6", "#d5a6bd"],
  ["#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0"],
  ["#a61c00", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6", "#674ea7", "#a64d79"],
  ["#85200c", "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#1155cc", "#0b5394", "#351c75", "#741b47"],
];

interface ColorPickerProps {
  activeColor?: string;
  onSelect: (color: string) => void;
  onRemove: () => void;
  children: React.ReactNode;
  title: string;
}

function ColorPicker({ activeColor, onSelect, onRemove, children, title }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="color-picker" ref={ref}>
      <button
        type="button"
        className="toolbar-btn"
        onClick={() => setOpen(!open)}
        title={title}
      >
        {children}
      </button>
      {open && (
        <div className="color-picker-dropdown">
          <button
            type="button"
            className="color-picker-none"
            onClick={() => {
              onRemove();
              setOpen(false);
            }}
          >
            None
          </button>
          <div className="color-grid">
            {COLOR_GRID.flat().map((color) => (
              <button
                key={color}
                type="button"
                className={`color-swatch${activeColor?.toLowerCase() === color.toLowerCase() ? " is-active" : ""}`}
                style={{ backgroundColor: color }}
                onClick={() => {
                  onSelect(color);
                  setOpen(false);
                }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ColorPicker;
