import React, { useRef, useCallback, useState } from 'react';
import './ColorSlider.css';

interface ColorSliderProps {
    colors: string[];
    color: string;
    onChange: (newColor: string) => void;
}

const ColorSlider: React.FC<ColorSliderProps> = ({ colors, color, onChange }) => {
    const sliderRef = useRef<HTMLDivElement>(null);
    const [isExpanded, setIsExpanded] = useState(false);

    const handleInteraction = useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!sliderRef.current) return;

        const rect = sliderRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const swatchWidth = rect.width / colors.length;
        const index = Math.floor(x / swatchWidth);
        const newColorIndex = Math.max(0, Math.min(colors.length - 1, index));
        
        onChange(colors[newColorIndex]);

    }, [colors, onChange]);

    const handleMouseUp = useCallback(() => {
        document.removeEventListener('mousemove', handleInteraction);
        document.removeEventListener('mouseup', handleMouseUp);
    }, [handleInteraction]);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        handleInteraction(e);
        document.addEventListener('mousemove', handleInteraction);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const selectedIndex = colors.findIndex(c => c === color);
    const handlePositionPercent = selectedIndex >= 0 ? ((selectedIndex + 0.5) / colors.length) * 100 : 50;

    return (
        <div 
            className={`color-slider-wrapper ${isExpanded ? 'expanded' : ''}`}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
        >
            <div className="color-swatch-display" style={{ backgroundColor: color }} />
            <div
                ref={sliderRef}
                className="slider-container"
                onMouseDown={handleMouseDown}
            >
                <div className="discrete-slider">
                    {colors.map((c) => (
                        <div 
                            key={c} 
                            className={`discrete-color-swatch ${c === color ? 'selected' : ''}`} 
                            style={{ backgroundColor: c }} 
                        />
                    ))}
                </div>
                <div
                    className="slider-handle"
                    style={{
                        left: `${handlePositionPercent}%`,
                        ['--handle-color' as string]: color,
                    }}
                />
            </div>
        </div>
    );
};

export default ColorSlider; 