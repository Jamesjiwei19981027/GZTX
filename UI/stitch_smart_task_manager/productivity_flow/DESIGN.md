---
name: Productivity Flow
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#424754'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#727785'
  outline-variant: '#c2c6d6'
  surface-tint: '#005ac2'
  primary: '#0058be'
  on-primary: '#ffffff'
  primary-container: '#2170e4'
  on-primary-container: '#fefcff'
  inverse-primary: '#adc6ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#924700'
  on-tertiary: '#ffffff'
  tertiary-container: '#b75b00'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb786'
  on-tertiary-fixed: '#311400'
  on-tertiary-fixed-variant: '#723600'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  headline-md-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  max-width: 1200px
---

## Brand & Style

This design system is built for high-performance task management, focusing on reducing cognitive load and fostering a sense of "Flow." The brand personality is **calm, organized, reliable, and motivating**. It avoids visual clutter to ensure the user's focus remains entirely on their objectives.

The aesthetic follows a **Modern Minimalist** approach. It leverages high-quality typography, generous whitespace, and a card-based architecture to organize information hierarchically. The interface should feel "light" and "airy," using subtle depth to distinguish between the workspace and individual tasks. Every interaction should feel intentional and snappy, reinforcing the feeling of productivity.

## Colors

The palette is centered around **Focus Blue**, a professional and calming hue that signals action and clarity. 

- **Primary (Focus Blue):** Used for primary actions, active states, and focus indicators.
- **Success (Success Green):** Reserved exclusively for completed tasks and positive achievement states.
- **Background (Neutral):** A soft, cool-toned grey (#F9FAFB) is used for the application canvas to reduce eye strain.
- **Surface:** Pure white (#FFFFFF) is used for cards and interactive elements to create a clear "lift" from the background.
- **Typography:** Deep charcoal (#111827) for high-readability headings and a softer grey (#6B7280) for meta-data and secondary labels.

## Typography

The design system utilizes **Inter** for all roles. Inter's tall x-height and clean apertures ensure maximum legibility for task descriptions and checklists, even at smaller sizes.

- **Headlines:** Use Semi-Bold and Bold weights with tighter letter-spacing to create an authoritative, organized structure.
- **Body:** Standardized at 16px for comfortable reading. Use regular weight for task descriptions.
- **Labels:** Used for tags, dates, and status indicators. Small caps or slightly increased letter spacing should be used for `label-sm` to maintain clarity.
- **Scale:** On mobile devices, large display headers scale down to `headline-md-mobile` to ensure titles do not wrap excessively.

## Layout & Spacing

This design system uses a **Fixed Grid** approach for desktop productivity views to prevent task lists from becoming too wide to read. 

- **Layout Model:** A centered 12-column grid with a 1200px max-width. For sidebars (navigation), use a fixed 280px width, while the main content area remains fluid within the remaining grid.
- **Spacing Rhythm:** Based on a 4px baseline. Most components use 16px (md) for internal padding and 24px (lg) for external margins between groups.
- **Mobile Adaptivity:** At the 768px breakpoint, margins shrink to 16px and the grid collapses to a single column. All cards become full-width to maximize space for task text.

## Elevation & Depth

Depth is used sparingly to define functional layers. This design system avoids heavy shadows, opting for **Ambient Shadows** that feel integrated into the background.

- **Level 0 (Background):** The Neutral (#F9FAFB) foundation. No shadow.
- **Level 1 (Cards/Lists):** Surface white with a very soft, diffused shadow (0px 2px 4px rgba(0,0,0,0.05)) and a subtle 1px border (#E5E7EB).
- **Level 2 (Active/Hover Task):** When interacting with a task, the shadow deepens (0px 10px 15px rgba(0,0,0,0.1)) to suggest it is being "lifted" for movement or editing.
- **Level 3 (Modals/Popovers):** Highest elevation with a broad, soft shadow to focus user attention on the prompt or task detail view.

## Shapes

The shape language is **Rounded**, striking a balance between professional precision and an approachable, friendly feel. 

- **Standard Elements:** Buttons, input fields, and small chips use a 0.5rem (8px) radius.
- **Task Cards:** Use a larger `rounded-lg` (1rem / 16px) radius to create a soft, distinct container for information.
- **Selection Indicators:** Checkboxes use a slightly rounded corner (4px) rather than sharp corners to match the overall system softness.

## Components

- **Buttons:** Primary buttons use Focus Blue with white text. Hover states should darken the blue slightly. Use "ghost" button variants (border only) for secondary actions like "Add Subtask."
- **Task Cards:** The core unit. Features a white background, 16px padding, and 16px corner radius. Include a vertical "drag handle" on the left for reordering.
- **Checkboxes:** Large (20px x 20px) targets. When checked, the box fills with Success Green and triggers a strikethrough on the associated task label.
- **Chips/Tags:** Used for categorization (e.g., "Work," "Personal"). Use a light tint of the primary color with 12px font and a pill-shape radius.
- **Input Fields:** Clean, minimal styling with a 1px border. Focus state is indicated by a 2px Focus Blue outer ring.
- **Progress Bar:** A thin (4px) bar at the top of task lists using Success Green to visualize completion percentage.
- **Floating Action Button (FAB):** For mobile, a 56px circular Focus Blue button in the bottom right corner for "New Task."