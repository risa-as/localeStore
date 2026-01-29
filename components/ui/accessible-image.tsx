import Image, { ImageProps } from 'next/image';
import React from 'react';

interface AccessibleImageProps extends Omit<ImageProps, 'alt'> {
    alt: string;
    isDecorative?: boolean;
    contextText?: string; // Text adjacent to the image
}

export const AccessibleImage: React.FC<AccessibleImageProps> = ({
    alt,
    isDecorative = false,
    contextText,
    ...props
}) => {
    // Use empty alt if decorative or if alt matches adjacent text exactly
    const shouldUseEmptyAlt = isDecorative || (contextText && alt === contextText);

    return (
        <Image
            alt={shouldUseEmptyAlt ? '' : alt}
            {...props}
        />
    );
};
