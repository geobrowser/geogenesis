import * as React from 'react';

import { ColorName, colors } from '~/design-system/theme/colors';

interface Props {
    color?: ColorName;
}

export function Place({ color }: Props) {
    const themeColor = color ? colors.light[color] : 'currentColor';

    return (
        <svg width="16" height="16" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_48936_43744)">
                <rect y="15.5" width="16" height="1" rx="0.5" fill={themeColor} />
                <path d="M2.5 4C2.59398 4 2.79269 4.07676 3.06738 4.45801C3.32635 4.81752 3.57662 5.34631 3.79492 5.98047C4.23083 7.24688 4.5 8.81724 4.5 10C4.5 11.1939 4.2276 11.6011 3.98242 11.7715C3.84534 11.8667 3.66193 11.9285 3.40625 11.9629C3.14625 11.9978 2.85184 12 2.5 12C2.14816 12 1.85375 11.9978 1.59375 11.9629C1.33807 11.9285 1.15466 11.8667 1.01758 11.7715C0.772398 11.6011 0.5 11.1939 0.5 10C0.5 8.81724 0.769166 7.24688 1.20508 5.98047C1.42338 5.34631 1.67365 4.81752 1.93262 4.45801C2.20731 4.07676 2.40602 4 2.5 4Z" stroke={themeColor} />
                <rect x="2" y="12.5" width="1" height="3" fill={themeColor} />
                <path d="M9 1H11C11.8284 1 12.5 1.67157 12.5 2.5V15.5C12.5 15.7761 12.2761 16 12 16H7.5V2.5C7.5 1.67157 8.17157 1 9 1Z" stroke={themeColor} />
                <path d="M9 13.5C9 12.9477 9.44772 12.5 10 12.5C10.5523 12.5 11 12.9477 11 13.5V15.5H9V13.5Z" fill={themeColor} />
                <rect x="9" y="9.5" width="2" height="1" rx="0.5" fill={themeColor} />
                <rect x="9" y="7.5" width="2" height="1" rx="0.5" fill={themeColor} />
                <rect x="9" y="5.5" width="2" height="1" rx="0.5" fill={themeColor} />
                <rect x="9" y="3.5" width="2" height="1" rx="0.5" fill={themeColor} />
            </g>
            <defs>
                <clipPath id="clip0_48936_43744">
                    <rect width="16" height="16" fill="white" transform="translate(0 0.5)" />
                </clipPath>
            </defs>
        </svg>
    );
}
