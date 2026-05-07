# Logo File Placement

The new Groovely logo image should be placed in this directory (`/public/`) with the filename:

**`logo.png`**

## File Requirements:
- Format: PNG (with transparency preferred)
- The logo component expects the file at: `/logo.png`
- The component will automatically apply animations and styling

## Current Logo Component Features:
- **Floating Animation**: Continuous gentle up/down movement with subtle rotation
- **Glow Effect**: Pulsing drop-shadow that matches the gradient colors (peach/orange to pink/purple)
- **Hover Effects**: Scale and rotate on hover for interactivity
- **Entrance Animation**: Spring-based entrance when `animated={true}` prop is used
- **Responsive**: Size can be controlled via the `size` prop

## Usage:
```tsx
import { Logo } from './components/Logo';

// Basic usage
<Logo size={40} />

// With entrance animation
<Logo size={120} animated={true} />
```

The logo will automatically apply all animations and effects once the image file is in place.





