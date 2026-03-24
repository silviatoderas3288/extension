---
name: design-system
description: Design consistency rules for this project. Use when building any UI component, page, or style. Enforces a single source of truth for colors, typography, spacing, and button types so the entire app can be reskinned by changing one file.
---

## The Rule: One Source of Truth

All colors, font sizes, spacing, border radii, and shadows are defined in **one place only**:
- CSS custom properties in `client/src/index.css` (`:root` block)
- Tailwind config in `client/tailwind.config.js` (references those CSS vars)

**Never** hardcode a hex color, pixel value, or font size anywhere else in the codebase.

---

## CSS Custom Properties (client/src/index.css)

```css
:root {
  /* ─── Brand Colors ─────────────────────────────── */
  --color-primary:        #2563EB;   /* blue-600  — buttons, links, active states */
  --color-primary-hover:  #1D4ED8;   /* blue-700  — hover on primary */
  --color-primary-light:  #DBEAFE;   /* blue-100  — backgrounds, badges */

  --color-secondary:      #7C3AED;   /* violet-600 — accent, tags */
  --color-secondary-light:#EDE9FE;   /* violet-100 */

  --color-success:        #16A34A;   /* green-600  — active/open job badge */
  --color-warning:        #D97706;   /* amber-600  — salary range highlight */
  --color-danger:         #DC2626;   /* red-600    — errors */

  /* ─── Neutrals ──────────────────────────────────── */
  --color-bg:             #F9FAFB;   /* gray-50   — page background */
  --color-surface:        #FFFFFF;   /* white     — cards, panels, sidebar */
  --color-surface-hover:  #F3F4F6;   /* gray-100  — hover on surface */
  --color-border:         #E5E7EB;   /* gray-200  — dividers, borders */
  --color-text:           #111827;   /* gray-900  — primary text */
  --color-text-muted:     #6B7280;   /* gray-500  — secondary text, labels */
  --color-text-subtle:    #9CA3AF;   /* gray-400  — placeholders, hints */

  /* ─── Map UI ─────────────────────────────────────── */
  --color-map-sign-bg:    rgba(15, 23, 42, 0.85);  /* building sign background */
  --color-map-sign-text:  #FFFFFF;
  --color-map-sign-border:#2563EB;

  /* ─── Typography ─────────────────────────────────── */
  --font-sans:   'Inter', system-ui, -apple-system, sans-serif;
  --text-xs:     0.75rem;    /* 12px */
  --text-sm:     0.875rem;   /* 14px */
  --text-base:   1rem;       /* 16px */
  --text-lg:     1.125rem;   /* 18px */
  --text-xl:     1.25rem;    /* 20px */
  --text-2xl:    1.5rem;     /* 24px */

  /* ─── Spacing (use multiples of 4px) ────────────── */
  --space-1:  0.25rem;   /* 4px  */
  --space-2:  0.5rem;    /* 8px  */
  --space-3:  0.75rem;   /* 12px */
  --space-4:  1rem;      /* 16px */
  --space-6:  1.5rem;    /* 24px */
  --space-8:  2rem;      /* 32px */

  /* ─── Shape ──────────────────────────────────────── */
  --radius-sm:   0.375rem;   /* 6px  — badges, chips */
  --radius-md:   0.5rem;     /* 8px  — cards, inputs */
  --radius-lg:   0.75rem;    /* 12px — panels, modals */
  --radius-full: 9999px;     /* pills */

  /* ─── Shadows ────────────────────────────────────── */
  --shadow-sm:  0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md:  0 4px 6px -1px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.10);
  --shadow-lg:  0 10px 15px -3px rgb(0 0 0 / 0.10), 0 4px 6px -4px rgb(0 0 0 / 0.10);

  /* ─── Transitions ────────────────────────────────── */
  --transition-fast:   150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow:   350ms ease;
}
```

---

## Tailwind Config (client/tailwind.config.js)

Reference the CSS vars so Tailwind utility classes (`bg-primary`, `text-muted`, etc.) map to the same values:

```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary:        'var(--color-primary)',
        'primary-hover':'var(--color-primary-hover)',
        'primary-light':'var(--color-primary-light)',
        secondary:      'var(--color-secondary)',
        'secondary-light':'var(--color-secondary-light)',
        success:        'var(--color-success)',
        warning:        'var(--color-warning)',
        danger:         'var(--color-danger)',
        bg:             'var(--color-bg)',
        surface:        'var(--color-surface)',
        'surface-hover':'var(--color-surface-hover)',
        border:         'var(--color-border)',
        text:           'var(--color-text)',
        muted:          'var(--color-text-muted)',
        subtle:         'var(--color-text-subtle)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
      },
      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
};
```

**To retheme the entire app**: change values in `:root` only. Nothing else needs to change.

---

## Button Types

All buttons use one of these four variants. Import from `client/src/components/UI/Button.jsx`.

```jsx
<Button variant="primary">Apply Now</Button>
<Button variant="secondary">Save Job</Button>
<Button variant="outline">Filter</Button>
<Button variant="ghost">Dismiss</Button>
```

### Button.jsx implementation

```jsx
const variants = {
  primary:   'bg-primary hover:bg-primary-hover text-white shadow-sm',
  secondary: 'bg-secondary hover:opacity-90 text-white shadow-sm',
  outline:   'border border-border bg-surface hover:bg-surface-hover text-text',
  ghost:     'bg-transparent hover:bg-surface-hover text-muted',
};

export function Button({ variant = 'primary', className = '', children, ...props }) {
  return (
    <button
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
        transition-colors duration-[var(--transition-fast)] focus:outline-none
        focus:ring-2 focus:ring-primary focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
```

**Never** write a raw `<button>` with inline color styles anywhere in the app. Always use `<Button>`.

---

## Component Rules

1. **Cards** — always use `bg-surface rounded-lg shadow-sm border border-border`
2. **Inputs** — always use `border border-border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary`
3. **Badges** — small pills using `bg-primary-light text-primary text-xs rounded-full px-2 py-0.5`
4. **Section headings** — `text-lg font-semibold text-text`
5. **Labels / secondary text** — `text-sm text-muted`
6. **Dividers** — `border-t border-border`

---

## Page Layout

Every page follows this shell:

```
┌─────────────────────────────────────────────────────┐
│  TopBar  (bg-surface, border-b border-border)        │
├──────────────┬──────────────────────────────────────┤
│              │                                       │
│   Sidebar    │   Main Content Area (map / detail)   │
│  (bg-surface)│   (bg-bg)                             │
│   320px      │   flex-1                              │
│              │                                       │
└──────────────┴──────────────────────────────────────┘
```

On mobile (`< md`): sidebar becomes a bottom sheet. Main content takes full width.

---

## Dark Mode (future)

Dark mode is opt-in. When added, define a `[data-theme="dark"]` block that overrides the same CSS vars:

```css
[data-theme="dark"] {
  --color-bg:      #0F172A;
  --color-surface: #1E293B;
  --color-text:    #F1F5F9;
  /* ...override all vars here... */
}
```

No component code needs to change — they all read from the vars.
